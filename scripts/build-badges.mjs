import fs from "node:fs";
import path from "node:path";

const HISTORY_DIR = ".reviewos/history";
const OUT_DIR = "docs/badges";

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function avg(nums) {
  if (!nums.length) return 0;
  return nums.reduce((s, n) => s + n, 0) / nums.length;
}

function loadRuns() {
  if (!fs.existsSync(HISTORY_DIR)) return [];
  const runs = [];
  for (const file of fs.readdirSync(HISTORY_DIR)) {
    if (!file.endsWith(".json")) continue;
    try {
      const parsed = JSON.parse(fs.readFileSync(path.join(HISTORY_DIR, file), "utf8"));
      if (Array.isArray(parsed)) {
        for (const row of parsed) {
          if (row && typeof row === "object") runs.push(row);
        }
      }
    } catch {
      // ignore malformed files
    }
  }
  return runs;
}

function badgeColor(value, thresholds) {
  if (value >= thresholds.good) return "brightgreen";
  if (value >= thresholds.warn) return "yellow";
  return "red";
}

function writeBadge(name, payload) {
  fs.writeFileSync(path.join(OUT_DIR, `${name}.json`), `${JSON.stringify(payload, null, 2)}\n`);
}

function main() {
  ensureDir(OUT_DIR);
  const runs = loadRuns();
  const readiness = avg(runs.map((r) => Number(r.mergeReadiness || 0)));
  const latencies = runs
    .map((r) => r.reviewerLatency?.firstReviewLatencyHours)
    .filter((x) => x != null)
    .map((x) => Number(x));
  const latency = avg(latencies);
  const criticalRate =
    runs.length === 0
      ? 0
      : (runs.filter((r) => (r.findings || []).some((f) => f.severity === "critical")).length / runs.length) * 100;

  writeBadge("readiness", {
    schemaVersion: 1,
    label: "readiness",
    message: `${Math.round(readiness)}/100`,
    color: badgeColor(readiness, { good: 85, warn: 70 }),
    cacheSeconds: 3600,
  });

  writeBadge("latency", {
    schemaVersion: 1,
    label: "first review",
    message: latencies.length ? `${latency.toFixed(1)}h` : "n/a",
    color: latencies.length ? (latency <= 12 ? "brightgreen" : latency <= 24 ? "yellow" : "red") : "lightgrey",
    cacheSeconds: 3600,
  });

  writeBadge("critical-rate", {
    schemaVersion: 1,
    label: "critical rate",
    message: `${criticalRate.toFixed(1)}%`,
    color: criticalRate <= 10 ? "brightgreen" : criticalRate <= 25 ? "yellow" : "red",
    cacheSeconds: 3600,
  });

  console.log(`Badges written: ${OUT_DIR}`);
}

main();
