# Release Notes v0.1.3

## Highlights

- Policy presets: `startup`, `fintech`, `enterprise`
- Governance hardening:
  - Config hash lock (`governance.policy_lock` + expected SHA-256)
  - Optional config signature verification (HMAC)
- Alert routing and deduplication windows
- GitHub Step Summary output for faster PR triage
- Machine-readable latest report output (`.reviewos/last-report.json`)
- Dashboard upgrades: visual bars + CSV export (`docs/review-dashboard.csv`)

## Upgrade Notes

- Set `policy_preset` in `.reviewos.yml` (or `REVIEW_OS_POLICY_PRESET`) to apply a baseline.
- If using governance policy lock, provide `governance.expected_sha256` or env `REVIEW_OS_POLICY_SHA256`.
- If using signatures, set `governance.signature` and env secret `REVIEW_OS_SIGNATURE_SECRET`.
