# WhereNova — Audit fixes (Claude Code brief)

Source: `docs/MVP-AUDIT-2026-08-29.md`

Three product decisions have been made and are recorded below — do not
re-open them.

Pull latest `origin/main` and confirm a clean tree before starting. Commit
after each Part.

---

# PART 1 — Travel mode label can be factually wrong

**Highest priority.** Audit Area 2, Q4.

`practicality.js:179-183` falls back to the destination's authored
`travel_mode` string whenever it exists. That field is a single value per
destination, often written assuming a nearby origin. Paris's reads "Direct
Eurostar train" — and is shown verbatim to a New York traveller, whose
computed 13.3h clearly came from the flight formula, not a train.

This is a factual-accuracy bug on a claim users act on.

**Fix:** only use the authored `travel_mode` when a regional-route override
actually applies to this origin/destination pair. For all other routes,
generate an accurate generic label from the computed path (flight, plus local
transport) using the existing `normalizeMode()` vocabulary in
`src/lib/travelMode.js`.

Do not attempt to make `travel_mode` fully origin-aware — that's a larger
data-modelling change. Scoping the authored string to override routes only
removes the false claim now.

**Verify:** New York → Paris no longer shows a train. Check at least 5 other
origin/destination pairs where an authored `travel_mode` exists but no
override applies, and confirm each label is accurate for that origin. Confirm
override routes (e.g. London → Dublin, Vancouver → Whistler) still show their
curated label unchanged.

---

# PART 2 — Result-count edge cases

Audit Area 1, Q5.

**Product decision made:** show however many practical matches exist, even if
fewer than three, *and* always offer actionable suggestions for reaching
three. Do not relax the eligibility gate to pad the count.

**2a. Header grammar.** `Results.jsx:102-104` renders
`Your top {top.length} matches` unconditionally, producing "Your top 0
matches" above the empty state and "Your top 1 matches" for a single result.

Fix so:
- 0 results → header does not claim matches at all
- 1 result → singular
- 2–3 → plural

**2b. Two-result layout.** `Results.jsx:179-184` renders
`withPills.slice(1)` inside `grid md:grid-cols-2`, so a 2-result page shows
one supporting card beside a visibly empty column. Make the layout adapt so a
single supporting card doesn't sit in a half-empty grid.

**2c. Suggestions gap — the real fix.** Today the actionable suggestion chips
only appear when some result scores below 50. When a user gets 1–2 results
that are all *good* (≥50), they see "there simply aren't more destinations in
the catalogue that meet these specific constraints" and are offered nothing
to change.

Per the product decision, that case should also offer suggestions. Reuse the
existing suggestion-chip mechanism — surface the same kind of actionable
levers ("Increase your trip to at least N days", "Allow domestic
destinations", "Broaden your interests") whenever fewer than 3 results are
returned, regardless of score.

Keep the honest framing — don't imply more matches definitely exist, just
show what could be adjusted.

**Verify live** using audit-confirmed reproducible cases: Tokyo/10d/domestic
(1 result), Vancouver/3d/domestic with 4 exclusions (2 results),
Vancouver/1d/domestic (0 results).

---

# PART 3 — "Clear my data" doesn't refresh

Audit Area 4, Q4.

Deletion is correct and complete, but the current page doesn't re-render.
The user still sees their Travel Fit banner and saved-trip cards after
confirming an explicitly irreversible action, with no visual confirmation it
worked.

Fix so the current view updates immediately — banner gone, saved-trip rails
empty — without requiring a manual reload.

**Verify live:** save a trip, complete a Travel Fit, click "Clear my data",
confirm, and check the page updates in place.

---

# PART 4 — Documentation corrections

Two audit findings resolve to documentation fixes, not code changes. **Do
not change the behaviour of either.**

**4a. `min_days`** — `docs/AGENTS.md` (and anywhere else it's described)
states `min_days` is the lever protecting against unrealistically short
bookings on drive-heavy destinations. That is false as implemented. Correct
it to:

> `min_days` is a **soft scoring signal only** (up to 15 of 100 points via
> trip-length fit in `scoring.js`), plus display use in
> `discoveryCollections.js` and `storage.js`. It plays no role in
> `isPractical()` / `minUsableDays()`. The actual gate preventing
> impractical bookings is the travel-time tier system in `practicality.js`,
> entirely independent of `min_days`.
> **Decision (2026-08-29):** leave as a soft signal. Adding a second hard
> gate would worsen the already-thin result counts. The travel-time gate
> already covers the real safety case.

**4b. "No preference"** — previously documented as rank-neutral via
`levelDistance`/`BUDGET_ORDER.indexOf` returning -1. That's not what happens
for climate. `scoring.js:100-102` has a dedicated early return awarding
**full credit (10/10)** to every destination. Correct the documentation to:

> "No preference" on climate awards **full credit** to every destination
> (`scoring.js:100-102`), not a skipped dimension. An genuinely unset field
> (e.g. `budget: undefined`) instead awards **zero** via the `indexOf(-1)`
> path. Both are rank-neutral, but they move absolute scores in opposite
> directions (+10 vs +0).
> **Decision (2026-08-29):** keep full credit. Ranking is unaffected either
> way, and changing scoring maths carries real risk for a cosmetic gain.
> Revisit during the recommender round if inflated absolute scores become a
> problem.

---

# PART 5 — Trivial cleanup

`src/lib/coordinates.js` defines the `uruguay` key twice in
`COUNTRY_CENTROIDS` (lines 160 and 239, identical values). esbuild flags it
as a duplicate-key warning. Remove the duplicate.

---

# PART 6 — Record a parked item

Add to `docs/PARKED.md`:

```
PARKED — Origin-agnostic connection overhead
Each destination carries flat connection_hours and internal_access_penalty
values applied regardless of the traveller's actual origin. Authored for a
distant origin, they badly overstate travel time for nearby ones — e.g.
Sydney -> South Island NZ computes 11.7h against a real ~3.5h direct flight
(3x). Didn't cause an eligibility failure in audit testing, but it understates
practicality and depresses the score via travelPenalty for close origins.
Fixing properly means making these fields origin-aware, which is a data-model
change, not a display fix. Revisit during the recommender/scoring round.

PARKED — Score clustering for under-specified profiles
A user who skips interests, leaves climate on "No preference" and month on
flexible gets a top-10 spread of 2 points (68-70) — the score stops carrying
information. Confirmed with real data (audit profile P8). Related to the
"No preference awards full credit" decision above. Options: nudge users to
pick at least one interest, or revisit how unset dimensions are scored.
Revisit during the recommender round.

PARKED — Saved trips are snapshots, not live
Saved trips copy destination content at save time and never re-read the
Destination entity. Consequence: anyone who saved Victoria, Tofino or
Tanzania & Zanzibar before 2026-08-29 still sees the old defective images.
This is deliberate (SavedTripDetail.jsx documents it), but decide whether
saved trips should ever refresh stale content, or whether a one-off migration
is warranted for the three regenerated images.

PARKED — Generic recommendation reasons
buildReasons() is accurate but formulaic: two structurally different
destinations with identical score breakdowns produce byte-identical reason
text (confirmed — NYC profile gave New York City and Istanbul & Cappadocia
the same three strings). withDedupedPills() mitigates this within a single
results page but not across sessions. Needs destination-specific content,
not a code fix. Revisit with the "why this month" data work.
```

---

# Verification

Lint and build clean after each Part. Live-browser verification is required
for Parts 1, 2 and 3 — do not claim it for anything you couldn't actually
load. Report which checks were live versus code-traced.
