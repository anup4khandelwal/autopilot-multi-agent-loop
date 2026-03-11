import fs from "node:fs";
import path from "node:path";

const HISTORY_DIR = ".reviewos/history";
const OUTPUT = "docs/review-dashboard.md";
const OUTPUT_CSV = "docs/review-dashboard.csv";

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function safeReadJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function avg(nums) {
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function collectRuns() {
  if (!fs.existsSync(HISTORY_DIR)) return [];
  const files = fs.readdirSync(HISTORY_DIR).filter((f) => f.endsWith(".json"));
  const runs = [];

  for (const file of files) {
    const full = path.join(HISTORY_DIR, file);
    const data = safeReadJson(full);
    if (!Array.isArray(data)) continue;

    for (const entry of data) {
      if (!entry || typeof entry !== "object") continue;
      runs.push({ ...entry, _source: file });
    }
  }

  return runs.sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));
}

function findingKey(f) {
  return `${f?.severity || "unknown"}|${f?.lens || "unknown"}|${f?.message || "unknown"}`;
}

function extractPathRuleFromMessage(msg) {
  const text = String(msg || "");
  const m = text.match(/Rule '([^']+)'(?: matched|:| requires)/);
  return m ? m[1] : null;
}

function buildTable(headers, rows) {
  if (!rows.length) return "No data yet.";
  const head = `| ${headers.join(" | ")} |`;
  const sep = `|${headers.map(() => "---").join("|")}|`;
  const body = rows.map((r) => `| ${r.join(" | ")} |`).join("\n");
  return `${head}\n${sep}\n${body}`;
}

function bar(value, max = 100, width = 20) {
  const safe = Math.max(0, Math.min(max, Number(value) || 0));
  const filled = Math.round((safe / max) * width);
  return `${"█".repeat(filled)}${"░".repeat(width - filled)} ${safe.toFixed(1)}`;
}

function writeCsv(runs) {
  const header = [
    "timestamp",
    "pr",
    "merge_readiness",
    "engineering",
    "product",
    "design",
    "security",
    "critical",
    "warning",
    "info",
    "missing_reviewers",
  ];
  const lines = [header.join(",")];
  for (const r of runs) {
    const findings = Array.isArray(r.findings) ? r.findings : [];
    const critical = findings.filter((f) => f.severity === "critical").length;
    const warning = findings.filter((f) => f.severity === "warning").length;
    const info = findings.filter((f) => f.severity === "info").length;
    const missing = (r.requiredCoverage?.missing?.users?.length || 0) + (r.requiredCoverage?.missing?.teams?.length || 0);
    const row = [
      r.timestamp || "",
      String(r.pr || ""),
      Number(r.mergeReadiness || 0),
      Number(r.scores?.engineering || 0),
      Number(r.scores?.product || 0),
      Number(r.scores?.design || 0),
      Number(r.scores?.security || 0),
      critical,
      warning,
      info,
      missing,
    ];
    lines.push(row.join(","));
  }
  fs.writeFileSync(OUTPUT_CSV, `${lines.join("\n")}\n`);
}

