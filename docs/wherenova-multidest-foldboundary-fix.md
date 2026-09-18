# WhereNova — Fix: Multi-Dest Fold-Boundary Days Show Wrong Origin Text

Date: 2026-09-18
Status: Ready to hand to Claude Code
Builds on: the just-shipped multi-destination itinerary build (commit `e1fb2b6`)

---

## 0. Risk framing

**Zero protected-file changes needed — confirmed by direct code reading, not
assumption.** `itinerary.js` stays completely untouched. The fix is entirely
inside `src/lib/multiDestItinerary.js` (already a new, unprotected file from
the last build). If you find yourself needing to touch `itinerary.js`, stop
and report back — the design below should not require it.

---

## 1. The bug

Confirmed by reading the shipped code directly (not from a test failure):
for `fold`/`partialFold`-tier legs — the common case, e.g. any short-haul
domestic leg such as Kerala→Goa — `itinerary.js`'s `buildTemplateDay()`
folds the outbound/return travel *into* a normal activity day rather than
producing a separate travel day. Those folded days are marked
`isTravel: false`, so `multiDestItinerary.js`'s current
`dropLeadingTravel()`/`dropTrailingTravel()` (which only checks
`day.isTravel`) does not strip them at leg boundaries.

Worse, the folded day's timeline text is hardcoded to the user's real
departure city (`o.origin`, e.g. "Vancouver"), not the adjacent leg:

```js
// itinerary.js, buildTemplateDay(), returnFold branch — READ ONLY, do not edit
timeline.push(seq("Return begins", "Head to airport or station", ...));
timeline.push(seq("Arrive home", `Return to ${o.origin}`, `Travel home to ${o.origin}.`));
...
overnight: isReturnDay ? "Home" : `Overnight in ${location}.`
```

So a Kerala→Goa stitch currently shows Kerala's last day saying "Arrive
home... Return to Vancouver" and "Overnight: Home," immediately followed by
the (correct) new transit day to Goa, immediately followed by Goa's first
day saying "Depart Vancouver... Arrive in Goa." The transit day is right;
the folded days on either side of it are wrong.

---

## 2. Why this doesn't need `itinerary.js`

Every timeline entry already carries a structural signal, confirmed by
reading `act()` and `seq()` in `itinerary.js` (again, read-only — do not
modify):

```js
const act = (slot, time, name, note) => ({ slot, time, duration: ..., name, source: null, note });
const seq = (slot, name, note, duration) => ({ slot, time: null, duration, name, source: null, note });
```

`act()` entries (real activities — morning outing, lunch, evening plans)
always have a real `time` range. `seq()` entries (journey steps —
Departure, Arrival, Return begins, Arrive home) always have `time: null`.
That's enough to detect and strip just the journey lines from a folded day,
purely from the data `generateItinerary()` already returns — no new field,
no `itinerary.js` change.

---

## 3. Fix: `src/lib/multiDestItinerary.js`

**Detecting a fold-boundary day**, purely from its shape:

```js
function isFoldBoundaryDay(day) {
  return day.isTravel === false
    && Array.isArray(day.timeline)
    && day.timeline.some((e) => e.time == null);
}
```

**Replace the current `dropLeadingTravel()`/`dropTrailingTravel()`** (which
only strip `isTravel: true` days) with logic that handles both cases:

- A pure `isTravel: true` day at the boundary (medium/long tier legs): drop
  it entirely, exactly as today — unchanged behavior.
- A fold-boundary day at the boundary (fold/partialFold tier legs, the new
  case this fixes): don't drop the whole day — it carries real activity
  content worth keeping. Instead:
  1. Filter its `timeline` to keep only entries where `time != null` (the
     real activities; drop the `seq()` journey lines).
  2. If that leaves an empty `timeline`, drop the day entirely (the rare
     case where a fold-tier leg's boundary day was journey-only, e.g. a
     single-template leg — no real activity content to preserve).
  3. Set `overnight` to the destination name instead of the "Home"/`Overnight
     in {location}` value the folded day shipped with — the stitching layer
     knows the correct next/previous destination; the original day object
     doesn't.
  4. Clear `journey` to `null` — the separate transit day this build already
     inserts (§5 of the original brief) is the correct place for the
     travel-time estimate; the folded day's own "about X hours each way"
     line would now double up with it.

This only applies at **interior** leg boundaries — the very first leg's
leading edge and the very last leg's trailing edge are real journeys to/from
the user's actual home and must stay completely untouched. This matches the
existing `i > 0` / `i < legs.length - 1` conditions already in the stitching
loop — don't change that gating, only what happens inside it.

**Where this plugs in:** replace the current calls to
`dropLeadingTravel(d)` / `dropTrailingTravel(d)` in
`generateMultiDestItinerary()` with calls to the new combined logic above,
applied to the first/last day of each non-boundary-exempt leg. The rest of
the stitching function (transit day generation, sequential renumbering,
`legDestinationId` tagging) is unaffected and needs no changes.

---

## 4. Verification before reporting done

- `git diff --stat` shows changes limited to `src/lib/multiDestItinerary.js`
  — confirm `itinerary.js` and every other protected file show zero changes
- Rebuild the same Kerala→Goa→Jaipur→Delhi test trip from the last build.
  Confirm: Kerala's last day (fold-tier) keeps its real activity content but
  no longer says "Arrive home" / "Return to Vancouver" / "Overnight: Home" —
  it should read as a normal activity day ending in Kerala or with no
  onward-travel text, followed by the transit day to Goa. Same check at
  every interior boundary (Goa→Jaipur, Jaipur→Delhi).
- Confirm the very first day of the whole trip (Kerala, leg 1) and the very
  last day (Delhi, final leg) are unchanged — these are real journeys to/
  from the user's actual departure city and must keep their original
  "Depart {origin}" / "Return to {origin}" text.
- Confirm no leg's boundary day is left completely empty after filtering —
  if the empty-timeline edge case in §3.2 fires, confirm the day is dropped
  cleanly (no blank day card, correct sequential renumbering still holds).
- Re-run the single-destination regression (e.g. Kerala solo) — this path
  doesn't call `multiDestItinerary.js` at all, so it should be trivially
  unaffected, but confirm it explicitly per standing policy.
- Re-save and reload the multi-stop trip from `SavedTripDetail`, confirm the
  corrected day content persists in the snapshot, not just the live render.
