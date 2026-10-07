# Seed dataset strategy

- Base seed: `42`
- Reference date: `2026-09-30T23:59:59.999Z`
- Default volumes follow `docs/architecture.md` §3.2 exactly for the local artifact target.
- `SEED_SCALE` only reduces counts for tests or ad-hoc fast runs; the CLI default is full scale.

## How coherence is enforced

- Channel allocation is deterministic and weighted by profile, so `META` has the highest lead volume, `GOOGLE_SEARCH` stays in the middle, `LINKEDIN` stays smaller, and `ORGANIC` stays low-volume.
- Company size, revenue range, and touchpoint cost are channel-biased by construction: `LINKEDIN` skews to larger companies with higher revenue buckets and higher media costs.
- Product-count allocation gives `Média` companies the highest cap and the strongest extra-weight, so they contract more products on average.
- Activation is generated from deterministic probabilities that combine channel profile, onboarding duration, and unresolved-conversation load. Faster onboarding (`<=3` days) increases D30 activation; more than one unresolved conversation decreases it.
- Stable ID sorting plus a fixed Faker seed and keyed PRNGs keep `data/dataset.json` byte-identical for the same inputs.
