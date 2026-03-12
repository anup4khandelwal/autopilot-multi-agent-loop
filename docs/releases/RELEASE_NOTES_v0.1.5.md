# Release Notes v0.1.5

## Highlights

- Actionable fix suggestions in the ReviewOS PR comment
- Reviewer SLA reminder bot (`.github/workflows/reviewer-sla-reminder.yml`)
- Multi-repo baseline compare in dashboard output (`docs/repo-baseline.csv`)
- Prompt trace capture per lens (`.reviewos/traces/*.json`)
- Release gate enforcement for release PRs with unresolved critical findings

## Upgrade Notes

- Tune `reviewer_sla.threshold_hours` and `reviewer_sla.cooldown_hours` in `.reviewos.yml`.
- Keep `prompt_trace.enabled: true` for auditability and debugability.
- Release gate runs in `review-os` workflow via `node src/release-gate.mjs`.
