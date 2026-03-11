# ReviewOS Trend Dashboard

Generated: 2026-03-11T16:23:08.506Z

## Summary

- Total review runs: 39
- Average merge readiness: 79.4
- Last run timestamp: 2026-03-11T16:23:08.090Z

## Lens Averages

| Lens | Average Score |
|---|---:|
| Engineering | 78.4 |
| Product | 100.0 |
| Design | 80.0 |
| Security | 60.1 |

## Lens Visuals

- Engineering: ████████████████░░░░ 78.4
- Product: ████████████████████ 100.0
- Design: ████████████████░░░░ 80.0
- Security: ████████████░░░░░░░░ 60.1

## Confidence Bands (95%)

| Metric | Mean | Lower | Upper | Margin | N |
|---|---|---|---|---|---|
| Merge Readiness | 79.41 | 76.93 | 81.89 | 2.48 | 39 |
| Engineering | 78.38 | 76.43 | 80.34 | 1.96 | 39 |
| Product | 100.00 | 100.00 | 100.00 | 0.00 | 39 |
| Design | 80.00 | 75.50 | 84.50 | 4.50 | 39 |
| Security | 60.08 | 54.01 | 66.14 | 6.06 | 39 |

## Finding Volume

- Critical: 49
- Warning: 123
- Info: 77

## Reviewer Coverage Metrics

- Runs with missing required reviewer coverage: 3
- Total missing reviewer slots (users + teams): 3
- Auto-request attempts: 10
- Auto-request success rate: 0.0%

## Merge Readiness Trend (Recent 10)

- 2026-03-11T16:23:08 PR#102: █████████████████░░░ 87.0
- 2026-03-11T16:23:08 PR#101: ██████████████░░░░░░ 69.0
- 2026-03-11T16:23:07 PR#101: ███████████████░░░░░ 77.0
- 2026-03-11T16:23:07 PR#102: █████████████████░░░ 87.0
- 2026-03-11T16:23:07 PR#101: █████████████████░░░ 84.0
- 2026-03-11T16:23:07 PR#100: ████████████████░░░░ 82.0
- 2026-03-11T16:23:07 PR#42: █████████████░░░░░░░ 64.0
- 2026-03-11T16:23:07 PR#42: ████████████████░░░░ 82.0
- 2026-03-11T16:03:57 PR#102: █████████████████░░░ 87.0
- 2026-03-11T16:03:57 PR#101: ██████████████░░░░░░ 69.0

## Readiness Anomalies

| Timestamp | PR | Baseline | Current | Drop |
|---|---|---|---|---|
| 2026-03-11T15:40:26 | 42 | 85.3 | 64.0 | 21.3 |

## Multi-Repo Baseline Compare

| Repository | Runs | Avg Readiness | Critical Findings | Warnings |
|---|---|---|---|---|
| local/review-os | 39 | 79.4 | 49 | 123 |

## Critical by Path Policy Rule

| Rule | Critical Count |
|---|---|
| auth_paths | 8 |
| payments | 4 |

## Top Recurring Findings

| Severity | Lens | Count | Finding |
|---|---|---|---|
| warning | Engineering | 34 | No test file changes detected. |
| critical | Security | 34 | Sensitive changes detected without test updates. |
| info | Engineering | 29 | Risk-sensitive files touched (1). Ensure focused reviewer coverage. |
| warning | Security | 29 | Sensitive domain changes detected (1 file(s)). |
| warning | Design | 26 | Frontend changes detected without UI evidence (screenshots/UX notes). |
| info | Memory | 26 | Detected 4 recurring finding(s) from previous review cycle. |
| info | Memory | 12 | Detected 5 recurring finding(s) from previous review cycle. |
| info | Engineering | 10 | Risk-sensitive files touched (3). Ensure focused reviewer coverage. |

## Notes

- Data source: .reviewos/history/*.json
- This dashboard summarizes historical review runs across PRs.
- CSV export: `docs/review-dashboard.csv`
- Repo baseline CSV: `docs/repo-baseline.csv`
- Confidence CSV: `docs/review-confidence.csv`
