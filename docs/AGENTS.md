# Scoring & practicality notes

Corrections to documentation-vs-implementation mismatches found during the
2026-08-29 MVP audit (`docs/MVP-AUDIT-2026-08-29.md`). No behaviour changed
for either item below — see `docs/wherenova-audit-fixes-brief.md` Part 4 for
the product decisions.

## `min_days`

`min_days` is a **soft scoring signal only** (up to 15 of 100 points via
trip-length fit in `scoring.js`), plus display use in
`discoveryCollections.js` and `storage.js`. It plays no role in
`isPractical()` / `minUsableDays()`. The actual gate preventing impractical
bookings is the travel-time tier system in `practicality.js`, entirely
independent of `min_days`.

**Decision (2026-08-29):** leave as a soft signal. Adding a second hard gate
would worsen the already-thin result counts. The travel-time gate already
covers the real safety case.

## "No preference" (climate)

"No preference" on climate awards **full credit** to every destination
(`scoring.js:100-102`), not a skipped dimension. A genuinely unset field
(e.g. `budget: undefined`) instead awards **zero** via the `indexOf(-1)`
path. Both are rank-neutral, but they move absolute scores in opposite
directions (+10 vs +0).

**Decision (2026-08-29):** keep full credit. Ranking is unaffected either
way, and changing scoring maths carries real risk for a cosmetic gain.
Revisit during the recommender round if inflated absolute scores become a
problem.
