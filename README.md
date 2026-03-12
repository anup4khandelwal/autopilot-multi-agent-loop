# review-os

ReviewOps Copilot for pull requests. `review-os` shifts teams from implementation-heavy flow to structured review across Engineering, Product, Design, and Security.

## Latest Update (v0.1.10)

- Added reviewer fairness scoring to keep routing equitable over time
- Added PR archetype classification with policy overrides by PR type
- Added persistent review debt ledger with markdown and CSV exports
- Added risk simulation mode for alternate policy and routing outcomes without mutating PR state
- Added executive weekly digest output for engineering and product leadership

## What it does

- Runs on every PR update
- Uses a multi-agent loop (Engineering/Product/Design/Security)
- Iterates until findings converge or max iterations is reached
- Scores merge readiness (0-100)
- Posts/upserts a structured PR comment
- Suggests reviewers from `CODEOWNERS`
- Prioritizes reviewers based on risky file domains
- Balances reviewer assignment load to reduce bottlenecks
- Optionally auto-requests reviewers via GitHub API
- Supports per-path required user/team reviewer policies
- Optionally fails CI when critical findings are present
- Sends optional Slack/Discord alerts on critical findings
- Supports alert deduplication and route-based channel selection
- Optionally auto-manages PR labels based on review state
- Classifies PRs into archetypes such as feature, bugfix, docs, infra, refactor, and release
- Stores review memory in `.reviewos/history/*.json`
- Writes machine-readable latest report to `.reviewos/last-report.json`
- Exports SARIF findings for security scanning integrations
- Captures structured scoring traces for each lens
- Supports incident-safe review mode for stricter merge safety during incidents
- Tracks unresolved warning/critical findings in `.reviewos/review-debt.json`
- Exports finding ownership reports (`docs/finding-ownership.md`, `docs/finding-ownership.csv`)
- Generates trend dashboard `docs/review-dashboard.md`
- Exports dashboard dataset as CSV `docs/review-dashboard.csv`
- Publishes dashboard to GitHub Pages via workflow

## For product and design teams

`review-os` is not only a code-quality tool. It is a release-readiness system for pull requests.

Real-life scenario:

- A PM wants to launch a new onboarding flow to improve signup conversion.
- A designer updates the journey, copy, and mobile states.
- An engineer implements the change quickly with AI assistance and opens a PR.
- The PR compiles, but important gaps still exist:
  - returning-user behavior is incomplete
  - mobile layout may break on smaller screens
  - analytics tracking is missing or inconsistent
  - security review is needed because user-profile data changed
  - the wrong reviewers get assigned, so the PR waits

What `review-os` does in that situation:

- reviews the PR across engineering, product, design, and security lenses
- posts a clear ship-readiness summary with risks and next steps
- routes the PR to the right owners and reviewers
- generates a practical checklist for approval
- blocks unsafe merges when policy, risk, or release timing requires it

Why this matters for non-engineering teams:

- PMs get faster proof that implementation matches product intent
- designers catch UX and quality risks before release
- teams spend less time chasing reviewers manually
- launches become more predictable because readiness is visible in the PR itself

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
- `reviewer_routing.load_balance_*` configure reviewer load balancing behavior
- `reviewer_routing.weekly_capacity_per_user|weekly_capacity_per_team` cap reviewer assignment load
- `reviewer_routing.fairness_enabled|fairness_weight` bias routing toward historically underused reviewers
- `labels.enabled` enable PR label automation
- `labels.critical_label|security_label|ready_label` managed labels
- `fix_suggestions.enabled|max_items` include remediation hints in PR report
- `reviewer_sla.enabled|threshold_hours|cooldown_hours` reminder policy
- `reviewer_sla.owner_policies.*` owner-specific thresholds and escalation timers
- `incident_safe.enabled|security_penalty_multiplier|min_approvals` incident enforcement
- `adaptive_thresholds.*` auto-adjust warning thresholds from recent history
- `escalation.levels.*` level-based escalation policies
- `regression_signatures.*` detect repeated quality regressions
- `cross_pr_duplicates.*` detect same signatures across different PRs
- `auto_split.*` suggest split boundaries for large PRs
- `policy_drift.*` alert threshold divergence from configured baseline
- `context_budget.*` estimate prompt budget and suggest compression strategy
- `merge_window.*` enforce merge timing for high-risk PRs
- `archetypes.default|overrides.*` classify PR intent and adjust policy per archetype
- `debt_ledger.enabled|file` persist unresolved review debt across PR runs
- `finding_ownership.default_owner|rules` team mapping for findings
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

## Risk simulation mode

```bash
bash scripts/run-risk-simulation.sh
```

This runs ReviewOS in simulation-only mode. It compares the current PR outcome against alternate risk assumptions and policy presets without posting comments, labels, or reviewer requests.

Useful env vars:

- `REVIEW_OS_SIMULATION=1`
- `REVIEW_OS_SIMULATION_ONLY=1`
- `REVIEW_OS_SIMULATION_PROFILE=high|low`
- `REVIEW_OS_SIMULATION_PRESET=startup|fintech|enterprise`
- `REVIEW_OS_SIMULATION_CONFIG=/path/to/alternate-config.yml`

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
Also writes: `docs/finding-ownership.md`
Also writes: `docs/finding-ownership.csv`
Also writes: `docs/review-confidence.csv`
Also writes: `.reviewos/scorecards/*.json|*.md`
Also writes: `docs/reviewer-latency.csv`
Also writes: `docs/reviewer-queue.md`
Also writes: `docs/reviewer-queue.csv`
Also writes: `docs/change-risk-heatmap.csv|json`
Also writes: `docs/policy-drift.csv`
Also writes: `docs/review-debt.md`
Also writes: `docs/review-debt.csv`
Also writes: `docs/executive-weekly-digest.md`
Also writes: `docs/badges/*.json`

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
  - ownership report build
  - reviewer queue board build
  - benchmark badge build
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
- `.github/workflows/review-os-executive-digest.yml`
  - weekly leadership digest artifact for engineering/product stakeholders
- `.github/workflows/quality.yml`
  - full validation matrix (`scripts/validate.sh`)

## PR template helper

Use `scripts/demo-pr-template.md` to improve review signal quality.
