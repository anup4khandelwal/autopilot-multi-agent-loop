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

## Upgrade Notes

- Configure `incident_safe` in `.reviewos.yml` and enable only when needed.
- Define `finding_ownership.rules` to map findings to team owners.
- Workflow now builds ownership report alongside dashboard outputs.

