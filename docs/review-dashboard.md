# ReviewOS Trend Dashboard

Generated: 2026-03-11T16:03:57.597Z

## Summary

- Total review runs: 38
- Average merge readiness: 79.3
- Last run timestamp: 2026-03-11T16:03:57.278Z

## Lens Averages

| Lens | Average Score |
|---|---:|
| Engineering | 78.3 |
| Product | 100.0 |
| Design | 80.3 |
| Security | 59.7 |

## Lens Visuals

- Engineering: ████████████████░░░░ 78.3
- Product: ████████████████████ 100.0
- Design: ████████████████░░░░ 80.3
- Security: ████████████░░░░░░░░ 59.7

## Finding Volume

- Critical: 48
- Warning: 120
- Info: 75

## Reviewer Coverage Metrics

- Runs with missing required reviewer coverage: 3
- Total missing reviewer slots (users + teams): 3
- Auto-request attempts: 10
- Auto-request success rate: 0.0%

## Merge Readiness Trend (Recent 10)

- 2026-03-11T16:03:57 PR#102: █████████████████░░░ 87.0
- 2026-03-11T16:03:57 PR#101: ██████████████░░░░░░ 69.0
- 2026-03-11T16:03:57 PR#101: ███████████████░░░░░ 77.0
- 2026-03-11T16:03:56 PR#102: █████████████████░░░ 87.0
- 2026-03-11T16:03:56 PR#101: █████████████████░░░ 84.0
- 2026-03-11T16:03:56 PR#100: ████████████████░░░░ 82.0
- 2026-03-11T16:03:56 PR#42: █████████████░░░░░░░ 64.0
- 2026-03-11T16:03:56 PR#42: ████████████████░░░░ 82.0
- 2026-03-11T16:03:35 PR#102: █████████████████░░░ 87.0
- 2026-03-11T16:03:35 PR#101: ██████████████░░░░░░ 69.0

## Readiness Anomalies

| Timestamp | PR | Baseline | Current | Drop |
|---|---|---|---|---|
| 2026-03-11T15:28:52 | 42 | 85.3 | 64.0 | 21.3 |

## Multi-Repo Baseline Compare

| Repository | Runs | Avg Readiness | Critical Findings | Warnings |
|---|---|---|---|---|
| local/review-os | 38 | 79.3 | 48 | 120 |

## Critical by Path Policy Rule

| Rule | Critical Count |
|---|---|
| auth_paths | 8 |
| payments | 4 |

## Top Recurring Findings

| Severity | Lens | Count | Finding |
|---|---|---|---|
| warning | Engineering | 33 | No test file changes detected. |
| critical | Security | 33 | Sensitive changes detected without test updates. |
| info | Engineering | 28 | Risk-sensitive files touched (1). Ensure focused reviewer coverage. |
| warning | Security | 28 | Sensitive domain changes detected (1 file(s)). |
| info | Memory | 26 | Detected 4 recurring finding(s) from previous review cycle. |
| warning | Design | 25 | Frontend changes detected without UI evidence (screenshots/UX notes). |
| info | Memory | 11 | Detected 5 recurring finding(s) from previous review cycle. |
| info | Engineering | 10 | Risk-sensitive files touched (3). Ensure focused reviewer coverage. |

## Notes

- Data source: .reviewos/history/*.json
- This dashboard summarizes historical review runs across PRs.
- CSV export: `docs/review-dashboard.csv`
- Repo baseline CSV: `docs/repo-baseline.csv`
