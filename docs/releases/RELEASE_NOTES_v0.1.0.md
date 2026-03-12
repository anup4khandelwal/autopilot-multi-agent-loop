# review-os v0.1.0

## Highlights

- Multi-agent PR review loop with four lenses:
  - Engineering
  - Product
  - Design
  - Security
- Iterative analysis loop with convergence checks
- Critical finding gate for CI
- Local simulation path for fast testing
- Review memory and recurring finding signal

## Run locally

```bash
bash scripts/simulate-review.sh
```

## GitHub Action

Workflow file: `.github/workflows/review-os.yml`
