import fs from "node:fs";
import path from "node:path";

const HISTORY_DIR = ".reviewos/history";
const OUTPUT = "docs/review-dashboard.md";

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

  for (const r of runs) {
    const findings = Array.isArray(r.findings) ? r.findings : [];
    for (const f of findings) {
      if (f.severity === "critical") criticalCount += 1;
      else if (f.severity === "warning") warningCount += 1;
      else infoCount += 1;

      const key = findingKey(f);
      findingFreq.set(key, (findingFreq.get(key) || 0) + 1);
    }
  }

  const topFindings = [...findingFreq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([k, count]) => {
      const [severity, lensName, message] = k.split("|");
      return { severity, lens: lensName, message, count };
    });

  const lastRun = runs.at(-1);
  const generatedAt = new Date().toISOString();

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

## Finding Volume

- Critical: ${criticalCount}
- Warning: ${warningCount}
- Info: ${infoCount}

## Top Recurring Findings

${topFindings.length ? "| Severity | Lens | Count | Finding |\n|---|---|---:|---|\n" + topFindings.map((f) => `| ${f.severity} | ${f.lens} | ${f.count} | ${f.message.replace(/\|/g, "\\|")} |`).join("\n") : "No findings recorded yet."}

## Notes

- Data source: \.reviewos/history/*.json
- This dashboard summarizes historical review runs across PRs.
`;
}

function main() {
  ensureDir("docs");
  const runs = collectRuns();
  const content = buildDashboard(runs);
  fs.writeFileSync(OUTPUT, content);
  console.log(`Dashboard written: ${OUTPUT}`);
  console.log(`Runs analyzed: ${runs.length}`);
}

main();
