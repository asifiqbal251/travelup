# Parked items

Work that was scoped but deliberately not done. Check here before
re-investigating from scratch after a session reset.

## 4th pace tier

UI was collapsed from 4 options (Relaxed/Balanced/Full/Packed) back to 3
(Relaxed/Balanced/Fast-paced) in `src/lib/questionnaireFlow.js` (Q8) to match
what the engine and itinerary generator can actually distinguish.

To add a real 4th tier later, three things must happen together:

1. `src/lib/options.js` — extend `PACE_ORDER` (trivial).
2. `src/lib/itinerary.js` — rework the shift logic to read scale position,
   not the literal `"Fast-paced"` (~lines 495, 576, plus the
   `paceWantsRecovery` and `fastPace` branches). **Required**, or the new
   tier is invisible in generated itineraries — it would look real in the
   questionnaire and in scoring, but silently collapse into the existing
   `"Fast-paced"` shift bucket in the actual output.
3. ~20 `"Fast-paced"`-tagged destinations re-tagged editorially in the
   Base44 backend to decide which are `"Full"` vs `"Packed"` vs both
   (~5–9h of content work, per-destination judgment calls).

Separately: 15 of 54 destinations are tagged `["Balanced"]` only — pace data
is thin across the catalogue regardless of tier count. Worth a content pass
independent of whether a 4th tier ever ships.

## Desktop question pairing

Removed in `docs/wherenova-polish-pass-v3.md` Part E1 —
`src/lib/questionnaireFlow.js`'s `screenOrderFor`/`screenStartFor`/
`screenQuestions` now always return one question per screen, on every
viewport. It previously paired Q6+Q7 and Q8+Q9 above 1024px; three separate
pieces of user feedback traced back to it (7 screens on desktop vs. 9 on
mobile, an extra forced Continue click, cramped headlines).

This is deferred, not rejected — a paired/denser desktop layout may be
worth revisiting deliberately later (e.g. as its own considered redesign
rather than a special case bolted onto the one-question-per-screen flow),
not reintroduced incidentally while working on something else.

## Trip duration defaults to 7

`BLANK_ANSWERS.travelDays` defaults to 7, so Q2's day scroller reads as
"answered" the moment the screen mounts. Two consequences: a Continue
button appears on Q2 (unlike other single-select questions), and a user
who never touches the scroller silently gets a 7-day trip they never
chose. Pre-existing, not introduced by the v3 polish work. Decide later
whether duration should start genuinely unset — that's a product question
(is 7 a sensible default, or a silent assumption?) not just a UI one.

## Destination images needing replacement

3 of 54 destination images have baked-in frames/EXIF captions and need
replacing in Base44 (not a code fix): Victoria, Tofino (visible
"1/500 sec, f/11" caption), Tanzania & Zanzibar. Separately: all 54
source images are uniformly 1024×1024 (square) — every non-square card
crops equally (rails lose ~20% off the sides, the results hero loses
~37.5% off top/bottom). Already handled correctly by object-fit: cover,
no code fix needed — but worth matching card aspect ratios if images are
ever regenerated or resourced.

## Origin-agnostic connection overhead

Each destination carries flat connection_hours and internal_access_penalty
values applied regardless of the traveller's actual origin. Authored for a
distant origin, they badly overstate travel time for nearby ones — e.g.
Sydney -> South Island NZ computes 11.7h against a real ~3.5h direct flight
(3x). Didn't cause an eligibility failure in audit testing, but it understates
practicality and depresses the score via travelPenalty for close origins.
Fixing properly means making these fields origin-aware, which is a data-model
change, not a display fix. Revisit during the recommender/scoring round.

## Score clustering for under-specified profiles

A user who skips interests, leaves climate on "No preference" and month on
flexible gets a top-10 spread of 2 points (68-70) — the score stops carrying
information. Confirmed with real data (audit profile P8). Related to the
"No preference awards full credit" decision (see `docs/AGENTS.md`). Options:
nudge users to pick at least one interest, or revisit how unset dimensions
are scored. Revisit during the recommender round.

## Saved trips are snapshots, not live

Saved trips copy destination content at save time and never re-read the
Destination entity. Consequence: anyone who saved Victoria, Tofino or
Tanzania & Zanzibar before 2026-08-29 still sees the old defective images.
This is deliberate (SavedTripDetail.jsx documents it), but decide whether
saved trips should ever refresh stale content, or whether a one-off migration
is warranted for the three regenerated images.

## Generic recommendation reasons

buildReasons() is accurate but formulaic: two structurally different
destinations with identical score breakdowns produce byte-identical reason
text (confirmed — NYC profile gave New York City and Istanbul & Cappadocia
the same three strings). withDedupedPills() mitigates this within a single
results page but not across sessions. Needs destination-specific content,
not a code fix. Revisit with the "why this month" data work.
