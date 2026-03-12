# Release Notes v0.1.10

## Highlights

- Reviewer fairness scoring:
  - balances routing using historical assignment counts
  - surfaces fairness score in `docs/reviewer-queue.csv`
- PR archetype classifier:
  - identifies `feature`, `bugfix`, `docs`, `infra`, `refactor`, and `release`
  - supports archetype-specific threshold and policy overrides
- Review debt ledger:
  - `.reviewos/review-debt.json`
  - `docs/review-debt.md`
  - `docs/review-debt.csv`
- Risk simulation mode:
  - compares alternate thresholds, routing, and merge-window outcomes
  - supports simulation-only execution without mutating GitHub PR state
- Executive weekly digest:
  - `docs/executive-weekly-digest.md`
  - weekly workflow `.github/workflows/review-os-executive-digest.yml`

## Upgrade Notes

- Tune `reviewer_routing.fairness_weight` if reviewer distribution shifts too aggressively.
- Add `archetypes.overrides.*` only for stable, intentional PR patterns.
- Treat the review debt ledger as an operational queue; unresolved warnings and critical findings now persist across runs until cleared.
- Use `bash scripts/run-risk-simulation.sh` before tightening policies on high-risk repos.
