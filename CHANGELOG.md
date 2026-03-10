# Changelog

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
