# review-os

ReviewOps Copilot for pull requests. `review-os` shifts teams from implementation-heavy flow to structured review across Engineering, Product, Design, and Security.

## What it does

- Runs on every PR update
- Uses a multi-agent loop (Engineering/Product/Design/Security)
- Iterates until findings converge or max iterations is reached
- Scores merge readiness (0-100)
- Posts/upserts a structured PR comment
- Optionally fails CI when critical findings are present
- Stores review memory in `.reviewos/history/*.json`

## Quick start

1. Add workflow `.github/workflows/review-os.yml`.
2. Keep default token permissions (`pull-requests: write`, `issues: write`).
3. Open a PR and inspect the `ReviewOS Copilot Report` comment.

## Configuration

Use `.reviewos.yml`:

- `weights` for lens scoring
- `thresholds` for warnings and next-step triggers
- `max_iterations` for loop convergence
- `fail_on_critical` default behavior

CI env override:

- `FAIL_ON_CRITICAL=true|false`

## Local simulation

```bash
bash scripts/simulate-review.sh
```

This runs the review loop on `scripts/mock-pr.json` + `scripts/mock-files.json` and writes history snapshots.

## PR template helper

Use `scripts/demo-pr-template.md` to improve review signal quality.

## Task checklist implemented

- [x] Workflow enabled with PR + manual dispatch support
- [x] First-run path with simulation tooling
- [x] Structured output and score validation
- [x] Critical finding gate via `FAIL_ON_CRITICAL`
- [x] Repo config file (`.reviewos.yml`)
- [x] Multi-agent iterative review loop with convergence
- [x] Review memory and recurring-finding detection
- [x] Developer UX assets (`CONTRIBUTING.md`, PR template helper)
- [x] Release assets (`CHANGELOG.md`, `RELEASE_NOTES_v0.1.0.md`)
- [x] Promotion assets (`marketing/launch-posts.md`)
