# WhereNova — Multi-Destination Country Itineraries — Build Brief

Date: 2026-09-18
Status: Ready to hand to Claude Code
Builds on: `wherenova-door2-build-brief.md` (Door 2 shipped), `wherenova-tier1-build-brief.md` (Tier 1 shipped)

---

## 0. Risk framing

**`itinerary.js` stays fully protected — zero edits.** `generateItinerary(dest, prefs)`
is used as a black box, called once per destination leg exactly as it already
works today. All new logic — ordering, day-splitting, stitching legs together,
inserting transit days — lives in a **new file**,
`src/lib/multiDestItinerary.js`.

**`storage.js` is NOT on the protected list but needs real care.**
`tripFingerprint()` and `buildTripSnapshot()` currently assume a single
`destinationId`. This build extends both to also accept an array of
destination ids for a multi-stop trip, **without changing behavior for any
existing single-destination call site.** Every existing saved trip must still
load and render exactly as before — this is the one regression risk in this
build and needs explicit verification (§9).

`scoring.js`, `practicality.js`, `questionnaireFlow.js` are read from
(`haversineKm`, `getDestinationCoords`, `CITY_COUNTRY`/`inferCountry`) but not
edited.

If at any point this can't be done without editing `itinerary.js` or
`practicality.js`, stop and report back — don't work around it by copy-pasting
protected internals into the new file.

---

## 1. Context: the decision this implements

Rockstar approved multi-destination country itineraries — chaining several
covered destinations in one country (e.g. Delhi, Agra, Jaipur) into a single
trip, rather than picking just one.

**Decided approach:** WhereNova proposes a default order and day-split; the
user adjusts it before the trip is built. Not blank-slate manual planning —
most users don't know the right geographic sequencing for cities they've
never visited, and this keeps Door 2's existing low-friction pattern (ask
little, show a real result fast, let them refine).

---

## 2. Existing assets to reuse (verified present — do not rebuild)

| Asset | Location | Use in this build |
|---|---|---|
| `generateItinerary(dest, prefs)` | `src/lib/itinerary.js` | Called once per leg, completely unmodified |
| `haversineKm(a, b)` | `src/lib/practicality.js` (exported) | Distance for both leg-ordering and the inter-leg transit estimate |
| `getDestinationCoords(dest)` | `src/lib/coordinates.js` | Gateway coords per destination for the above |
| `getCityCoords(city, country)` | `src/lib/coordinates.js` | Resolve the user's departure city, to anchor the default starting leg |
| `min_days` / `max_days` | `Destination` entity | Weight for the default day-split |
| Country grouping UI (built in Tier 1) | `src/components/doorb/DestinationSearch.jsx` | Extend with the multi-stop entry point (§3) |
| `DayCard.jsx` | `src/components/DayCard.jsx` | Renders a generic `{ day, isTravel, flexible, events }` object — confirmed destination-agnostic, reusable with zero changes |
| `SavedTrip.snapshot` | Entity schema | `additionalProperties: true` — no schema change needed to store a multi-stop snapshot |

**Not exported, do not import — replicate the documented formula instead:**
`flightHours(distanceKm)` in `practicality.js` is internal
(`distanceKm / 800 + 0.75`, a ~800km/h cruise estimate plus a fixed 45-minute
allowance). The new transit-day estimator in `multiDestItinerary.js` uses this
same public formula directly — it's documented in a comment in that file, not
a guess — rather than reaching into the protected file.

---

## 3. Entry point: Door 2 country group → "combine into one trip"

Extends the country-group UI shipped in Tier 1 (`DestinationSearch.jsx`).

**Build:** when a country group has **2 or more** covered destinations, add a
second option below the existing per-destination list:

> Combine {N} of these into one trip across {Country}

Selecting a single destination from the list behaves exactly as it does
today (unchanged). Selecting "combine" moves into the new leg-planner step
(§4) instead of straight to essentials.

Do not show this option for a single-destination country match (e.g. Japan →
Tokyo & Kyoto only has 1 today, so no combine option) — combining requires
at least 2 legs to mean anything.

---

## 4. Leg planner step (new)

New step between destination selection and the essentials step, only reached
via the "combine" path in §3.

**Default proposal, computed on entry (no network calls, all synchronous):**

1. **Order** — nearest-neighbor greedy route over the selected destinations'
   gateway coordinates (`haversineKm` pairwise). Start from whichever
   destination is nearest the user's resolved departure city if
   `getCityCoords(departureCity)` resolves; otherwise start from the first
   destination in the group as returned by the entity query.
2. **Day split** — default total trip length starts at the sum of each
   destination's `min_days` (a sane floor), distributed proportionally to
   each destination's `min_days` as a weight. If the user changes the total
   days afterward, re-distribute proportionally and re-floor at each
   destination's `min_days`; if the total can't fit every leg's `min_days`,
   say so plainly rather than silently violating a floor.

**UI:** a simple ordered list, one row per destination — name, day-count
stepper, up/down reorder arrows (no drag-and-drop for v1). A running total of
days is shown and updates live as the user adjusts. A short line states the
default was WhereNova's suggestion and can be changed.

Continuing from this step feeds the ordered destination-list + per-leg day
counts into the essentials step (when / who / pace — same as Door 2 today,
now applied trip-wide) and then into the stitching build (§5).

---

## 5. Stitching module (new file: `src/lib/multiDestItinerary.js`)

