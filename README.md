# review-os

ReviewOps Copilot for pull requests. `review-os` shifts teams from implementation-heavy flow to structured review across Engineering, Product, Design, and Security.

## What it does

- Runs on every PR update
- Uses a multi-agent loop (Engineering/Product/Design/Security)
- Iterates until findings converge or max iterations is reached
- Scores merge readiness (0-100)
- Posts/upserts a structured PR comment
- Suggests reviewers from `CODEOWNERS`
- Optionally auto-requests reviewers via GitHub API
- Optionally fails CI when critical findings are present
- Stores review memory in `.reviewos/history/*.json`
- Generates trend dashboard `docs/review-dashboard.md`

## Quick start

1. Add workflow `.github/workflows/review-os.yml`.
2. Keep token permissions (`pull-requests: write`, `issues: write`).
3. Add `.github/CODEOWNERS` for routing (sample included).
4. Open a PR and inspect the `ReviewOS Copilot Report` comment.

## Configuration

Use `.reviewos.yml`:

- `weights` for lens scoring
- `thresholds` for warnings and next-step triggers
- `max_iterations` for loop convergence
- `fail_on_critical` default behavior
- `reviewer_routing.enabled` enable CODEOWNERS suggestions
- `reviewer_routing.auto_request` auto-request reviewers
- `reviewer_routing.max_reviewers` cap requests
- `path_overrides` apply path-based penalties and test requirements

CI env override:

- `FAIL_ON_CRITICAL=true|false`

## Local simulation

```bash
bash scripts/simulate-review.sh
```

This runs the review loop on `scripts/mock-pr.json` + `scripts/mock-files.json` and writes history snapshots.

## Path-based policy overrides

Define stricter rules in `.reviewos.yml`:

- Per-path score penalties (engineering/product/design/security)
- Required-tests policy for sensitive paths (can emit critical findings)

Example rules are included for:

- `src/auth/*`
- `.github/workflows/*`

## Build trend dashboard

```bash
node scripts/build-dashboard.mjs
```

Output: `docs/review-dashboard.md`

## CI workflows

- `.github/workflows/review-os.yml`
  - PR review loop
  - dashboard build
  - artifacts upload
- `.github/workflows/review-os-dashboard.yml`
  - weekly dashboard build artifact

## PR template helper

Use `scripts/demo-pr-template.md` to improve review signal quality.
