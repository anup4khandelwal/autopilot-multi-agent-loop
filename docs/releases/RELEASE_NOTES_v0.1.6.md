# Release Notes v0.1.6

## Highlights

- Incident-safe mode for stricter review control during incident windows
  - Security penalty multiplier
  - Minimum approval enforcement
  - Sensitive-path test enforcement
- Dynamic pre-merge checklist in PR comment and CI step summary
- Finding ownership mapping with reports:
  - `docs/finding-ownership.md`
  - `docs/finding-ownership.csv`
- Reviewer load balancing across suggested/requested reviewers
- 95% confidence-band analytics:
  - markdown section in dashboard
  - `docs/review-confidence.csv`

## Upgrade Notes

- Configure `incident_safe` in `.reviewos.yml` and enable only when needed.
- Define `finding_ownership.rules` to map findings to team owners.
- Configure `reviewer_routing.load_balance_*` for reviewer balancing behavior.
- Workflow now builds ownership report alongside dashboard outputs.
