import fs from "node:fs";

const INPUT = "docs/review-dashboard.md";
const CSV = "docs/review-dashboard.csv";
const REPO_CSV = "docs/repo-baseline.csv";
const CONFIDENCE_CSV = "docs/review-confidence.csv";
const OWNERSHIP_CSV = "docs/finding-ownership.csv";
const OWNERSHIP_MD = "docs/finding-ownership.md";
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
const ownershipCsvExists = fs.existsSync(OWNERSHIP_CSV);
const ownershipCsvLink = ownershipCsvExists
  ? `<div class="meta"><a href="./finding-ownership.csv">Download Finding Ownership CSV</a></div>`
  : "";
const ownershipMdExists = fs.existsSync(OWNERSHIP_MD);
const ownershipMdLink = ownershipMdExists
  ? `<div class="meta"><a href="./finding-ownership.md">View Finding Ownership Report (Markdown)</a></div>`
  : "";

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
    ${ownershipCsvLink}
    ${ownershipMdLink}
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
if (ownershipCsvExists) {
  fs.copyFileSync(OWNERSHIP_CSV, `${OUT_DIR}/finding-ownership.csv`);
}
if (ownershipMdExists) {
  fs.copyFileSync(OWNERSHIP_MD, `${OUT_DIR}/finding-ownership.md`);
}
console.log(`Site written: ${OUTPUT}`);
