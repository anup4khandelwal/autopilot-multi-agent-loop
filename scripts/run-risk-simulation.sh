#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

MOCK_PR_PATH="${MOCK_PR_PATH:-$ROOT_DIR/scripts/mock-pr.json}" \
MOCK_FILES_PATH="${MOCK_FILES_PATH:-$ROOT_DIR/scripts/mock-files.json}" \
GITHUB_REPOSITORY="${GITHUB_REPOSITORY:-local/review-os}" \
FAIL_ON_CRITICAL="${FAIL_ON_CRITICAL:-true}" \
DRY_RUN_COMMENT=1 \
REVIEW_OS_SIMULATION=1 \
REVIEW_OS_SIMULATION_ONLY=1 \
REVIEW_OS_SIMULATION_PROFILE="${REVIEW_OS_SIMULATION_PROFILE:-high}" \
REVIEW_OS_SIMULATION_PRESET="${REVIEW_OS_SIMULATION_PRESET:-enterprise}" \
node src/review.mjs
