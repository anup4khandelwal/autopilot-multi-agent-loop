# review-os v0.1.1

## Highlights

- Path-based policy overrides for stricter controls on sensitive areas
- Required reviewer enforcement per path rule
- CODEOWNERS-based reviewer routing with optional auto-request
- Trend dashboard generation from review memory
- Fix for GitHub 422 reviewer request failure (no PR-author self-request)

## Notable Config Keys

- `path_overrides.<rule>.pattern`
- `path_overrides.<rule>.require_tests`
- `path_overrides.<rule>.required_users`
- `path_overrides.<rule>.required_teams`
- `reviewer_routing.auto_request`

## Validation

- Local simulation pass: `bash scripts/simulate-review.sh`
- Critical path enforcement pass: `bash scripts/validate.sh`
