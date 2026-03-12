# Release Notes v0.1.7

## Highlights

- Reviewer capacity caps
  - `reviewer_routing.weekly_capacity_per_user`
  - `reviewer_routing.weekly_capacity_per_team`
- Adaptive thresholds from repository baseline (`adaptive_thresholds`)
- Escalation matrix with level-based owners/channels (`escalation.levels`)
- Regression signatures for recurring warning/critical patterns
- Per-PR quality scorecards (`.reviewos/scorecards/*.json|*.md`)

## Upgrade Notes

- Tune weekly caps to match your team bandwidth.
- Start with `adaptive_thresholds.blend: 0.5` and adjust after a week of runs.
- Define escalation level rules for your incident process.
- Use scorecard artifacts in PR checks or release governance.

