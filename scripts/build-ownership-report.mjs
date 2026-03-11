import fs from "node:fs";
import path from "node:path";

const HISTORY_DIR = ".reviewos/history";
const OUT_MD = "docs/finding-ownership.md";
const OUT_CSV = "docs/finding-ownership.csv";

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function loadRuns() {
  if (!fs.existsSync(HISTORY_DIR)) return [];
  const out = [];
  for (const file of fs.readdirSync(HISTORY_DIR)) {
    if (!file.endsWith(".json")) continue;
    const full = path.join(HISTORY_DIR, file);
    try {
      const data = JSON.parse(fs.readFileSync(full, "utf8"));
      if (Array.isArray(data)) {
        for (const row of data) out.push({ ...row, _source: file });
      }
    } catch {
      // ignore malformed history files
    }
  }
  return out;
}

function buildOwnership(rows) {
  const map = new Map();
  for (const row of rows) {
    for (const finding of row.findings || []) {
      const owner = String(finding.owner || "unassigned");
      if (!map.has(owner)) {
        map.set(owner, { owner, total: 0, critical: 0, warning: 0, info: 0 });
      }
      const agg = map.get(owner);
      agg.total += 1;
      if (finding.severity === "critical") agg.critical += 1;
      else if (finding.severity === "warning") agg.warning += 1;
      else agg.info += 1;
    }
  }
  return [...map.values()].sort((a, b) => b.total - a.total || a.owner.localeCompare(b.owner));
}

function table(rows) {
  if (!rows.length) return "No ownership data yet.";
  const head = "| Owner | Total | Critical | Warning | Info |";
  const sep = "|---|---:|---:|---:|---:|";
  const body = rows.map((r) => `| ${r.owner} | ${r.total} | ${r.critical} | ${r.warning} | ${r.info} |`).join("\n");
  return `${head}\n${sep}\n${body}`;
}

function writeCsv(rows) {
  const lines = ["owner,total,critical,warning,info"];
  for (const r of rows) {
    lines.push(`${r.owner},${r.total},${r.critical},${r.warning},${r.info}`);
  }
  fs.writeFileSync(OUT_CSV, `${lines.join("\n")}\n`);
}

function main() {
  ensureDir("docs");
  const runs = loadRuns();
  const rows = buildOwnership(runs);
  const md = `# Finding Ownership Report\n\nGenerated: ${new Date().toISOString()}\n\n${table(rows)}\n\n## Notes\n\n- Source: \\.reviewos/history/*.json\n- Ownership is assigned during review using \`finding_ownership\` rules in \`.reviewos.yml\`.\n`;
  fs.writeFileSync(OUT_MD, md);
  writeCsv(rows);
  console.log(`Ownership report written: ${OUT_MD}`);
  console.log(`Ownership CSV written: ${OUT_CSV}`);
}

main();
