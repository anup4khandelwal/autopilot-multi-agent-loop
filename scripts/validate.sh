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

echo "Validation complete."
