# Contributing to review-os

## Local development

1. Run local simulation:
   - `bash scripts/simulate-review.sh`
2. Inspect generated memory files under `.reviewos/history/`.
3. Keep logic deterministic and avoid external dependencies unless required.

## PR quality expectations

- Include problem/context, user impact, and acceptance criteria.
- Add tests for logic updates.
- Keep PR scope focused.

## Release process

1. Update docs and changelog.
2. Tag release (`vX.Y.Z`).
3. Push branch and tag.
