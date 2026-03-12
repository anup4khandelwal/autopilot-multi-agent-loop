import fs from "node:fs";
import path from "node:path";

const HISTORY_DIR = ".reviewos/history";
const OUTPUT = "docs/review-dashboard.md";
const OUTPUT_CSV = "docs/review-dashboard.csv";
const OUTPUT_REPO_CSV = "docs/repo-baseline.csv";
const OUTPUT_CONFIDENCE_CSV = "docs/review-confidence.csv";
const OUTPUT_LATENCY_CSV = "docs/reviewer-latency.csv";
const OUTPUT_HEATMAP_CSV = "docs/change-risk-heatmap.csv";
const OUTPUT_HEATMAP_JSON = "docs/change-risk-heatmap.json";
const OUTPUT_DRIFT_CSV = "docs/policy-drift.csv";

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

function stddev(nums) {
  if (nums.length < 2) return 0;
  const m = avg(nums);
  const variance = nums.reduce((s, n) => s + (n - m) * (n - m), 0) / (nums.length - 1);
  return Math.sqrt(variance);
}

function ci95(nums) {
  const n = nums.length;
  if (!n) return { mean: 0, lower: 0, upper: 0, margin: 0, n: 0 };
  const mean = avg(nums);
  if (n === 1) return { mean, lower: mean, upper: mean, margin: 0, n };
  const se = stddev(nums) / Math.sqrt(n);
  const margin = 1.96 * se;
  return { mean, lower: mean - margin, upper: mean + margin, margin, n };
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

function parseRepoFromSource(source) {
  const s = String(source || "");
  const match = s.match(/^(.*?)__pr-\d+\.json$/);
  if (!match) return "unknown/repo";
  return match[1].replace(/__/g, "/");
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
  const latencySeries = [];
  const driftRows = [];
  const heatmap = new Map();

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
    if (r.reviewerLatency?.firstReviewLatencyHours != null) {
      const lat = Number(r.reviewerLatency.firstReviewLatencyHours);
      if (Number.isFinite(lat)) latencySeries.push(lat);
    }
    if (r.policyDrift?.driftRows) {
      for (const d of r.policyDrift.driftRows) {
        driftRows.push({
          timestamp: r.timestamp || "",
          key: d.key,
          configured: Number(d.configured || 0),
          effective: Number(d.effective || 0),
          delta: Number(d.delta || 0),
        });
      }
    }
    const files = Array.isArray(r.filesChanged) ? r.filesChanged : [];
    if (files.length) {
      const sev = {
        critical: findings.filter((f) => f.severity === "critical").length,
        warning: findings.filter((f) => f.severity === "warning").length,
      };
      for (const p of files) {
        const group = p.split("/").slice(0, 2).join("/") || p;
        const key = group || "root";
        if (!heatmap.has(key)) heatmap.set(key, { path: key, critical: 0, warning: 0, totalRuns: 0 });
        const row = heatmap.get(key);
        row.critical += sev.critical;
        row.warning += sev.warning;
        row.totalRuns += 1;
      }
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
  const avgLatency = avg(latencySeries);
  const readinessCi = ci95(readiness);
  const engineeringCi = ci95(lens.engineering);
  const productCi = ci95(lens.product);
  const designCi = ci95(lens.design);
  const securityCi = ci95(lens.security);
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
  const repos = new Map();
  for (const r of runs) {
    const repo = parseRepoFromSource(r._source);
    if (!repos.has(repo)) {
      repos.set(repo, {
        runs: 0,
        readiness: [],
        critical: 0,
        warning: 0,
      });
    }
    const row = repos.get(repo);
    row.runs += 1;
    row.readiness.push(Number(r.mergeReadiness || 0));
    for (const f of r.findings || []) {
      if (f.severity === "critical") row.critical += 1;
      if (f.severity === "warning") row.warning += 1;
    }
  }
  const repoRows = [...repos.entries()]
    .map(([repo, data]) => ({
      repo,
      runs: data.runs,
      readinessAvg: avg(data.readiness),
      critical: data.critical,
      warning: data.warning,
    }))
    .sort((a, b) => b.readinessAvg - a.readinessAvg);
  const heatmapRows = [...heatmap.values()]
    .map((r) => ({ ...r, riskScore: r.critical * 3 + r.warning }))
    .sort((a, b) => b.riskScore - a.riskScore)
    .slice(0, 12);
  const driftRecent = driftRows.slice(-20).reverse();

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

## Confidence Bands (95%)

${buildTable(
  ["Metric", "Mean", "Lower", "Upper", "Margin", "N"],
  [
    ["Merge Readiness", readinessCi.mean.toFixed(2), readinessCi.lower.toFixed(2), readinessCi.upper.toFixed(2), readinessCi.margin.toFixed(2), String(readinessCi.n)],
    ["Engineering", engineeringCi.mean.toFixed(2), engineeringCi.lower.toFixed(2), engineeringCi.upper.toFixed(2), engineeringCi.margin.toFixed(2), String(engineeringCi.n)],
    ["Product", productCi.mean.toFixed(2), productCi.lower.toFixed(2), productCi.upper.toFixed(2), productCi.margin.toFixed(2), String(productCi.n)],
    ["Design", designCi.mean.toFixed(2), designCi.lower.toFixed(2), designCi.upper.toFixed(2), designCi.margin.toFixed(2), String(designCi.n)],
    ["Security", securityCi.mean.toFixed(2), securityCi.lower.toFixed(2), securityCi.upper.toFixed(2), securityCi.margin.toFixed(2), String(securityCi.n)],
  ]
)}

## Finding Volume

- Critical: ${criticalCount}
- Warning: ${warningCount}
- Info: ${infoCount}

## Reviewer Coverage Metrics

- Runs with missing required reviewer coverage: ${reviewerMissRuns}
- Total missing reviewer slots (users + teams): ${reviewerMissCount}
- Auto-request attempts: ${autoRequestAttempts}
- Auto-request success rate: ${autoRequestRate.toFixed(1)}%
- Mean time to first review (hours): ${avgLatency ? avgLatency.toFixed(2) : "N/A"}

## Merge Readiness Trend (Recent 10)

${readinessBars || "No data yet."}

## Readiness Anomalies

${anomalies.length ? buildTable(["Timestamp", "PR", "Baseline", "Current", "Drop"], anomalies.slice(-8).reverse().map((a) => [String(a.timestamp).slice(0, 19), String(a.pr), a.baseline.toFixed(1), a.current.toFixed(1), a.drop.toFixed(1)])) : "No anomalies detected."}

## Multi-Repo Baseline Compare

${repoRows.length ? buildTable(["Repository", "Runs", "Avg Readiness", "Critical Findings", "Warnings"], repoRows.map((r) => [r.repo, String(r.runs), r.readinessAvg.toFixed(1), String(r.critical), String(r.warning)])) : "No repository baseline data yet."}

## Change-Risk Heatmap (Top Paths)

${heatmapRows.length ? buildTable(["Path", "Risk Score", "Critical", "Warning", "Runs"], heatmapRows.map((r) => [r.path, String(r.riskScore), String(r.critical), String(r.warning), String(r.totalRuns)])) : "No path heatmap data yet."}

## Policy Drift (Recent)

${driftRecent.length ? buildTable(["Timestamp", "Threshold", "Configured", "Effective", "Delta"], driftRecent.map((d) => [String(d.timestamp).slice(0, 19), d.key, d.configured.toFixed(0), d.effective.toFixed(0), d.delta.toFixed(0)])) : "No policy drift data yet."}

## Critical by Path Policy Rule

${buildTable(["Rule", "Critical Count"], topCriticalPaths.map(([rule, count]) => [rule, String(count)]))}

## Top Recurring Findings

${topFindings.length ? buildTable(["Severity", "Lens", "Count", "Finding"], topFindings.map((f) => [f.severity, f.lens, String(f.count), f.message.replace(/\|/g, "\\|")])) : "No findings recorded yet."}

## Notes

- Data source: \.reviewos/history/*.json
- This dashboard summarizes historical review runs across PRs.
- CSV export: \`${OUTPUT_CSV}\`
- Repo baseline CSV: \`${OUTPUT_REPO_CSV}\`
- Confidence CSV: \`${OUTPUT_CONFIDENCE_CSV}\`
- Latency CSV: \`${OUTPUT_LATENCY_CSV}\`
- Heatmap CSV/JSON: \`${OUTPUT_HEATMAP_CSV}\`, \`${OUTPUT_HEATMAP_JSON}\`
- Policy drift CSV: \`${OUTPUT_DRIFT_CSV}\`
`;
}

function writeRepoCsv(runs) {
  const repos = new Map();
  for (const r of runs) {
    const repo = parseRepoFromSource(r._source);
    if (!repos.has(repo)) repos.set(repo, { runs: 0, readiness: [], critical: 0, warning: 0, info: 0 });
    const row = repos.get(repo);
    row.runs += 1;
    row.readiness.push(Number(r.mergeReadiness || 0));
    for (const f of r.findings || []) {
      if (f.severity === "critical") row.critical += 1;
      else if (f.severity === "warning") row.warning += 1;
      else row.info += 1;
    }
  }
  const lines = ["repository,runs,avg_readiness,critical,warning,info"];
  for (const [repo, data] of repos.entries()) {
    lines.push(`${repo},${data.runs},${avg(data.readiness).toFixed(1)},${data.critical},${data.warning},${data.info}`);
  }
  fs.writeFileSync(OUTPUT_REPO_CSV, `${lines.join("\n")}\n`);
}

function writeConfidenceCsv(runs) {
  const readiness = runs.map((r) => Number(r.mergeReadiness) || 0);
  const engineering = runs.map((r) => Number(r.scores?.engineering) || 0);
  const product = runs.map((r) => Number(r.scores?.product) || 0);
  const design = runs.map((r) => Number(r.scores?.design) || 0);
  const security = runs.map((r) => Number(r.scores?.security) || 0);

  const rows = [
    ["merge_readiness", ci95(readiness)],
    ["engineering", ci95(engineering)],
    ["product", ci95(product)],
    ["design", ci95(design)],
    ["security", ci95(security)],
  ];
  const lines = ["metric,mean,lower,upper,margin,n"];
  for (const [metric, c] of rows) {
    lines.push(`${metric},${c.mean.toFixed(4)},${c.lower.toFixed(4)},${c.upper.toFixed(4)},${c.margin.toFixed(4)},${c.n}`);
  }
  fs.writeFileSync(OUTPUT_CONFIDENCE_CSV, `${lines.join("\n")}\n`);
}

function writeLatencyCsv(runs) {
  const lines = ["timestamp,pr,first_review_latency_hours"];
  for (const r of runs) {
    const lat = r.reviewerLatency?.firstReviewLatencyHours;
    if (lat == null) continue;
    lines.push(`${r.timestamp || ""},${r.pr || ""},${Number(lat).toFixed(2)}`);
  }
  fs.writeFileSync(OUTPUT_LATENCY_CSV, `${lines.join("\n")}\n`);
}

function writeHeatmapExports(runs) {
  const map = new Map();
  for (const r of runs) {
    const findings = Array.isArray(r.findings) ? r.findings : [];
    const critical = findings.filter((f) => f.severity === "critical").length;
    const warning = findings.filter((f) => f.severity === "warning").length;
    const files = Array.isArray(r.filesChanged) ? r.filesChanged : [];
    for (const p of files) {
      const key = String(p || "").split("/").slice(0, 2).join("/") || "root";
      if (!map.has(key)) map.set(key, { path: key, critical: 0, warning: 0, runs: 0 });
      const row = map.get(key);
      row.critical += critical;
      row.warning += warning;
      row.runs += 1;
    }
  }
  const rows = [...map.values()]
    .map((r) => ({ ...r, risk_score: r.critical * 3 + r.warning }))
    .sort((a, b) => b.risk_score - a.risk_score);
  const csv = ["path,risk_score,critical,warning,runs", ...rows.map((r) => `${r.path},${r.risk_score},${r.critical},${r.warning},${r.runs}`)];
  fs.writeFileSync(OUTPUT_HEATMAP_CSV, `${csv.join("\n")}\n`);
  fs.writeFileSync(OUTPUT_HEATMAP_JSON, `${JSON.stringify(rows, null, 2)}\n`);
}

function writePolicyDriftCsv(runs) {
  const lines = ["timestamp,pr,threshold,configured,effective,delta"];
  for (const r of runs) {
    const rows = r.policyDrift?.driftRows || [];
    for (const d of rows) {
      lines.push(
        `${r.timestamp || ""},${r.pr || ""},${d.key || ""},${Number(d.configured || 0)},${Number(d.effective || 0)},${Number(d.delta || 0)}`
      );
    }
  }
  fs.writeFileSync(OUTPUT_DRIFT_CSV, `${lines.join("\n")}\n`);
}

function main() {
  ensureDir("docs");
  const runs = collectRuns();
  const content = buildDashboard(runs);
  fs.writeFileSync(OUTPUT, content);
  writeCsv(runs);
  writeRepoCsv(runs);
  writeConfidenceCsv(runs);
  writeLatencyCsv(runs);
  writeHeatmapExports(runs);
  writePolicyDriftCsv(runs);
  console.log(`Dashboard written: ${OUTPUT}`);
  console.log(`Dashboard CSV written: ${OUTPUT_CSV}`);
  console.log(`Repo baseline CSV written: ${OUTPUT_REPO_CSV}`);
  console.log(`Confidence CSV written: ${OUTPUT_CONFIDENCE_CSV}`);
  console.log(`Latency CSV written: ${OUTPUT_LATENCY_CSV}`);
  console.log(`Heatmap CSV written: ${OUTPUT_HEATMAP_CSV}`);
  console.log(`Heatmap JSON written: ${OUTPUT_HEATMAP_JSON}`);
  console.log(`Policy drift CSV written: ${OUTPUT_DRIFT_CSV}`);
  console.log(`Runs analyzed: ${runs.length}`);
}

main();
