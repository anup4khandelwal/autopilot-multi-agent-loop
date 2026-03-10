# review-os

ReviewOps Copilot for pull requests. `review-os` shifts teams from implementation-heavy review to structured, high-signal review across Engineering, Product, Design, and Security.

## What it does

- Runs on every PR update
- Scores PR quality using a multi-lens rubric
- Posts a structured review comment in the PR
- Upserts (edits) the same comment on subsequent runs
- Can fail CI when critical findings are detected

## Review lenses

- Engineering: size/risk/test coverage signals
- Product: problem statement, user impact, acceptance criteria
- Design: UI-change evidence and UX handoff cues
- Security: sensitive-file and auth/payment risk checks

## Quick start

1. Copy `.github/workflows/review-os.yml` into your target repo.
2. Keep default `GITHUB_TOKEN` permissions (`pull-requests: write`).
3. Open a PR and inspect the `ReviewOS` comment.

## Configuration

In `.github/workflows/review-os.yml`:

- `FAIL_ON_CRITICAL`: `"true"` or `"false"` (default false)

## Output format

- Merge readiness score (0-100)
- Lens scores (Engineering/Product/Design/Security)
- Findings grouped by severity (`critical`, `warning`, `info`)
- Actionable next steps

## Roadmap

- Repo-level config file (`.reviewos.yml`)
- Team-specific rules and CODEOWNERS integration
- Historical trends dashboard for review quality
