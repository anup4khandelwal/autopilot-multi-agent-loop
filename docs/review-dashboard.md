# ReviewOS Trend Dashboard

Generated: 2026-03-11T15:10:40.433Z

## Summary

- Total review runs: 18
- Average merge readiness: 78.1
- Last run timestamp: 2026-03-11T15:10:26.817Z

## Lens Averages

| Lens | Average Score |
|---|---:|
| Engineering | 78.2 |
| Product | 100.0 |
| Design | 76.7 |
| Security | 56.8 |

## Finding Volume

- Critical: 21
- Warning: 64
- Info: 33

## Reviewer Coverage Metrics

- Runs with missing required reviewer coverage: 2
- Total missing reviewer slots (users + teams): 2
- Auto-request attempts: 4
- Auto-request success rate: 0.0%

## Critical by Path Policy Rule

| Rule | Critical Count |
|---|---|
| path_policy_unknown | 4 |
| auth_paths | 2 |

## Top Recurring Findings

| Severity | Lens | Count | Finding |
|---|---|---|---|
| warning | Design | 14 | Frontend changes detected without UI evidence (screenshots/UX notes). |
| info | Memory | 12 | Detected 4 recurring finding(s) from previous review cycle. |
| warning | Engineering | 12 | No test file changes detected. |
| critical | Security | 12 | Sensitive changes detected without test updates. |
| info | Engineering | 10 | Risk-sensitive files touched (3). Ensure focused reviewer coverage. |
| warning | Security | 10 | Sensitive domain changes detected (3 file(s)). |
| warning | PathPolicy | 10 | Rule 'workflow_paths' matched 1 file(s); penalties applied (eng:4, product:0, design:0, sec:6). |
| info | Engineering | 8 | Risk-sensitive files touched (1). Ensure focused reviewer coverage. |

## Notes

- Data source: .reviewos/history/*.json
- This dashboard summarizes historical review runs across PRs.
