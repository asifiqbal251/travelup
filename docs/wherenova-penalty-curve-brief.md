Read AGENTS.md, especially the multi-agent coordination protocol at the top. Confirm you've read it.

You are the declared writer for this session. Baseline is [PASTE HASH FROM git rev-parse HEAD]. No other system is editing this repo. Note: git fetch will fail from your sandbox — trust this stated baseline, and stop and tell me if your local checkout doesn't match it rather than proceeding.

**STAGE 1 ONLY. Design and test candidate curves, report the numbers, and
STOP. Do not modify `practicality.js` or `scoring.js` in this stage.**

================================================================
CONTEXT — what your diagnosis established
================================================================

`penaltyFor(travelShare)` uses travel-share (round-trip hours ÷ trip hours)
with zero penalty below 0.20. Consequences you measured:

- Montréal (5.9h) and Bogotá (11.3h) both score exactly 100 — nearly double
  the flight time, identical score
- Belo Horizonte at 16.5h also gets zero penalty, missing the threshold by
  0.3 percentage points
- 63% of the catalogue gets zero penalty on a 7-day NYC trip
- The largest penalty actually reachable is ~17.6 points against a
  theoretical cap of 50 that needs ~85% travel share — unreachable
- **Because the band is a percentage, a 14-day trip has a zero-penalty band
  reaching 33.6h one-way — longer than the longest flight in the catalogue.
  Travel time currently affects nothing at all on two-week trips.**

Decision taken: replace this with a **hybrid** model.

================================================================
THE MODEL — design to these properties, not to a specific formula
================================================================

**Absolute travel hours as the primary driver, modified by trip length.**

Rationale: 15 hours of travel is burdensome whether the trip is 5 days or 15
— the current percentage-only model denies that. But 15 hours on a 4-day trip
genuinely is worse than on a 3-week trip, so trip length should still matter,
as a modifier rather than the basis.

## Required properties

1. **Travel is never entirely free above a small floor.** Below roughly 3–4
   hours one-way, zero penalty is reasonable. Above that, penalty grows
   continuously — no wide flat band.
2. **Longer trips soften the penalty but never eliminate it.** A 14-day trip
   should reduce the cost of a long flight, not zero it.
3. **The observed cases must resolve.** Montréal (5.9h) must score visibly
   above Bogotá (11.3h). Belo Horizonte (16.5h) must cost meaningfully more
   than Mexico City (8.4h).
4. **The maximum penalty must be reachable in practice.** The current 50-point
   cap is unreachable, which means the curve's top end is fiction. Whatever
   maximum you choose should be attainable by the longest routes in the
   catalogue.
5. **Determinism preserved.** Same inputs, same output, no randomness.

## The overcorrection risk — take this seriously

Do NOT design a curve so steep that long-haul destinations effectively
disappear. WhereNova's catalogue is global. Someone in Vancouver with 14 days
and a strong interest match **should** still see Tokyo ranked highly — a
13-hour flight for a two-week trip is entirely reasonable travel.

The bug is that travel time costs *nothing*. The fix is that it costs
*something proportionate* — not that long-haul becomes unrecommendable. If
your candidate curve pushes all long-haul destinations out of the top ranks
for reasonable trip lengths, it's overcorrected. Report if that happens.

## Confirm this before designing

The travel penalty affects **ranking**, and `isPractical()` /
`minUsableDays()` govern **eligibility**. Confirm these are genuinely
independent — that changing the penalty does not change which destinations
pass the gate. If they're coupled, say so and stop, because that changes the
blast radius entirely.

================================================================
WHAT TO PRODUCE
================================================================

Design **2–3 candidate curves** with different characters — e.g. one gentle,
one moderate, one firm. For each, report:

## A. The formula
Written out plainly, with the reasoning for each threshold or coefficient.

## B. A penalty table
Penalty produced at these one-way times: 2h, 4h, 6h, 8h, 11h, 14h, 17h, 20h,
25h, 30h — each at trip lengths of 3, 5, 7, 10 and 14 days. This is the
clearest way to see the curve's shape.

## C. The observed case
Before/after for the reproduced NYC 7-day profile: Montréal, Bogotá, Mexico
City, Belo Horizonte. Show that the ties break and by how much.

## D. Full-catalogue ranking impact
Run all 54 destinations across the same 8 profiles you used in the diagnosis
(NYC 7d, LA 10d, Paris 5d, Toronto 14d, Sydney 7d, London 9d, Miami 7d,
Tokyo 7d). For each candidate, report:
- Top 6 before vs after, per profile
- How many destinations change rank, and by how much
- How many destinations still tie at any score
- Top-10 score spread before vs after
- **Specifically: does any profile lose all its long-haul options from the
  top 10?** That's the overcorrection signal.

## E. The 14-day case
The current model's worst failure. Show explicitly that travel time now
affects a 14-day trip — Toronto 14d is in the profile set, use it.

## F. Your recommendation
Which candidate, and why. Note anything that concerned you.

================================================================
EXPLICITLY OUT OF SCOPE
================================================================

- **Do not change `scoreDestination`'s preference buckets** (season,
  interest, budget, length, climate, pace). Your diagnosis flagged these as
  contributing to ties, but that's a separate, larger decision.
- **Do not change the "No preference" climate behaviour.** You measured that
  it increases tie frequency — noted, and it will be revisited separately.
  Awarding full credit was a deliberate decision from the MVP audit.
- **Do not change `isPractical()` or `minUsableDays()`.** Eligibility stays
  as-is.
- Do not modify destination data.

================================================================
REQUIREMENTS
================================================================

- Use real catalogue data via the `.env.local` hosted backend connection, not
  mocks
- Arithmetic in a scratch script is fine — **do not modify `practicality.js`
  or `scoring.js` in this stage**
- No commit needed for Stage 1 unless you created files worth keeping; if so,
  say what and why
- Report and stop. I'll pick a candidate, then you implement in Stage 2.
