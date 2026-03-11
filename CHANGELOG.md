# Changelog

## v0.1.5

- Added actionable fix suggestions in ReviewOS PR comments
- Added reviewer SLA reminder automation with cooldown-aware reminder upserts
- Added multi-repo baseline compare output in dashboard and CSV
- Added prompt trace capture per lens in `.reviewos/traces`
- Added release gate enforcement for release PRs with unresolved critical findings

## v0.1.4

- Added risk-based reviewer routing with ranked CODEOWNERS suggestions
- Added PR label automation for critical/security/ready states
- Added SARIF export for security-centric findings and workflow upload
- Added delta digest (added/resolved findings) in PR report
- Added readiness anomaly detection in dashboard trends

## v0.1.3

- Added policy presets for `startup`, `fintech`, and `enterprise`
- Added governance hardening via policy lock and optional signed config validation
- Added alert routing rules and deduplication windows
- Added GitHub Step Summary output
- Added machine-readable review report output (`.reviewos/last-report.json`)
- Added dashboard chart visuals and CSV export (`docs/review-dashboard.csv`)

## v0.1.2

- Added critical alert integrations (Slack/Discord webhook support)
- Completed per-path required team/user reviewer enforcement
- Added dashboard trend metrics for reviewer coverage and auto-request rates
- Added dashboard publishing workflow for GitHub Pages
- Added policy test matrix with deterministic fixtures

## v0.1.1

- Added path-based policy overrides for sensitive path enforcement
- Added required reviewer coverage checks (`required_users`, `required_teams`)
- Added CODEOWNERS-aware reviewer suggestions and optional auto-request
- Added trend dashboard workflow and dashboard builder script
- Fixed reviewer auto-request 422 by excluding PR author from requests

## v0.1.0

- Added config-driven multi-agent review loop (Engineering/Product/Design/Security)
- Added iterative convergence loop with merge-readiness score
- Added review memory in `.reviewos/history/*.json`
- Added workflow dispatch and fail-on-critical support
- Added local simulation tooling and demo PR templates
