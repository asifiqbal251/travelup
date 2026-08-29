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
