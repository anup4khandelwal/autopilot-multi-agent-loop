# review-os v0.1.2

## Highlights

- Critical alert delivery via Slack/Discord webhooks
- Per-path required reviewer enforcement for users and teams
- Reviewer coverage trend metrics in dashboard
- Dashboard publishing workflow for GitHub Pages
- Deterministic policy test matrix for path overrides and reviewer rules

## New workflows

- `.github/workflows/review-os-pages.yml`
- `.github/workflows/quality.yml`

## Validation

- `bash scripts/validate.sh`
- `node scripts/build-dashboard.mjs`
- `node scripts/render-dashboard-site.mjs`
