import { spawnSync } from "node:child_process";

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

if (failed > 0) {
  console.error(`Policy matrix failed with ${failed} issue(s).`);
  process.exit(1);
}

console.log("Policy matrix passed.");
