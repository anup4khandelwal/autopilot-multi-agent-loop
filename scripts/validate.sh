#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

echo "[1/2] Running normal simulation..."
bash scripts/simulate-review.sh >/tmp/reviewos-ok.log

echo "[2/2] Running critical-path simulation (expected fail)..."
set +e
MOCK_PR_PATH="scripts/mock-pr.json" MOCK_FILES_PATH="scripts/mock-files-critical.json" GITHUB_REPOSITORY="local/review-os" FAIL_ON_CRITICAL="true" DRY_RUN_COMMENT=1 node src/review.mjs >/tmp/reviewos-critical.log 2>&1
rc=$?
set -e

if [ "$rc" -eq 0 ]; then
  echo "Critical-path simulation should fail but passed." >&2
  exit 1
fi

echo "[3/3] Running path policy matrix..."
node scripts/policy-matrix-test.mjs

echo "[4/6] Syntax checks..."
node --check src/review.mjs
node --check src/release-gate.mjs
node --check src/sla-reminder.mjs
node --check scripts/build-ownership-report.mjs
node --check scripts/build-reviewer-queue.mjs
node --check scripts/build-badges.mjs

echo "[5/6] Build dashboard outputs..."
node scripts/build-dashboard.mjs >/tmp/reviewos-dashboard.log
node scripts/build-ownership-report.mjs >/tmp/reviewos-ownership.log
node scripts/build-reviewer-queue.mjs >/tmp/reviewos-queue.log
node scripts/build-badges.mjs >/tmp/reviewos-badges.log
test -f docs/review-dashboard.csv
test -f docs/repo-baseline.csv
test -f docs/review-confidence.csv
test -f docs/reviewer-latency.csv
test -f docs/reviewer-queue.md
test -f docs/reviewer-queue.csv
test -f docs/change-risk-heatmap.csv
test -f docs/change-risk-heatmap.json
test -f docs/policy-drift.csv
test -f docs/finding-ownership.csv
test -f docs/badges/readiness.json

echo "[6/6] Render dashboard site..."
node scripts/render-dashboard-site.mjs >/tmp/reviewos-site.log

echo "Validation complete."