Exports one function: `generateMultiDestItinerary(legs, prefs)`, where `legs`
is the ordered array of `{ destination, days }` from §4 and `prefs` is the
existing prefs shape (`buildPrefs()` output) applied trip-wide.

**Per leg:**

1. Call `generateItinerary(leg.destination, { ...prefs, travelDays: leg.days })`
   exactly as it works today — completely unmodified, one call per leg.
2. This gives each leg its own self-contained arrival/middle/return days,
   built for a standalone trip to that one destination.

**Stitching (the actual new logic):**

3. At each boundary between leg N and leg N+1, drop leg N's trailing
   "return travel" day(s) and leg N+1's leading "outbound travel" day(s) —
   these assumed a return to the user's home city, which isn't happening
   mid-trip.
4. Replace both with **one** inter-leg transit day, computed from
   `haversineKm(destCoordsN, destCoordsN+1)` through the documented
   `distanceKm / 800 + 0.75` formula (§2), labeled honestly with the actual
   estimated hours and the two city names — e.g. "Agra → Jaipur, ~4hr
   overland" or "~1.5hr flight" depending on distance (reuse the same
   distance-band language pattern already used elsewhere in the app, don't
   invent new wording conventions).
5. Renumber the combined `days[]` sequentially across the whole trip
   (`day: 1..N`), and tag each day with which leg/destination it belongs to
   (a `legDestinationId` or similar field) so the UI in §6 can label it.

**Where destination-pair distance can't be resolved** (missing gateway
coords on either side — shouldn't happen given current data, but don't
assume): fall back to a clearly-labeled placeholder transit day rather than
fabricating a number, and log which pair hit this so it can be checked.

---

## 6. Display: `TripView.jsx` multi-stop header

`DayCard.jsx` needs no changes — confirmed it already renders a generic day
object.

`TripView.jsx` currently assumes one destination for its whole header
(name, country flag, images). For a multi-stop trip:

- Add a compact multi-stop strip near the top — the ordered destination
  names with day-count per leg (e.g. "Delhi · 3d → Agra · 2d → Jaipur · 3d").
- Where the existing single-destination header pulls `dest.name`,
  `nameWithCountry`, images etc., branch to show the country name and this
  strip instead when rendering a multi-stop trip.
- In the day list, add a lightweight divider or label at each leg boundary
  so it's clear which days belong to which stop (using the
  `legDestinationId` tagged in §5).

Keep this additive — a normal single-destination trip must render exactly as
it does today; only a multi-stop trip takes the new branch.

---

## 7. Storage layer: `storage.js` (careful, not protected but shared code)

`tripFingerprint(prefs, destinationId)` and `buildTripSnapshot({...})`
currently take one `destinationId`. Extend both to also accept an array of
destination ids for a multi-stop trip:

- `tripFingerprint`: when given an array, build the fingerprint from the
  ordered list of ids + per-leg day counts + prefs, so two different orderings
  or splits are recognized as different trips.
- `buildTripSnapshot`: store the ordered leg list (`destinationId`, `days`)
  alongside the existing single-destination fields, so a saved multi-stop
  trip reloads and renders identically later — same guarantee the existing
  snapshot already gives single-destination trips.

**Do not change the shape or behavior of either function for existing
single-destination calls.** This is additive: a new optional parameter /
branch, not a rewrite. `SavedTrip.snapshot` needs no entity schema change
(`additionalProperties: true` already covers it).

---

## 8. Non-goals for this build (flag, don't build)

- No AI-assisted or preference-weighted ordering beyond nearest-neighbor —
  that's a real future improvement, not v1.
- No drag-and-drop leg reordering — arrows only.
- No per-leg refine sheet (pace/budget/interests) — prefs apply trip-wide,
  same as a single-destination trip does today. Per-leg refine is a
  reasonable future ask, not this build.
- No changes to the miss-state, climate alert, origin chips, or cross-door
  nudge shipped in Tier 1 — this build only touches the country-group →
  combine path.
- Does not touch `interactive region area-picking` (still deferred, separate
  item) or `itinerary editing` (separate near-term priority, not this build).

---

## 9. Verification before reporting done

- Confirm via `git diff --stat` that `itinerary.js`, `scoring.js`,
  `practicality.js`, and `questionnaireFlow.js` show **zero changes**
- **Regression, single-destination path:** build a normal one-destination
  trip (e.g. Kerala) exactly as before, confirm it renders identically to
  pre-build behavior — header, days, packing, everything
- **Regression, existing saved trips:** load an existing single-destination
  saved trip created before this build; confirm it still loads and renders
  correctly (this is the real risk given `storage.js` changes)
- Country combine option appears only for countries with 2+ covered
  destinations (test India → shows combine option; Japan's current 1-match
  state → does not)
- Leg planner: confirm the default order is genuinely nearest-neighbor (not
  just entity-query order) and the default day split respects each
  destination's `min_days` floor
- Reordering and day-count adjustment in the leg planner updates the running
  total live and is reflected in the built trip
- Build a real multi-stop trip (e.g. Delhi → Agra → Jaipur), confirm: each
  leg's activity days look like a normal `generateItinerary()` output for
  that destination, exactly one transit day appears at each boundary with a
  real distance/time estimate (not a placeholder), days are numbered
  sequentially across the whole trip, and the leg-boundary labels in
  `TripView.jsx` are correct
- Save the multi-stop trip, reload the page, confirm it reloads identically
  from `SavedTrip.snapshot`

Full regression suite is NOT strictly gated on this build (no protected
files touched), but given the `storage.js` change, run it before shipping to
production regardless — same as Tier 1's policy.
