Read AGENTS.md, especially the multi-agent coordination protocol at the top. Confirm you've read it.

You are the declared writer for this session. Baseline is 77a744f40c06668f489535ba69713b5234b7ef88. No other system is editing this repo. Note: git fetch will fail from your sandbox — trust this stated baseline, and stop and tell me if your local checkout doesn't match it rather than proceeding.

================================================================
THE BUG — reported by a real beta tester
================================================================

A tester in Dhaka ran a Travel Fit and got Thailand as the top match. The trip
page reported travel time as **9 hours each way**.

Dhaka → Bangkok is a **~2h40m direct flight**. The app overstated it by
roughly 3.4×.

The tester spotted it immediately. This is the kind of error that destroys
trust in everything else the app says.

## Known cause — this was already diagnosed and parked

From `docs/PARKED.md`, logged during the MVP audit:

> Each destination carries flat `connection_hours` and
> `internal_access_penalty` values applied regardless of the traveller's
> actual origin. Authored for a distant origin, they badly overstate travel
> time for nearby ones — e.g. Sydney → South Island NZ computes 11.7h
> against a real ~3.5h direct flight (3×).

Same mechanism, worse magnitude, now confirmed by a real user.

## Why this is Severity 1, not a display nicety

Travel time is not just shown to the user. It feeds `usableDestinationDays`,
which feeds the `isPractical()` eligibility gate, which determines **which
destinations are shown at all**.

So an inflated travel time may be:
- excluding perfectly reachable destinations from someone's results
- depressing scores via `travelPenalty` for destinations that are actually close
- misranking the results that do appear

This is a correctness bug in the recommendation engine, not a copy problem.

================================================================
STEP 1 — DIAGNOSE AND REPORT BEFORE CHANGING ANYTHING
================================================================

**Do not start fixing until you have reported and I have confirmed.** This
touches `practicality.js`, which has been a protected file for the entire
project. A careless change here could alter which destinations every user
sees.

Trace and report:

1. **The exact calculation.** Walk the full path from origin + destination to
   the final `oneWayHours` figure. Show each component and where each value
   comes from.

2. **Reproduce the Dhaka → Bangkok case numerically.** Show the actual
   component values: base flight time, `connection_hours`,
   `internal_access_penalty`, anything else. Demonstrate exactly how 2h40m
   becomes ~9h. Do not estimate — run it.

3. **Are `connection_hours` and `internal_access_penalty` per-destination
   constants, or do they vary by origin?** Confirm empirically rather than
   from the field names.

4. **How is base flight time derived?** Great-circle distance from
   coordinates, a lookup table, an authored field? Is the base figure itself
   accurate for Dhaka → Bangkok, or is the error partly there too?

5. **How widespread is this?** Run a spread of origin/destination pairs and
   report computed vs. realistic times. Include:
   - Short-haul regional: Dhaka → Bangkok, Singapore → Bali, Toronto → NYC
   - Medium-haul: London → Istanbul, Vancouver → Mexico City
   - Long-haul: Vancouver → Tokyo, London → Buenos Aires
   The question to answer: is the padding roughly correct for long-haul and
   wrong only for short-haul, or is it wrong everywhere?

6. **Does the regional-route override system already handle some of these
   correctly?** There's an override mechanism (`isOverride`) used for curated
   routes. Report which pairs hit it and whether those are accurate.

7. **What would change if this were fixed?** Estimate the blast radius: with
   corrected travel times, roughly how many destinations that are currently
   excluded by the practicality gate would become eligible, and vice versa.
   This is the number I most need before approving a fix.

**Stop and report. Do not write a fix yet.**

================================================================
STEP 2 — FIX (only after I confirm the approach)
================================================================

Once we agree on the approach, the fix must:

- Produce realistic travel times for short-haul routes without breaking
  long-haul ones
- Keep `practicality.js` deterministic — same inputs, same outputs, verified
  in the earlier audit and must not regress
- Preserve the display/raw split: `practicality.js` returns raw unrounded
  values because `usableDestinationDays` and the eligibility gate calculate
  from them; rounding is display-only via `roundedTravelHours()`
- Preserve the regional-route override behaviour and the
  `genericTravelMode()` origin-awareness fix from earlier work
- Not alter `min_days` behaviour — confirmed during the audit to be a soft
  scoring signal only, deliberately left as-is

================================================================
VERIFICATION REQUIRED FOR THE FIX
================================================================

- The Dhaka → Bangkok case must produce a realistic figure
- Re-run the full origin/destination spread from Step 1 and show
  before/after for each
- Confirm a 3-day trip from Vancouver still excludes implausible long-haul
  destinations — that safety behaviour was verified in the audit and must
  hold
- Confirm a 14-day trip still opens up long-haul destinations correctly
- Confirm determinism: identical inputs produce identical results
- Report any destination whose eligibility changes as a result, so I can
  sanity-check the new outcomes

================================================================
REQUIREMENTS
================================================================

- Do not touch `scoring.js`, `itinerary.js`, or `questionnaireFlow.js`
- Do not modify destination data — if the fix requires data changes, report
  that and stop; data goes through Base44, not here
- Run lint AND a production build. Both must pass clean.
- Commit only after Step 2 is agreed and complete. DO NOT PUSH.
- Report the commit hash and hand off per the AGENTS.md protocol.

REMINDER: Step 1 only. Report and stop.
