# ReviewOS Trend Dashboard

Generated: 2026-03-12T08:24:23.373Z

## Summary

- Total review runs: 40
- Average merge readiness: 79.5
- Last run timestamp: 2026-03-12T08:24:22.909Z

## Lens Averages

| Lens | Average Score |
|---|---:|
| Engineering | 78.5 |
| Product | 100.0 |
| Design | 79.8 |
| Security | 60.4 |

## Lens Visuals

- Engineering: ████████████████░░░░ 78.5
- Product: ████████████████████ 100.0
- Design: ████████████████░░░░ 79.8
- Security: ████████████░░░░░░░░ 60.4

## Confidence Bands (95%)

| Metric | Mean | Lower | Upper | Margin | N |
|---|---|---|---|---|---|
| Merge Readiness | 79.47 | 77.06 | 81.89 | 2.42 | 40 |
| Engineering | 78.45 | 76.54 | 80.36 | 1.91 | 40 |
| Product | 100.00 | 100.00 | 100.00 | 0.00 | 40 |
| Design | 79.75 | 75.34 | 84.16 | 4.41 | 40 |
| Security | 60.42 | 54.48 | 66.37 | 5.95 | 40 |

## Finding Volume

- Critical: 50
- Warning: 126
- Info: 79

## Reviewer Coverage Metrics

- Runs with missing required reviewer coverage: 3
- Total missing reviewer slots (users + teams): 3
- Auto-request attempts: 10
- Auto-request success rate: 0.0%

## Merge Readiness Trend (Recent 10)

- 2026-03-12T08:24:22 PR#102: █████████████████░░░ 87.0
- 2026-03-12T08:24:22 PR#101: ██████████████░░░░░░ 69.0
- 2026-03-12T08:24:22 PR#101: ███████████████░░░░░ 77.0
- 2026-03-12T08:24:22 PR#102: █████████████████░░░ 87.0
- 2026-03-12T08:24:22 PR#101: █████████████████░░░ 84.0
- 2026-03-12T08:24:22 PR#100: ████████████████░░░░ 82.0
- 2026-03-12T08:24:22 PR#42: █████████████░░░░░░░ 64.0
- 2026-03-12T08:24:22 PR#42: ████████████████░░░░ 82.0
- 2026-03-11T16:23:08 PR#102: █████████████████░░░ 87.0
- 2026-03-11T16:23:08 PR#101: ██████████████░░░░░░ 69.0

## Readiness Anomalies

| Timestamp | PR | Baseline | Current | Drop |
|---|---|---|---|---|
| 2026-03-11T16:03:34 | 42 | 85.3 | 64.0 | 21.3 |

## Multi-Repo Baseline Compare

| Repository | Runs | Avg Readiness | Critical Findings | Warnings |
|---|---|---|---|---|
| local/review-os | 40 | 79.5 | 50 | 126 |

## Critical by Path Policy Rule

| Rule | Critical Count |
|---|---|
| auth_paths | 8 |
| payments | 4 |

## Top Recurring Findings

| Severity | Lens | Count | Finding |
|---|---|---|---|
| warning | Engineering | 35 | No test file changes detected. |
| critical | Security | 35 | Sensitive changes detected without test updates. |
| info | Engineering | 30 | Risk-sensitive files touched (1). Ensure focused reviewer coverage. |
| warning | Security | 30 | Sensitive domain changes detected (1 file(s)). |
| warning | Design | 27 | Frontend changes detected without UI evidence (screenshots/UX notes). |
| info | Memory | 26 | Detected 4 recurring finding(s) from previous review cycle. |
| info | Memory | 13 | Detected 5 recurring finding(s) from previous review cycle. |
| info | Engineering | 10 | Risk-sensitive files touched (3). Ensure focused reviewer coverage. |

## Notes

- Data source: .reviewos/history/*.json
- This dashboard summarizes historical review runs across PRs.
- CSV export: `docs/review-dashboard.csv`
- Repo baseline CSV: `docs/repo-baseline.csv`
- Confidence CSV: `docs/review-confidence.csv`
