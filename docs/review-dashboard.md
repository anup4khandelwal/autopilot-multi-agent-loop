# ReviewOS Trend Dashboard

Generated: 2026-03-11T15:22:35.930Z

## Summary

- Total review runs: 30
- Average merge readiness: 78.6
- Last run timestamp: 2026-03-11T15:22:35.788Z

## Lens Averages

| Lens | Average Score |
|---|---:|
| Engineering | 78.1 |
| Product | 100.0 |
| Design | 80.0 |
| Security | 57.4 |

## Lens Visuals

- Engineering: ████████████████░░░░ 78.1
- Product: ████████████████████ 100.0
- Design: ████████████████░░░░ 80.0
- Security: ███████████░░░░░░░░░ 57.4

## Finding Volume

- Critical: 41
- Warning: 97
- Info: 57

## Reviewer Coverage Metrics

- Runs with missing required reviewer coverage: 4
- Total missing reviewer slots (users + teams): 4
- Auto-request attempts: 6
- Auto-request success rate: 0.0%

## Merge Readiness Trend (Recent 10)

- 2026-03-11T15:22:35 PR#102: █████████████████░░░ 87.0
- 2026-03-11T15:22:35 PR#101: ██████████████░░░░░░ 69.0
- 2026-03-11T15:22:35 PR#101: ███████████████░░░░░ 77.0
- 2026-03-11T15:22:35 PR#102: █████████████████░░░ 87.0
- 2026-03-11T15:22:35 PR#101: █████████████████░░░ 84.0
- 2026-03-11T15:22:35 PR#100: ████████████████░░░░ 82.0
- 2026-03-11T15:22:35 PR#42: █████████████░░░░░░░ 64.0
- 2026-03-11T15:22:35 PR#42: ████████████████░░░░ 82.0
- 2026-03-11T15:21:56 PR#102: █████████████████░░░ 87.0
- 2026-03-11T15:21:56 PR#101: ██████████████░░░░░░ 69.0

## Critical by Path Policy Rule

| Rule | Critical Count |
|---|---|
| auth_paths | 5 |
| path_policy_unknown | 4 |
| payments | 2 |

## Top Recurring Findings

| Severity | Lens | Count | Finding |
|---|---|---|---|
| warning | Engineering | 25 | No test file changes detected. |
| critical | Security | 25 | Sensitive changes detected without test updates. |
| info | Memory | 21 | Detected 4 recurring finding(s) from previous review cycle. |
| warning | Design | 20 | Frontend changes detected without UI evidence (screenshots/UX notes). |
| info | Engineering | 20 | Risk-sensitive files touched (1). Ensure focused reviewer coverage. |
| warning | Security | 20 | Sensitive domain changes detected (1 file(s)). |
| info | Engineering | 10 | Risk-sensitive files touched (3). Ensure focused reviewer coverage. |
| warning | Security | 10 | Sensitive domain changes detected (3 file(s)). |

## Notes

- Data source: .reviewos/history/*.json
- This dashboard summarizes historical review runs across PRs.
- CSV export: `docs/review-dashboard.csv`
