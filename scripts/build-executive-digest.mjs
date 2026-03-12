import fs from "node:fs";
import path from "node:path";

const HISTORY_DIR = ".reviewos/history";
const LEDGER = ".reviewos/review-debt.json";
const QUEUE_CSV = "docs/reviewer-queue.csv";
const OUT_MD = "docs/executive-weekly-digest.md";

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function safeReadJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function avg(nums) {
  if (!nums.length) return 0;
  return nums.reduce((sum, value) => sum + value, 0) / nums.length;
}

function collectRuns() {
  if (!fs.existsSync(HISTORY_DIR)) return [];
  const files = fs.readdirSync(HISTORY_DIR).filter((file) => file.endsWith(".json"));
  const runs = [];
  for (const file of files) {
    const full = path.join(HISTORY_DIR, file);
    const rows = safeReadJson(full, []);
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      if (row && typeof row === "object") runs.push(row);
    }
  }
  return runs.sort((a, b) => String(a.timestamp || "").localeCompare(String(b.timestamp || "")));
}

function parseQueueCsv() {
  if (!fs.existsSync(QUEUE_CSV)) return [];
  const lines = fs.readFileSync(QUEUE_CSV, "utf8").trim().split(/\r?\n/);
  if (lines.length <= 1) return [];
  return lines.slice(1).map((line) => {
    const cols = line.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/);
    return {
      kind: cols[0] || "",
      reviewer: cols[1] || "",
      assigned: Number(cols[2] || 0),
      pending: Number(cols[3] || 0),
      weeklyLoad: Number(cols[4] || 0),
      weeklyCap: Number(cols[5] || 0),
      utilization: Number(cols[6] || 0),
      totalCount: Number(cols[7] || 0),
      fairnessScore: Number(cols[8] || 0),
    };
  });
}

function buildTable(headers, rows) {
  if (!rows.length) return "No data yet.";
  const head = `| ${headers.join(" | ")} |`;
  const sep = `|${headers.map(() => "---").join("|")}|`;
  const body = rows.map((row) => `| ${row.join(" | ")} |`).join("\n");
  return `${head}\n${sep}\n${body}`;
}

function splitWindows(runs) {
  const latestTs = runs.at(-1)?.timestamp ? new Date(runs.at(-1).timestamp) : new Date();
  const currentStart = new Date(latestTs.getTime() - 7 * 24 * 60 * 60 * 1000);
  const previousStart = new Date(latestTs.getTime() - 14 * 24 * 60 * 60 * 1000);
  const current = runs.filter((run) => new Date(run.timestamp || 0) > currentStart);
  const previous = runs.filter((run) => {
    const ts = new Date(run.timestamp || 0);
    return ts > previousStart && ts <= currentStart;
  });
  return { latestTs, current, previous };
}

function summarizeWindow(runs) {
  const readiness = runs.map((run) => Number(run.mergeReadiness || 0));
  const latencies = runs
    .map((run) => run.reviewerLatency?.firstReviewLatencyHours)
    .filter((value) => value != null)
    .map((value) => Number(value));
  const criticalRuns = runs.filter((run) => (run.findings || []).some((finding) => finding.severity === "critical")).length;
  const debtOpen = runs.at(-1)?.debtLedger?.openCount ?? 0;
  return {
    runs: runs.length,
    readiness: avg(readiness),
    latency: avg(latencies),
    criticalRate: runs.length ? (criticalRuns / runs.length) * 100 : 0,
    debtOpen,
  };
}

function deltaString(current, previous, digits = 1, suffix = "") {
  if (!Number.isFinite(previous) || previous === 0) return "n/a";
  const delta = current - previous;
  return `${delta > 0 ? "+" : ""}${delta.toFixed(digits)}${suffix}`;
}

