# ReviewOS Trend Dashboard

Generated: 2026-03-12T14:03:08.292Z

## Summary

- Total review runs: 40
- Average merge readiness: 79.5
- Last run timestamp: 2026-03-12T14:03:07.954Z

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
- Warning: 182
- Info: 80

## Reviewer Coverage Metrics

- Runs with missing required reviewer coverage: 3
- Total missing reviewer slots (users + teams): 3
- Auto-request attempts: 10
- Auto-request success rate: 0.0%
- Mean time to first review (hours): N/A

## PR Archetype Mix

| Archetype | Runs |
|---|---|
| unknown | 32 |
| chore | 3 |
| infra | 3 |
| feature | 2 |

## Merge Readiness Trend (Recent 10)

- 2026-03-12T14:03:07 PR#102: █████████████████░░░ 87.0
- 2026-03-12T14:03:07 PR#101: ██████████████░░░░░░ 69.0
- 2026-03-12T14:03:07 PR#101: ███████████████░░░░░ 77.0
- 2026-03-12T14:03:07 PR#102: █████████████████░░░ 87.0
- 2026-03-12T14:03:07 PR#101: █████████████████░░░ 84.0
- 2026-03-12T14:03:07 PR#100: ████████████████░░░░ 82.0
- 2026-03-12T14:03:07 PR#42: █████████████░░░░░░░ 64.0
- 2026-03-12T14:03:07 PR#42: ████████████████░░░░ 82.0
- 2026-03-12T11:40:49 PR#102: █████████████████░░░ 87.0
- 2026-03-12T11:40:49 PR#101: ██████████████░░░░░░ 69.0

## Review Debt Trend

| Timestamp | PR | Open Debt | New | Resolved |
|---|---|---|---|---|
| 2026-03-12T14:03:07 | 102 | 28 | 1 | 1 |
| 2026-03-12T14:03:07 | 101 | 28 | 8 | 7 |
| 2026-03-12T14:03:07 | 101 | 27 | 6 | 5 |
| 2026-03-12T14:03:07 | 102 | 26 | 5 | 0 |
| 2026-03-12T14:03:07 | 101 | 21 | 6 | 0 |
| 2026-03-12T14:03:07 | 100 | 15 | 6 | 0 |
| 2026-03-12T14:03:07 | 42 | 9 | 8 | 5 |
| 2026-03-12T14:03:07 | 42 | 6 | 6 | 0 |

## Readiness Anomalies

| Timestamp | PR | Baseline | Current | Drop |
|---|---|---|---|---|
| 2026-03-12T10:05:30 | 42 | 85.3 | 64.0 | 21.3 |

## Multi-Repo Baseline Compare

| Repository | Runs | Avg Readiness | Critical Findings | Warnings |
|---|---|---|---|---|
| local/review-os | 40 | 79.5 | 50 | 182 |

## Change-Risk Heatmap (Top Paths)

| Path | Risk Score | Critical | Warning | Runs |
|---|---|---|---|---|
| src/auth | 189 | 26 | 111 | 19 |
| .github/workflows | 160 | 22 | 94 | 19 |
| src/payments | 47 | 8 | 23 | 4 |
| src/components | 46 | 0 | 46 | 8 |
| src/middleware | 23 | 0 | 23 | 4 |

## Policy Drift (Recent)

| Timestamp | Threshold | Configured | Effective | Delta |
|---|---|---|---|---|
| 2026-03-12T14:03:07 | security_warning | 75 | 60 | -15 |
| 2026-03-12T14:03:07 | design_warning | 75 | 70 | -5 |
| 2026-03-12T14:03:07 | product_warning | 70 | 85 | 15 |
| 2026-03-12T14:03:07 | engineering_warning | 70 | 71 | 1 |
| 2026-03-12T14:03:07 | security_warning | 85 | 64 | -21 |
| 2026-03-12T14:03:07 | design_warning | 78 | 72 | -6 |
| 2026-03-12T14:03:07 | product_warning | 75 | 88 | 13 |
| 2026-03-12T14:03:07 | engineering_warning | 75 | 74 | -1 |
| 2026-03-12T14:03:07 | security_warning | 75 | 60 | -15 |
| 2026-03-12T14:03:07 | design_warning | 75 | 71 | -4 |
| 2026-03-12T14:03:07 | product_warning | 70 | 85 | 15 |
| 2026-03-12T14:03:07 | engineering_warning | 70 | 71 | 1 |
| 2026-03-12T14:03:07 | security_warning | 75 | 60 | -15 |
| 2026-03-12T14:03:07 | design_warning | 75 | 71 | -4 |
| 2026-03-12T14:03:07 | product_warning | 70 | 85 | 15 |
| 2026-03-12T14:03:07 | engineering_warning | 70 | 71 | 1 |
| 2026-03-12T14:03:07 | security_warning | 75 | 60 | -15 |
| 2026-03-12T14:03:07 | design_warning | 75 | 70 | -5 |
| 2026-03-12T14:03:07 | product_warning | 70 | 85 | 15 |
| 2026-03-12T14:03:07 | engineering_warning | 70 | 71 | 1 |

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
| warning | PolicyDrift | 18 | Adaptive thresholds drifted beyond ±8 on: product_warning(+15), security_warning(-15). |
| info | Memory | 14 | Detected 5 recurring finding(s) from previous review cycle. |

## Notes

- Data source: .reviewos/history/*.json
- This dashboard summarizes historical review runs across PRs.
- CSV export: `docs/review-dashboard.csv`
- Repo baseline CSV: `docs/repo-baseline.csv`
- Confidence CSV: `docs/review-confidence.csv`
- Latency CSV: `docs/reviewer-latency.csv`
- Heatmap CSV/JSON: `docs/change-risk-heatmap.csv`, `docs/change-risk-heatmap.json`
- Policy drift CSV: `docs/policy-drift.csv`
