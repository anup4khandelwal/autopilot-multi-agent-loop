# Review Rubric (MVP)

## Engineering (0-100)

- Large PR size penalties
- Risk-file penalties (db/auth/payment/workflows)
- Bonus when tests are included

## Product (0-100)

Checks PR body for:
- Problem statement
- User impact
- Acceptance criteria

## Design (0-100)

If frontend files are changed, requires one or more:
- Screenshot references
- UX notes in PR body

## Security (0-100)

Penalties for risky domains:
- auth/session/token/secret changes
- payment/billing changes
- infra/workflow/deployment changes

Can emit critical findings for sensitive changes without tests.