function topRisks(runs, ledger) {
  const counts = new Map();
  for (const run of runs) {
    for (const finding of run.findings || []) {
      if (!["critical", "warning"].includes(String(finding.severity || ""))) continue;
      const key = `${finding.lens || "unknown"}|${finding.message || ""}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  for (const entry of ledger.entries || []) {
    if (entry.status !== "open") continue;
    const key = `${entry.lens || "unknown"}|${entry.message || ""}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([key, count]) => {
      const [lens, message] = key.split("|");
      return { lens, message, count };
    })
    .sort((a, b) => b.count - a.count || a.lens.localeCompare(b.lens))
    .slice(0, 5);
}

function main() {
  ensureDir("docs");
  const runs = collectRuns();
  const { latestTs, current, previous } = splitWindows(runs);
  const currentSummary = summarizeWindow(current);
  const previousSummary = summarizeWindow(previous);
  const ledger = safeReadJson(LEDGER, { entries: [] });
  const openDebt = (ledger.entries || []).filter((entry) => entry.status === "open");
  const queueRows = parseQueueCsv()
    .sort((a, b) => b.pending - a.pending || b.utilization - a.utilization || a.reviewer.localeCompare(b.reviewer))
    .slice(0, 5);
  const risks = topRisks(current, ledger);

  const markdown = `# Executive Weekly Digest

Generated: ${new Date().toISOString()}
Window ending: ${latestTs.toISOString().slice(0, 10)}

## Executive Summary

- Review runs this week: ${currentSummary.runs}
- Average merge readiness: ${currentSummary.readiness.toFixed(1)} (${deltaString(currentSummary.readiness, previousSummary.readiness)})
- Mean time to first review: ${currentSummary.latency ? `${currentSummary.latency.toFixed(1)}h` : "N/A"} (${deltaString(currentSummary.latency, previousSummary.latency, 1, "h")})
- Critical-rate by PR: ${currentSummary.criticalRate.toFixed(1)}% (${deltaString(currentSummary.criticalRate, previousSummary.criticalRate, 1, "%")})
- Open review debt: ${openDebt.length} (${deltaString(openDebt.length, previousSummary.debtOpen, 0)})

## Week-over-Week Metrics

${buildTable(
  ["Metric", "Current Week", "Previous Week", "Delta"],
  [
    ["Runs", String(currentSummary.runs), String(previousSummary.runs), deltaString(currentSummary.runs, previousSummary.runs, 0)],
    ["Avg Merge Readiness", currentSummary.readiness.toFixed(1), previousSummary.readiness.toFixed(1), deltaString(currentSummary.readiness, previousSummary.readiness)],
    ["Mean First Review Latency (h)", currentSummary.latency.toFixed(1), previousSummary.latency.toFixed(1), deltaString(currentSummary.latency, previousSummary.latency, 1, "h")],
    ["Critical Rate (%)", currentSummary.criticalRate.toFixed(1), previousSummary.criticalRate.toFixed(1), deltaString(currentSummary.criticalRate, previousSummary.criticalRate, 1, "%")],
    ["Open Debt", String(openDebt.length), String(previousSummary.debtOpen), deltaString(openDebt.length, previousSummary.debtOpen, 0)],
  ]
)}

## Reviewer Load Watchlist

${buildTable(
  ["Reviewer", "Pending", "Utilization", "Fairness", "Total Assignments"],
  queueRows.map((row) => [row.reviewer, String(row.pending), `${row.utilization}%`, String(row.fairnessScore), String(row.totalCount)])
)}

## Top Risks

${risks.length ? risks.map((risk) => `- **${risk.lens}** (${risk.count}): ${risk.message}`).join("\n") : "No elevated risks detected."}

## Slack-ready Summary

\`\`\`text
ReviewOS weekly digest
- Runs: ${currentSummary.runs}
- Avg readiness: ${currentSummary.readiness.toFixed(1)}
- Avg first review latency: ${currentSummary.latency ? `${currentSummary.latency.toFixed(1)}h` : "N/A"}
- Critical rate: ${currentSummary.criticalRate.toFixed(1)}%
- Open debt: ${openDebt.length}
- Top risk: ${risks[0] ? `${risks[0].lens} - ${risks[0].message}` : "none"}
\`\`\`
`;

  fs.writeFileSync(OUT_MD, markdown);
  console.log(`Executive digest written: ${OUT_MD}`);
}

main();
