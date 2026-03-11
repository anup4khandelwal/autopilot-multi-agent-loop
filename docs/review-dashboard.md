# ReviewOS Trend Dashboard

Generated: 2026-03-11T15:40:26.799Z

## Summary

- Total review runs: 36
- Average merge readiness: 79.2
- Last run timestamp: 2026-03-11T15:40:26.610Z

## Lens Averages

| Lens | Average Score |
|---|---:|
| Engineering | 78.2 |
| Product | 100.0 |
| Design | 80.8 |
| Security | 58.9 |

## Lens Visuals

- Engineering: ████████████████░░░░ 78.2
- Product: ████████████████████ 100.0
- Design: ████████████████░░░░ 80.8
- Security: ████████████░░░░░░░░ 58.9

## Finding Volume

- Critical: 46
- Warning: 114
- Info: 70

## Reviewer Coverage Metrics

- Runs with missing required reviewer coverage: 3
- Total missing reviewer slots (users + teams): 3
- Auto-request attempts: 10
- Auto-request success rate: 0.0%

## Merge Readiness Trend (Recent 10)

- 2026-03-11T15:40:26 PR#102: █████████████████░░░ 87.0
- 2026-03-11T15:40:26 PR#101: ██████████████░░░░░░ 69.0
- 2026-03-11T15:40:26 PR#101: ███████████████░░░░░ 77.0
- 2026-03-11T15:40:26 PR#102: █████████████████░░░ 87.0
- 2026-03-11T15:40:26 PR#101: █████████████████░░░ 84.0
- 2026-03-11T15:40:26 PR#100: ████████████████░░░░ 82.0
- 2026-03-11T15:40:26 PR#42: █████████████░░░░░░░ 64.0
- 2026-03-11T15:40:26 PR#42: ████████████████░░░░ 82.0
- 2026-03-11T15:28:53 PR#102: █████████████████░░░ 87.0
- 2026-03-11T15:28:53 PR#101: ██████████████░░░░░░ 69.0

## Readiness Anomalies

No anomalies detected.

## Multi-Repo Baseline Compare

| Repository | Runs | Avg Readiness | Critical Findings | Warnings |
|---|---|---|---|---|
| local/review-os | 36 | 79.2 | 46 | 114 |

## Critical by Path Policy Rule

| Rule | Critical Count |
|---|---|
| auth_paths | 7 |
| payments | 4 |
| path_policy_unknown | 1 |

## Top Recurring Findings

| Severity | Lens | Count | Finding |
|---|---|---|---|
| warning | Engineering | 31 | No test file changes detected. |
| critical | Security | 31 | Sensitive changes detected without test updates. |
| info | Engineering | 26 | Risk-sensitive files touched (1). Ensure focused reviewer coverage. |
| warning | Security | 26 | Sensitive domain changes detected (1 file(s)). |
| info | Memory | 25 | Detected 4 recurring finding(s) from previous review cycle. |
| warning | Design | 23 | Frontend changes detected without UI evidence (screenshots/UX notes). |
| info | Engineering | 10 | Risk-sensitive files touched (3). Ensure focused reviewer coverage. |
| warning | Security | 10 | Sensitive domain changes detected (3 file(s)). |

## Notes

- Data source: .reviewos/history/*.json
- This dashboard summarizes historical review runs across PRs.
- CSV export: `docs/review-dashboard.csv`
- Repo baseline CSV: `docs/repo-baseline.csv`
