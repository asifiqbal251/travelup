Read AGENTS.md, especially the multi-agent coordination protocol at the top. Confirm you've read it.

You are the declared writer for this session. Baseline is [PASTE HASH FROM git rev-parse HEAD]. No other system is editing this repo. Note: git fetch will fail from your sandbox — trust this stated baseline, and stop and tell me if your local checkout doesn't match it rather than proceeding.

Two items. Item 1 is a small copy fix — do it and commit. Item 2 is a
DIAGNOSIS ONLY — report and stop, do not fix.

================================================================
ITEM 1 — Results subheading wraps to two lines (fix this)
================================================================

On the results page, the subheading "Scored on how well each place fits you,
and how practical it is for 7 days." wraps to two lines at desktop width. It
should fit on one.

It's a width constraint on that paragraph, not a length problem — the text
itself is fine. Widen the container or adjust the max-width so it sits on one
line at desktop, while still wrapping sensibly on mobile.

Verify at desktop plus 320/375/390/430px. Do not change the wording.

================================================================
ITEM 2 — Score saturation (DIAGNOSE ONLY — report and stop)
================================================================

## What was observed

A real results page showed:

| Rank | Destination | Score | Travel time |
|---|---|---|---|
| 1 | Montréal and Québec City | **100** | 7h |
| 2 | Bogotá | **100** | 15h |
| 3 | Belo Horizonte and Ouro Preto | 94 | 22h |
| 4 | San Diego | 93 | 6h |
| 5 | Mexico City | 87 | 9h |
| 6 | Lisbon & Porto | 86 | 18h |

Two problems visible here:

**1. Two destinations tied at exactly 100.** The score has stopped
discriminating at the ceiling — precisely where it matters most. A "100
Travel Fit" that two different places both earn tells the user nothing about
which is the better match.

**2. Travel practicality appears to barely affect the score.** Bogotá at 15h
scores the same as Montréal at 7h. Belo Horizonte at 22h scores 94. If travel
practicality is a meaningful component, a 22h journey should cost more than a
7h one.

This is the "score clustering" item logged in `docs/PARKED.md` from the MVP
audit — but that finding was on an under-specified test profile. **This is a
normal, fully-specified profile**, which makes it materially more serious.

## What to investigate and report

**Do not change any scoring logic. `scoring.js` is a protected file and this
determines what every user sees. Report first.**

1. **Trace the full score calculation.** Every component, its weight, its
   maximum contribution, and how they combine into `finalScore`. Show the
   arithmetic, not a description.

2. **Is the score capped or clamped at 100?** If so, how often is the cap
   actually hit? Run the real catalogue against several profiles and report
   how many destinations reach 100 in each. If saturation is common, that's
   the headline finding.

3. **Reproduce the observed case numerically.** Work out what profile produces
   the table above (a 7-day trip; the origin appears North American). Show the
   component-by-component breakdown for Montréal, Bogotá and Belo Horizonte so
   we can see exactly where they converge and where they differ.

4. **How much does travel practicality actually move the score?** Isolate the
   `travelPenalty` (or equivalent) contribution. What's the maximum penalty a
   destination can receive, and what fraction of the total score is it? Is a
   22h journey penalised meaningfully more than a 7h one, or is the penalty
   too small to matter?

5. **Measure the real spread.** Run 6–8 varied, fully-specified profiles
   across the catalogue. For each, report min, max, median, and the spread
   across the top 10. The MVP audit found 13–20 point spreads for normal
   profiles and 2 points for an under-specified one — check whether that still
   holds, and whether the top of the range is compressed even when the overall
   spread looks healthy.

6. **How many components are at full marks for typical profiles?** If most
   dimensions award full credit most of the time, the score is mostly measuring
   nothing. Note that the "No preference" decision from the audit awards **full
   credit** rather than skipping a dimension — quantify how much that
   contributes to saturation.

7. **Your recommendation.** Based on what you find, what would fix it, and what
   would that change for existing users? Estimate the blast radius: with the
   change you'd propose, how much would rankings move for the profiles you
   tested? I want to know whether this is a re-weighting, a scaling change, or
   something structural before approving anything.

**Report and stop. Do not write a scoring fix.**

================================================================
REQUIREMENTS
================================================================

- Item 1: fix, verify by rendering, commit
- Item 2: diagnose only. Do not modify `scoring.js`, `practicality.js`,
  `itinerary.js`, or `questionnaireFlow.js`
- Do not modify destination data
- You have a working `.env.local` pointing at the hosted backend from the last
  session — use real catalogue data, not mocks, for the diagnosis
- Run lint AND a production build after Item 1. Both must pass clean.
- Commit Item 1 only. DO NOT PUSH.
- Report the commit hash and the full Item 2 diagnosis.
