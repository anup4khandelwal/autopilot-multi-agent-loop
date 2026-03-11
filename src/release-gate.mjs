import fs from "node:fs";

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function isReleasePr(pr) {
  const title = String(pr?.title || "");
  const baseRef = String(pr?.base?.ref || "");
  return /^release[:\s]|^chore\(release\):/i.test(title) || /^main$|^release\/.*$/i.test(baseRef);
}

const eventPath = process.env.GITHUB_EVENT_PATH;
if (!eventPath || !fs.existsSync(eventPath)) {
  console.log("No event payload; release gate skipped.");
  process.exit(0);
}

const event = readJson(eventPath) || {};
const pr = event.pull_request;
if (!pr) {
  console.log("No PR in event; release gate skipped.");
  process.exit(0);
}

if (!isReleasePr(pr)) {
  console.log("Not a release PR; release gate passed.");
  process.exit(0);
}

const report = readJson(".reviewos/last-report.json");
const critical = Number(report?.grouped?.critical?.length || 0);
if (critical > 0) {
  console.error(`Release gate failed: ${critical} unresolved critical finding(s).`);
  process.exit(1);
}

console.log("Release gate passed: no unresolved critical findings.");
