import fs from "node:fs";

const INPUT = "docs/review-dashboard.md";
const CSV = "docs/review-dashboard.csv";
const REPO_CSV = "docs/repo-baseline.csv";
const CONFIDENCE_CSV = "docs/review-confidence.csv";
const LATENCY_CSV = "docs/reviewer-latency.csv";
const QUEUE_MD = "docs/reviewer-queue.md";
const QUEUE_CSV = "docs/reviewer-queue.csv";
const HEATMAP_CSV = "docs/change-risk-heatmap.csv";
const HEATMAP_JSON = "docs/change-risk-heatmap.json";
const DRIFT_CSV = "docs/policy-drift.csv";
const OWNERSHIP_CSV = "docs/finding-ownership.csv";
const OWNERSHIP_MD = "docs/finding-ownership.md";
const BADGE_DIR = "docs/badges";
const OUT_DIR = "site";
const OUTPUT = `${OUT_DIR}/index.html`;

const markdown = fs.existsSync(INPUT) ? fs.readFileSync(INPUT, "utf8") : "# ReviewOS Dashboard\n\nNo dashboard data available yet.";

const escaped = markdown
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;");

const csvExists = fs.existsSync(CSV);
const csvLink = csvExists ? `<div class="meta"><a href="./review-dashboard.csv">Download CSV</a></div>` : "";
const repoCsvExists = fs.existsSync(REPO_CSV);
const repoCsvLink = repoCsvExists ? `<div class="meta"><a href="./repo-baseline.csv">Download Repo Baseline CSV</a></div>` : "";
const confidenceCsvExists = fs.existsSync(CONFIDENCE_CSV);
const confidenceCsvLink = confidenceCsvExists
  ? `<div class="meta"><a href="./review-confidence.csv">Download Confidence Bands CSV</a></div>`
  : "";
const latencyCsvExists = fs.existsSync(LATENCY_CSV);
const latencyCsvLink = latencyCsvExists ? `<div class="meta"><a href="./reviewer-latency.csv">Download Reviewer Latency CSV</a></div>` : "";
const queueMdExists = fs.existsSync(QUEUE_MD);
const queueMdLink = queueMdExists ? `<div class="meta"><a href="./reviewer-queue.md">View Reviewer Queue Board (Markdown)</a></div>` : "";
const queueCsvExists = fs.existsSync(QUEUE_CSV);
const queueCsvLink = queueCsvExists ? `<div class="meta"><a href="./reviewer-queue.csv">Download Reviewer Queue CSV</a></div>` : "";
const heatmapCsvExists = fs.existsSync(HEATMAP_CSV);
const heatmapCsvLink = heatmapCsvExists ? `<div class="meta"><a href="./change-risk-heatmap.csv">Download Change-Risk Heatmap CSV</a></div>` : "";
const heatmapJsonExists = fs.existsSync(HEATMAP_JSON);
const heatmapJsonLink = heatmapJsonExists ? `<div class="meta"><a href="./change-risk-heatmap.json">Download Change-Risk Heatmap JSON</a></div>` : "";
const driftCsvExists = fs.existsSync(DRIFT_CSV);
const driftCsvLink = driftCsvExists ? `<div class="meta"><a href="./policy-drift.csv">Download Policy Drift CSV</a></div>` : "";
const ownershipCsvExists = fs.existsSync(OWNERSHIP_CSV);
const ownershipCsvLink = ownershipCsvExists
  ? `<div class="meta"><a href="./finding-ownership.csv">Download Finding Ownership CSV</a></div>`
  : "";
const ownershipMdExists = fs.existsSync(OWNERSHIP_MD);
const ownershipMdLink = ownershipMdExists
  ? `<div class="meta"><a href="./finding-ownership.md">View Finding Ownership Report (Markdown)</a></div>`
  : "";
const badgeDirExists = fs.existsSync(BADGE_DIR);
const badgeLink = badgeDirExists ? `<div class="meta"><a href="./badges/readiness.json">View Historical Badge Endpoints</a></div>` : "";

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>ReviewOS Dashboard</title>
  <style>
    body { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; margin: 24px; line-height: 1.4; }
    .wrap { max-width: 1100px; margin: 0 auto; }
    pre { white-space: pre-wrap; background: #0b0f14; color: #d8e1ea; padding: 20px; border-radius: 10px; }
    h1 { font-family: ui-sans-serif, system-ui, sans-serif; }
    .meta { color: #667; margin-bottom: 16px; font-family: ui-sans-serif, system-ui, sans-serif; }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>ReviewOS Dashboard</h1>
    <div class="meta">Source: docs/review-dashboard.md</div>
    ${csvLink}
    ${repoCsvLink}
    ${confidenceCsvLink}
    ${latencyCsvLink}
    ${queueMdLink}
    ${queueCsvLink}
    ${heatmapCsvLink}
    ${heatmapJsonLink}
    ${driftCsvLink}
    ${ownershipCsvLink}
    ${ownershipMdLink}
    ${badgeLink}
    <pre>${escaped}</pre>
  </div>
</body>
</html>`;

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUTPUT, html);
if (csvExists) {
  fs.copyFileSync(CSV, `${OUT_DIR}/review-dashboard.csv`);
}
if (repoCsvExists) {
  fs.copyFileSync(REPO_CSV, `${OUT_DIR}/repo-baseline.csv`);
}
if (confidenceCsvExists) {
  fs.copyFileSync(CONFIDENCE_CSV, `${OUT_DIR}/review-confidence.csv`);
}
if (latencyCsvExists) {
  fs.copyFileSync(LATENCY_CSV, `${OUT_DIR}/reviewer-latency.csv`);
}
if (queueMdExists) {
  fs.copyFileSync(QUEUE_MD, `${OUT_DIR}/reviewer-queue.md`);
}
if (queueCsvExists) {
  fs.copyFileSync(QUEUE_CSV, `${OUT_DIR}/reviewer-queue.csv`);
}
if (heatmapCsvExists) {
  fs.copyFileSync(HEATMAP_CSV, `${OUT_DIR}/change-risk-heatmap.csv`);
}
if (heatmapJsonExists) {
  fs.copyFileSync(HEATMAP_JSON, `${OUT_DIR}/change-risk-heatmap.json`);
}
if (driftCsvExists) {
  fs.copyFileSync(DRIFT_CSV, `${OUT_DIR}/policy-drift.csv`);
}
if (ownershipCsvExists) {
  fs.copyFileSync(OWNERSHIP_CSV, `${OUT_DIR}/finding-ownership.csv`);
}
if (ownershipMdExists) {
  fs.copyFileSync(OWNERSHIP_MD, `${OUT_DIR}/finding-ownership.md`);
}
if (badgeDirExists) {
  fs.cpSync(BADGE_DIR, `${OUT_DIR}/badges`, { recursive: true });
}
console.log(`Site written: ${OUTPUT}`);
