import fs from "node:fs";

const INPUT = "docs/review-dashboard.md";
const OUT_DIR = "site";
const OUTPUT = `${OUT_DIR}/index.html`;

const markdown = fs.existsSync(INPUT) ? fs.readFileSync(INPUT, "utf8") : "# ReviewOS Dashboard\n\nNo dashboard data available yet.";

const escaped = markdown
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;");

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
    <pre>${escaped}</pre>
  </div>
</body>
</html>`;

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUTPUT, html);
console.log(`Site written: ${OUTPUT}`);
