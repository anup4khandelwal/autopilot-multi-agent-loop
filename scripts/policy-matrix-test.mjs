import { spawnSync } from "node:child_process";
import fs from "node:fs";
import crypto from "node:crypto";

const lockConfigPath = "scripts/fixtures/policy/config-team-required.yml";
const lockHash = crypto.createHash("sha256").update(fs.readFileSync(lockConfigPath)).digest("hex");

const cases = [
  {
    name: "author-exempt-required-user",
    env: {
      REVIEW_OS_CONFIG: "scripts/fixtures/policy/config-author-exempt.yml",
      MOCK_PR_PATH: "scripts/fixtures/policy/pr-author.json",
      MOCK_FILES_PATH: "scripts/fixtures/policy/files-auth-only.json",
      GITHUB_REPOSITORY: "local/review-os",
      FAIL_ON_CRITICAL: "false",
      DRY_RUN_COMMENT: "1",
    },
    expectIncludes: ["Required users: @anup4khandelwal", "Missing users: None"],
    expectExcludes: ["ReviewerPolicy"],
  },
  {
    name: "required-team-missing",
    env: {
      REVIEW_OS_CONFIG: "scripts/fixtures/policy/config-team-required.yml",
      MOCK_PR_PATH: "scripts/fixtures/policy/pr-team-missing.json",
      MOCK_FILES_PATH: "scripts/fixtures/policy/files-workflow-only.json",
      GITHUB_REPOSITORY: "local/review-os",
      FAIL_ON_CRITICAL: "false",
      DRY_RUN_COMMENT: "1",
    },
    expectIncludes: ["ReviewerPolicy", "Missing teams: @acme/security"],
  },
  {
    name: "required-team-present",
    env: {
      REVIEW_OS_CONFIG: "scripts/fixtures/policy/config-team-required.yml",
      MOCK_PR_PATH: "scripts/fixtures/policy/pr-team-present.json",
      MOCK_FILES_PATH: "scripts/fixtures/policy/files-workflow-only.json",
      GITHUB_REPOSITORY: "local/review-os",
      FAIL_ON_CRITICAL: "false",
      DRY_RUN_COMMENT: "1",
    },
    expectIncludes: ["Missing teams: None"],
    expectExcludes: ["ReviewerPolicy"],
  },
  {
    name: "path-require-tests-critical",
    env: {
      REVIEW_OS_CONFIG: "scripts/fixtures/policy/config-require-tests.yml",
      MOCK_PR_PATH: "scripts/fixtures/policy/pr-team-missing.json",
      MOCK_FILES_PATH: "scripts/fixtures/policy/files-auth-only.json",
      GITHUB_REPOSITORY: "local/review-os",
      FAIL_ON_CRITICAL: "false",
      DRY_RUN_COMMENT: "1",
    },
    expectIncludes: ["PathPolicy", "Auth tests required by policy."],
  },
  {
    name: "preset-fintech-adds-payment-policy",
    env: {
      REVIEW_OS_CONFIG: "scripts/fixtures/policy/config-author-exempt.yml",
      REVIEW_OS_POLICY_PRESET: "fintech",
      MOCK_PR_PATH: "scripts/fixtures/policy/pr-team-missing.json",
      MOCK_FILES_PATH: "scripts/fixtures/policy/files-payments-only.json",
      GITHUB_REPOSITORY: "local/review-os",
      FAIL_ON_CRITICAL: "false",
      DRY_RUN_COMMENT: "1",
    },
    expectIncludes: ["PathPolicy", "Payments changes must include tests."],
  },
  {
    name: "policy-lock-valid-hash",
    env: {
      REVIEW_OS_CONFIG: lockConfigPath,
      REVIEW_OS_POLICY_LOCK: "true",
      REVIEW_OS_POLICY_SHA256: lockHash,
      MOCK_PR_PATH: "scripts/fixtures/policy/pr-team-present.json",
      MOCK_FILES_PATH: "scripts/fixtures/policy/files-workflow-only.json",
      GITHUB_REPOSITORY: "local/review-os",
      FAIL_ON_CRITICAL: "false",
      DRY_RUN_COMMENT: "1",
    },
    expectIncludes: ["ReviewOS Copilot Report"],
  },
];

let failed = 0;

for (const c of cases) {
  let caseFailed = 0;
  const out = spawnSync("node", ["src/review.mjs"], {
    encoding: "utf8",
    env: { ...process.env, ...c.env },
  });

  const text = `${out.stdout || ""}\n${out.stderr || ""}`;
  if (out.status !== 0) {
    console.error(`[FAIL] ${c.name}: unexpected exit code ${out.status}`);
    caseFailed += 1;
    continue;
  }

  for (const token of c.expectIncludes || []) {
    if (!text.includes(token)) {
      console.error(`[FAIL] ${c.name}: missing expected token: ${token}`);
      caseFailed += 1;
    }
  }

  for (const token of c.expectExcludes || []) {
    if (text.includes(token)) {
      console.error(`[FAIL] ${c.name}: found excluded token: ${token}`);
      caseFailed += 1;
    }
  }

  failed += caseFailed;
  if (caseFailed === 0) {
    console.log(`[PASS] ${c.name}`);
  }
}

{
  const out = spawnSync("node", ["src/review.mjs"], {
    encoding: "utf8",
    env: {
      ...process.env,
      REVIEW_OS_CONFIG: lockConfigPath,
      REVIEW_OS_POLICY_LOCK: "true",
      REVIEW_OS_POLICY_SHA256: "invalidhash",
      MOCK_PR_PATH: "scripts/fixtures/policy/pr-team-present.json",
      MOCK_FILES_PATH: "scripts/fixtures/policy/files-workflow-only.json",
      GITHUB_REPOSITORY: "local/review-os",
      FAIL_ON_CRITICAL: "false",
      DRY_RUN_COMMENT: "1",
    },
  });
  const text = `${out.stdout || ""}\n${out.stderr || ""}`;
  if (out.status === 0 || !text.includes("Policy lock failed")) {
    console.error("[FAIL] policy-lock-invalid-hash: expected non-zero exit with mismatch error");
    failed += 1;
  } else {
    console.log("[PASS] policy-lock-invalid-hash");
  }
}

if (failed > 0) {
  console.error(`Policy matrix failed with ${failed} issue(s).`);
  process.exit(1);
}

console.log("Policy matrix passed.");
