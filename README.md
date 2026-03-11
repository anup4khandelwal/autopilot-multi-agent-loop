# review-os

ReviewOps Copilot for pull requests. `review-os` shifts teams from implementation-heavy flow to structured review across Engineering, Product, Design, and Security.

## Latest Update (v0.1.5)

- Added actionable fix suggestions in PR report for top findings
- Added reviewer SLA reminder bot (scheduled workflow + cooldown handling)
- Added multi-repo baseline comparison in dashboard output
- Added prompt-trace capture per lens to `.reviewos/traces/*.json`
- Added auto release gate enforcement for release PRs with unresolved critical findings

## What it does

- Runs on every PR update
- Uses a multi-agent loop (Engineering/Product/Design/Security)
- Iterates until findings converge or max iterations is reached
- Scores merge readiness (0-100)
- Posts/upserts a structured PR comment
- Suggests reviewers from `CODEOWNERS`
- Prioritizes reviewers based on risky file domains
- Optionally auto-requests reviewers via GitHub API
- Supports per-path required user/team reviewer policies
- Optionally fails CI when critical findings are present
- Sends optional Slack/Discord alerts on critical findings
- Supports alert deduplication and route-based channel selection
- Optionally auto-manages PR labels based on review state
- Stores review memory in `.reviewos/history/*.json`
- Writes machine-readable latest report to `.reviewos/last-report.json`
- Exports SARIF findings for security scanning integrations
- Captures structured scoring traces for each lens
- Generates trend dashboard `docs/review-dashboard.md`
- Exports dashboard dataset as CSV `docs/review-dashboard.csv`
- Publishes dashboard to GitHub Pages via workflow

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
- `reviewer_routing.risk_based` boost risky-domain owner routing
- `labels.enabled` enable PR label automation
- `labels.critical_label|security_label|ready_label` managed labels
- `fix_suggestions.enabled|max_items` include remediation hints in PR report
- `reviewer_sla.enabled|threshold_hours|cooldown_hours` reminder policy
- `path_overrides` apply path-based penalties and test requirements
- `alerts.enabled` enable Slack/Discord critical alerts
- `alerts.slack_webhook_env` env var name for Slack webhook
- `alerts.discord_webhook_env` env var name for Discord webhook
- `alerts.dedupe_window_minutes` suppress duplicate alerts for recurring findings
- `alerts.routes` map severity/lens rules to channels
- `policy_preset` quick baseline (`startup`, `fintech`, `enterprise`)
- `governance.policy_lock` enforce config SHA-256 hash check
- `governance.signature` optional HMAC signature for signed config
- `prompt_trace.enabled|output_dir` persist lens-level decision traces
- `release_gate.enabled|title_regex|base_branch_regex` enforce critical-free release PRs

CI env override:

- `FAIL_ON_CRITICAL=true|false`
- `REVIEW_OS_POLICY_PRESET=startup|fintech|enterprise`
- `REVIEW_OS_POLICY_SHA256=<sha256>`
- `REVIEW_OS_CONFIG_SIGNATURE=<hmac-hex>`

## Local simulation

```bash
bash scripts/simulate-review.sh
```

This runs the review loop on `scripts/mock-pr.json` + `scripts/mock-files.json` and writes history snapshots.

## Path-based policy overrides

Define stricter rules in `.reviewos.yml`:

- Per-path score penalties (engineering/product/design/security)
- Required-tests policy for sensitive paths (can emit critical findings)
- Optional required reviewer enforcement per path
  - `required_users` (comma-separated usernames)
  - `required_teams` (comma-separated org/team slugs)
  - missing required coverage emits critical findings and can fail CI

Example rules are included for:

- `src/auth/*`
- `.github/workflows/*`

## Build trend dashboard

```bash
node scripts/build-dashboard.mjs
```

Output: `docs/review-dashboard.md`

Also writes: `docs/review-dashboard.csv`
Also writes: `docs/repo-baseline.csv`

## Publish dashboard (Pages)

Run workflow: `.github/workflows/review-os-pages.yml`

It will:

- Build `docs/review-dashboard.md`
- Render static site at `site/index.html`
- Deploy to GitHub Pages

## CI workflows

- `.github/workflows/review-os.yml`
  - PR review loop
  - dashboard build
  - SARIF generation/upload
  - prompt trace artifact upload
  - release gate enforcement
  - artifacts upload
- `.github/workflows/reviewer-sla-reminder.yml`
  - scheduled reminder comments for PRs exceeding review SLA
- `.github/workflows/review-os-dashboard.yml`
  - weekly dashboard build artifact
- `.github/workflows/review-os-pages.yml`
  - weekly + manual dashboard publishing to GitHub Pages
- `.github/workflows/quality.yml`
  - full validation matrix (`scripts/validate.sh`)

## PR template helper

Use `scripts/demo-pr-template.md` to improve review signal quality.