function buildDashboard(runs) {
  const totalRuns = runs.length;
  const readiness = runs.map((r) => Number(r.mergeReadiness) || 0);

  const lens = {
    engineering: runs.map((r) => Number(r.scores?.engineering) || 0),
    product: runs.map((r) => Number(r.scores?.product) || 0),
    design: runs.map((r) => Number(r.scores?.design) || 0),
    security: runs.map((r) => Number(r.scores?.security) || 0),
  };

  let criticalCount = 0;
  let warningCount = 0;
  let infoCount = 0;
  const findingFreq = new Map();

  let reviewerMissCount = 0;
  let reviewerMissRuns = 0;
  let autoRequestAttempts = 0;
  let autoRequestSuccess = 0;

  const criticalPathCounts = new Map();

  for (const r of runs) {
    const findings = Array.isArray(r.findings) ? r.findings : [];
    for (const f of findings) {
      if (f.severity === "critical") criticalCount += 1;
      else if (f.severity === "warning") warningCount += 1;
      else infoCount += 1;

      if (f.severity === "critical" && f.lens === "PathPolicy") {
        const ruleName = extractPathRuleFromMessage(f.message) || "path_policy_unknown";
        criticalPathCounts.set(ruleName, (criticalPathCounts.get(ruleName) || 0) + 1);
      }

      const key = findingKey(f);
      findingFreq.set(key, (findingFreq.get(key) || 0) + 1);
    }

    const missingUsers = r.requiredCoverage?.missing?.users || [];
    const missingTeams = r.requiredCoverage?.missing?.teams || [];
    const missingTotal = missingUsers.length + missingTeams.length;
    reviewerMissCount += missingTotal;
    if (missingTotal > 0) reviewerMissRuns += 1;

    if (r.reviewerRouting?.autoRequestAttempted) {
      autoRequestAttempts += 1;
      if (r.reviewerRouting?.requestedViaRequired) autoRequestSuccess += 1;
    }
  }

  const topFindings = [...findingFreq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([k, count]) => {
      const [severity, lensName, message] = k.split("|");
      return { severity, lens: lensName, message, count };
    });

  const topCriticalPaths = [...criticalPathCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  const lastRun = runs.at(-1);
  const generatedAt = new Date().toISOString();

  const autoRequestRate = autoRequestAttempts ? (autoRequestSuccess / autoRequestAttempts) * 100 : 0;
  const recent = runs.slice(-10).reverse();
  const readinessBars = recent
    .map((r) => `- ${(r.timestamp || "").slice(0, 19)} PR#${r.pr}: ${bar(Number(r.mergeReadiness || 0))}`)
    .join("\n");
  const anomalies = [];
  for (let i = 3; i < runs.length; i += 1) {
    const baselineItems = [runs[i - 1], runs[i - 2], runs[i - 3]].map((x) => Number(x.mergeReadiness || 0));
    const baseline = avg(baselineItems);
    const current = Number(runs[i].mergeReadiness || 0);
    const drop = baseline - current;
    if (drop >= 20) {
      anomalies.push({
        timestamp: runs[i].timestamp || "",
        pr: runs[i].pr || "",
        baseline,
        current,
        drop,
      });
    }
  }

  return `# ReviewOS Trend Dashboard

Generated: ${generatedAt}

## Summary

- Total review runs: ${totalRuns}
- Average merge readiness: ${avg(readiness).toFixed(1)}
- Last run timestamp: ${lastRun?.timestamp || "N/A"}

## Lens Averages

| Lens | Average Score |
|---|---:|
| Engineering | ${avg(lens.engineering).toFixed(1)} |
| Product | ${avg(lens.product).toFixed(1)} |
| Design | ${avg(lens.design).toFixed(1)} |
| Security | ${avg(lens.security).toFixed(1)} |

## Lens Visuals

- Engineering: ${bar(avg(lens.engineering))}
- Product: ${bar(avg(lens.product))}
- Design: ${bar(avg(lens.design))}
- Security: ${bar(avg(lens.security))}

## Finding Volume

- Critical: ${criticalCount}
- Warning: ${warningCount}
- Info: ${infoCount}

## Reviewer Coverage Metrics

- Runs with missing required reviewer coverage: ${reviewerMissRuns}
- Total missing reviewer slots (users + teams): ${reviewerMissCount}
- Auto-request attempts: ${autoRequestAttempts}
- Auto-request success rate: ${autoRequestRate.toFixed(1)}%

## Merge Readiness Trend (Recent 10)

${readinessBars || "No data yet."}

## Readiness Anomalies

${anomalies.length ? buildTable(["Timestamp", "PR", "Baseline", "Current", "Drop"], anomalies.slice(-8).reverse().map((a) => [String(a.timestamp).slice(0, 19), String(a.pr), a.baseline.toFixed(1), a.current.toFixed(1), a.drop.toFixed(1)])) : "No anomalies detected."}

## Critical by Path Policy Rule

${buildTable(["Rule", "Critical Count"], topCriticalPaths.map(([rule, count]) => [rule, String(count)]))}

## Top Recurring Findings

${topFindings.length ? buildTable(["Severity", "Lens", "Count", "Finding"], topFindings.map((f) => [f.severity, f.lens, String(f.count), f.message.replace(/\|/g, "\\|")])) : "No findings recorded yet."}

## Notes

- Data source: \.reviewos/history/*.json
- This dashboard summarizes historical review runs across PRs.
- CSV export: \`${OUTPUT_CSV}\`
`;
}

function main() {
  ensureDir("docs");
  const runs = collectRuns();
  const content = buildDashboard(runs);
  fs.writeFileSync(OUTPUT, content);
  writeCsv(runs);
  console.log(`Dashboard written: ${OUTPUT}`);
  console.log(`Dashboard CSV written: ${OUTPUT_CSV}`);
  console.log(`Runs analyzed: ${runs.length}`);
}

main();
