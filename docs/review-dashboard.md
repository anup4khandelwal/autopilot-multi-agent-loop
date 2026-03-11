# ReviewOS Trend Dashboard

Generated: 2026-03-11T15:28:53.257Z

## Summary

- Total review runs: 33
- Average merge readiness: 78.9
- Last run timestamp: 2026-03-11T15:28:53.126Z

## Lens Averages

| Lens | Average Score |
|---|---:|
| Engineering | 78.2 |
| Product | 100.0 |
| Design | 80.0 |
| Security | 58.2 |

## Lens Visuals

- Engineering: ████████████████░░░░ 78.2
- Product: ████████████████████ 100.0
- Design: ████████████████░░░░ 80.0
- Security: ████████████░░░░░░░░ 58.2

## Finding Volume

- Critical: 43
- Warning: 106
- Info: 64

## Reviewer Coverage Metrics

- Runs with missing required reviewer coverage: 3
- Total missing reviewer slots (users + teams): 3
- Auto-request attempts: 8
- Auto-request success rate: 0.0%

## Merge Readiness Trend (Recent 10)

- 2026-03-11T15:28:53 PR#102: █████████████████░░░ 87.0
- 2026-03-11T15:28:53 PR#101: ██████████████░░░░░░ 69.0
- 2026-03-11T15:28:52 PR#101: ███████████████░░░░░ 77.0
- 2026-03-11T15:28:52 PR#102: █████████████████░░░ 87.0
- 2026-03-11T15:28:52 PR#101: █████████████████░░░ 84.0
- 2026-03-11T15:28:52 PR#100: ████████████████░░░░ 82.0
- 2026-03-11T15:28:52 PR#42: █████████████░░░░░░░ 64.0
- 2026-03-11T15:28:52 PR#42: ████████████████░░░░ 82.0
- 2026-03-11T15:22:35 PR#102: █████████████████░░░ 87.0
- 2026-03-11T15:22:35 PR#101: ██████████████░░░░░░ 69.0

## Readiness Anomalies

No anomalies detected.

## Critical by Path Policy Rule

| Rule | Critical Count |
|---|---|
| auth_paths | 7 |
| payments | 3 |
| path_policy_unknown | 2 |

## Top Recurring Findings

| Severity | Lens | Count | Finding |
|---|---|---|---|
| warning | Engineering | 28 | No test file changes detected. |
| critical | Security | 28 | Sensitive changes detected without test updates. |
| info | Memory | 23 | Detected 4 recurring finding(s) from previous review cycle. |
| info | Engineering | 23 | Risk-sensitive files touched (1). Ensure focused reviewer coverage. |
| warning | Security | 23 | Sensitive domain changes detected (1 file(s)). |
| warning | Design | 22 | Frontend changes detected without UI evidence (screenshots/UX notes). |
| info | Engineering | 10 | Risk-sensitive files touched (3). Ensure focused reviewer coverage. |
| warning | Security | 10 | Sensitive domain changes detected (3 file(s)). |

## Notes

- Data source: .reviewos/history/*.json
- This dashboard summarizes historical review runs across PRs.
- CSV export: `docs/review-dashboard.csv`
