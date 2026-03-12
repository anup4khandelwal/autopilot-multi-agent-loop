# Release Notes v0.1.8

## Highlights

- Cross-PR duplicate detection (`cross_pr_duplicates`)
- Auto-split recommendations for large PRs (`auto_split`)
- Reviewer response latency analytics (`docs/reviewer-latency.csv`)
- Change-risk heatmap exports (`docs/change-risk-heatmap.csv`, `docs/change-risk-heatmap.json`)
- Policy drift detection + export (`docs/policy-drift.csv`)

## Upgrade Notes

- Tune auto-split limits per team PR size preference.
- Keep cross-PR duplicate detection enabled to reduce repeated regressions.
- Monitor policy drift report weekly and adjust baseline thresholds as needed.

