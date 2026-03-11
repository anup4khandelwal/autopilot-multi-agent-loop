# Release Notes v0.1.4

## Highlights

- Risk-based reviewer routing over CODEOWNERS matches
- PR label automation for review status:
  - `reviewos:critical`
  - `reviewos:security`
  - `reviewos:ready`
- SARIF export for security findings (`.reviewos/security-findings.sarif`)
- Delta digest in ReviewOS comment (added/resolved findings)
- Merge-readiness anomaly detection in dashboard analytics

## Upgrade Notes

- Ensure labels exist in your repo if label automation is enabled.
- `review-os` workflow now requests `security-events: write` to upload SARIF.
- Keep `reviewer_routing.risk_based: true` for priority reviewer ranking.

