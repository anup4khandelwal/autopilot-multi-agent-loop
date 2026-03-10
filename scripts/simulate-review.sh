#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

MOCK_PR_PATH="$ROOT_DIR/scripts/mock-pr.json" \
MOCK_FILES_PATH="$ROOT_DIR/scripts/mock-files.json" \
GITHUB_REPOSITORY="local/review-os" \
FAIL_ON_CRITICAL="true" \
DRY_RUN_COMMENT=1 \
node src/review.mjs
