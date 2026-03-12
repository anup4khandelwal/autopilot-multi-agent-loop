import fs from "node:fs";

const LEDGER = ".reviewos/review-debt.json";
const OUT_MD = "docs/review-debt.md";
const OUT_CSV = "docs/review-debt.csv";

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

function buildTable(headers, rows) {
  if (!rows.length) return "No data yet.";
  const head = `| ${headers.join(" | ")} |`;
  const sep = `|${headers.map(() => "---").join("|")}|`;
  const body = rows.map((row) => `| ${row.join(" | ")} |`).join("\n");
  return `${head}\n${sep}\n${body}`;
}

function ageDays(from, to = new Date().toISOString()) {
  if (!from) return 0;
  const delta = new Date(to).getTime() - new Date(from).getTime();
  if (!Number.isFinite(delta) || delta <= 0) return 0;
  return Math.floor(delta / (1000 * 60 * 60 * 24));
}

function main() {
  ensureDir("docs");
  const ledger = safeReadJson(LEDGER, { updatedAt: "", entries: [] });
  const entries = Array.isArray(ledger.entries) ? ledger.entries : [];
  const openEntries = entries
    .filter((entry) => entry.status === "open")
    .sort((a, b) => String(b.lastSeenAt || "").localeCompare(String(a.lastSeenAt || "")));
  const resolvedEntries = entries
    .filter((entry) => entry.status === "cleared")
    .sort((a, b) => String(b.clearedAt || "").localeCompare(String(a.clearedAt || "")));

  const grouped = new Map();
  for (const entry of openEntries) {
    const key = `${entry.owner || "unassigned"}|${entry.lens || "unknown"}|${entry.pathGroup || "root"}`;
    grouped.set(key, (grouped.get(key) || 0) + 1);
  }
  const groupedRows = [...grouped.entries()]
    .map(([key, count]) => {
      const [owner, lens, pathGroup] = key.split("|");
      return { owner, lens, pathGroup, count };
    })
    .sort((a, b) => b.count - a.count || a.owner.localeCompare(b.owner));

  const markdown = `# Review Debt Ledger

Generated: ${new Date().toISOString()}

## Summary

- Open debt items: ${openEntries.length}
- Resolved debt items: ${resolvedEntries.length}
- Ledger updated at: ${ledger.updatedAt || "N/A"}

## Open Debt by Owner / Lens / Path

${buildTable(
  ["Owner", "Lens", "Path Group", "Open Items"],
  groupedRows.slice(0, 15).map((row) => [row.owner, row.lens, row.pathGroup, String(row.count)])
)}

## Oldest Open Debt

${buildTable(
  ["PR", "Owner", "Lens", "Path Group", "Age (days)", "Finding"],
  openEntries
    .slice()
    .sort((a, b) => ageDays(b.firstSeenAt) - ageDays(a.firstSeenAt))
    .slice(0, 12)
    .map((entry) => [
      `#${entry.pr}`,
      entry.owner || "unassigned",
      entry.lens || "unknown",
      entry.pathGroup || "root",
      String(ageDays(entry.firstSeenAt)),
      String(entry.message || "").replace(/\|/g, "\\|"),
    ])
)}

## Recently Resolved Debt

${buildTable(
  ["PR", "Owner", "Lens", "Path Group", "Cleared At"],
  resolvedEntries.slice(0, 10).map((entry) => [
    `#${entry.pr}`,
    entry.owner || "unassigned",
    entry.lens || "unknown",
    entry.pathGroup || "root",
    String(entry.clearedAt || "").slice(0, 19) || "N/A",
  ])
)}
`;

  const csvLines = [
    "status,repository,pr,title,severity,lens,owner,path_group,first_seen_at,last_seen_at,cleared_at,seen_count,reopened_count,archetype,merge_readiness,message",
    ...entries.map((entry) =>
      [
        entry.status || "",
        entry.repository || "",
        entry.pr || "",
        `"${String(entry.title || "").replace(/"/g, '""')}"`,
        entry.severity || "",
        entry.lens || "",
        entry.owner || "",
        entry.pathGroup || "",
        entry.firstSeenAt || "",
        entry.lastSeenAt || "",
        entry.clearedAt || "",
        Number(entry.seenCount || 0),
        Number(entry.reopenedCount || 0),
        entry.archetype || "",
        Number(entry.mergeReadiness || 0),
        `"${String(entry.message || "").replace(/"/g, '""')}"`,
      ].join(",")
    ),
  ];

  fs.writeFileSync(OUT_MD, markdown);
  fs.writeFileSync(OUT_CSV, `${csvLines.join("\n")}\n`);
  console.log(`Debt ledger written: ${OUT_MD}`);
  console.log(`Debt ledger CSV written: ${OUT_CSV}`);
}

main();
