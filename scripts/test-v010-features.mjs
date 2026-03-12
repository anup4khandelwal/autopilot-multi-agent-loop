import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const REVIEW = path.join(ROOT, "src/review.mjs");
const BUILD_QUEUE = path.join(ROOT, "scripts/build-reviewer-queue.mjs");
const BUILD_DEBT = path.join(ROOT, "scripts/build-debt-ledger.mjs");
const BUILD_DIGEST = path.join(ROOT, "scripts/build-executive-digest.mjs");

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function writeText(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, data);
}

function runNode(script, cwd, env = {}) {
  const res = spawnSync("node", [script], {
    cwd,
    env: { ...process.env, ...env },
    encoding: "utf8",
  });
  if (res.status !== 0) {
    throw new Error(`Command failed: node ${script}\nstdout:\n${res.stdout}\nstderr:\n${res.stderr}`);
  }
  return res;
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "reviewos-v010-"));

writeText(
  path.join(tmp, ".github/CODEOWNERS"),
  ["* @alice @bob @carol", "src/auth/* @alice @bob @carol", "src/utils/* @alice @bob @carol"].join("\n")
);

writeText(
  path.join(tmp, ".reviewos.yml"),
  `weights:
  engineering: 0.35
  product: 0.25
  design: 0.15
  security: 0.25
thresholds:
  engineering_warning: 70
  product_warning: 70
  design_warning: 75
  security_warning: 75
max_iterations: 3
fail_on_critical: false
reviewer_routing:
  enabled: true
  auto_request: false
  max_reviewers: 2
  risk_based: true
  load_balance_enabled: true
  load_balance_state_file: .reviewos/reviewer-load.json
  load_balance_decay_days: 14
  load_balance_weight: 0.6
  weekly_capacity_per_user: 10
  weekly_capacity_per_team: 20
  fairness_enabled: true
  fairness_weight: 0.6
archetypes:
  enabled: true
  default: chore
  overrides:
    feature:
      security_warning_delta: 4
    docs:
      engineering_warning_delta: -5
debt_ledger:
  enabled: true
  file: .reviewos/review-debt.json
finding_ownership:
  default_owner: platform
  rules:
    security_team:
      lens_contains: Security
      owner: security
`
);

writeJson(path.join(tmp, ".reviewos/reviewer-load.json"), {
  users: {
    alice: { count: 12, weekly_count: 6, weekly_updated_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    bob: { count: 4, weekly_count: 2, weekly_updated_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    carol: { count: 0, weekly_count: 0, weekly_updated_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  },
  teams: {},
});

const prBase = {
  number: 101,
  body: "Problem: auth onboarding is inconsistent.\n\nUser Impact: new users fail to complete session setup.\n\nAcceptance Criteria: successful onboarding and session persistence.",
  user: { login: "author" },
  requested_reviewers: [],
  requested_teams: [],
  created_at: "2026-03-12T00:00:00Z",
  labels: [{ name: "feature" }],
};

writeJson(path.join(tmp, "mock-pr-1.json"), {
  ...prBase,
  title: "feat: improve auth onboarding flow",
});
writeJson(path.join(tmp, "mock-files-1.json"), [
  { filename: "src/auth/session.ts" },
  { filename: "tests/auth/session.test.ts" },
]);

runNode(REVIEW, tmp, {
  MOCK_PR_PATH: path.join(tmp, "mock-pr-1.json"),
  MOCK_FILES_PATH: path.join(tmp, "mock-files-1.json"),
  GITHUB_REPOSITORY: "local/review-os",
  REVIEW_OS_CONFIG: path.join(tmp, ".reviewos.yml"),
  DRY_RUN_COMMENT: "1",
  REVIEW_OS_SIMULATION: "1",
  REVIEW_OS_SIMULATION_ONLY: "1",
  REVIEW_OS_SIMULATION_PROFILE: "high",
  REVIEW_OS_SIMULATION_PRESET: "enterprise",
});

const report1 = JSON.parse(fs.readFileSync(path.join(tmp, ".reviewos/last-report.json"), "utf8"));
if (report1.archetype?.name !== "feature") {
  throw new Error(`Expected feature archetype, got ${report1.archetype?.name || "missing"}`);
}
if (!report1.simulation?.enabled) {
  throw new Error("Expected risk simulation output in report.");
}
if ((report1.reviewerRouting?.users || []).join(",") !== "carol,bob") {
  throw new Error(`Expected fairness-ranked reviewers carol,bob; got ${(report1.reviewerRouting?.users || []).join(",")}`);
}

let ledger = JSON.parse(fs.readFileSync(path.join(tmp, ".reviewos/review-debt.json"), "utf8"));
if (!(ledger.entries || []).some((entry) => entry.status === "open")) {
  throw new Error("Expected at least one open debt entry after first run.");
}

writeJson(path.join(tmp, "mock-pr-2.json"), {
  ...prBase,
  title: "fix: normalize utility math helper",
  labels: [{ name: "bug" }],
});
writeJson(path.join(tmp, "mock-files-2.json"), [
  { filename: "src/utils/math.ts" },
  { filename: "tests/utils/math.test.ts" },
]);

runNode(REVIEW, tmp, {
  MOCK_PR_PATH: path.join(tmp, "mock-pr-2.json"),
  MOCK_FILES_PATH: path.join(tmp, "mock-files-2.json"),
  GITHUB_REPOSITORY: "local/review-os",
  REVIEW_OS_CONFIG: path.join(tmp, ".reviewos.yml"),
  DRY_RUN_COMMENT: "1",
});

ledger = JSON.parse(fs.readFileSync(path.join(tmp, ".reviewos/review-debt.json"), "utf8"));
if (!(ledger.entries || []).some((entry) => entry.status === "cleared")) {
  throw new Error("Expected cleared debt entries after second run.");
}

runNode(BUILD_QUEUE, tmp);
runNode(BUILD_DEBT, tmp);
runNode(BUILD_DIGEST, tmp);

for (const output of [
  "docs/reviewer-queue.csv",
  "docs/review-debt.md",
  "docs/review-debt.csv",
  "docs/executive-weekly-digest.md",
]) {
  if (!fs.existsSync(path.join(tmp, output))) {
    throw new Error(`Expected output file missing: ${output}`);
  }
}

console.log("v0.1.10 integration checks passed.");
