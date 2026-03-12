# Release Notes v0.1.9

## Highlights

- Live reviewer queue board:
  - `docs/reviewer-queue.md`
  - `docs/reviewer-queue.csv`
- Owner-specific SLA thresholds and escalation timers
- Context window budget advisor in PR report
- Risk-aware merge window policy for high-risk PRs
- Historical benchmark badge endpoints:
  - `docs/badges/readiness.json`
  - `docs/badges/latency.json`
  - `docs/badges/critical-rate.json`

## Upgrade Notes

- Define `reviewer_sla.owner_policies` for teams that need tighter follow-up.
- Enable `merge_window` only after choosing the correct local timezone and allowed days/hours.
- Use the reviewer queue board to tune weekly reviewer caps and identify overloaded reviewers.
