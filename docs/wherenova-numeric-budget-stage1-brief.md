Read AGENTS.md, especially the multi-agent coordination protocol at the top. Confirm you've read it.

You are the declared writer for this session. Baseline is de2c07c7c4ac15f041d2009f6421aaea5d60ac84. No other system is editing this repo. Note: git fetch will fail from your sandbox — trust this stated baseline, and stop and tell me if your local checkout doesn't match it rather than proceeding.

**STAGE 1 ONLY — diagnose, design, simulate, report, STOP.**
Do not modify `scoring.js`, `questionnaireFlow.js`, `options.js`, or any other
source file in this stage.

================================================================
THE GOAL
================================================================

Replace the vague budget tiers in the questionnaire with a **real dollar
figure**.

Two beta testers independently asked for this — "what does each budget
category actually mean in numbers?" It's the most-requested open item.

## Why it's now possible

Track B populated `daily_cost_low` / `daily_cost_mid` / `daily_cost_high` for
all 54 destinations, in USD, sourced from Numbeo and cross-checked against
Budget Your Trip. Before that there was nothing concrete to match a dollar
figure against.

## Why this needs a diagnosis first

It changes **`scoring.js`**, a protected file. Budget is currently an ordinal
tier fed into scoring via `BUDGET_ORDER`. Moving to a numeric value changes
how budget fit is computed for every user, not just how the question is asked.

================================================================
STEP 1 — REPORT THE CURRENT STATE
================================================================

1. **The budget question as it exists today.** Exact eyebrow, heading, hint,
   and every option's `key` / `label` / `value`. How many tiers are there?
   (Note: a previous session observed "Premium" clipping to "Pr" at 320px,
   suggesting four rather than three — confirm.)

2. **`BUDGET_ORDER`** — exact contents and order.

3. **The current scoring arithmetic.** How `prefs.budget` is compared against
   destinations, the exact point values awarded, and the maximum contribution
   to the total score.

4. **The destination budget data — this is the key question.** Destinations
   appear to carry *both* an ordinal budget tag (used by scoring today) *and*
   `daily_cost_low/mid/high` (from Track B, unused by scoring).

   **Do they agree?** For all 54 destinations, report the ordinal tag
   alongside the three cost figures. Flag every destination where they
   conflict — e.g. tagged "Budget" but with a `daily_cost_mid` of $150.

   If the two datasets disagree substantially, that changes the whole plan and
   I need to know before designing anything.

5. **Cost distribution across the catalogue.** Min, max, median and quartiles
   for `daily_cost_low`, `daily_cost_mid` and `daily_cost_high`. This
   determines what range the input control should span.

6. **How much does budget currently discriminate?** The earlier scoring
   diagnosis found budget at full marks in **78.8%** of top-10 results.
   Confirm against the current catalogue and report — if budget is already
   near-inert, that's relevant to how much rank churn to expect.

7. **Migration surface.** What exactly is stored today — in the answers
   object, in `buildPrefs()` output, in the saved-trip snapshot? Existing
   saved trips hold the old ordinal value and must keep working. Report what
   would break.

8. **Where the display text lives** — same question as the pace/activity work.
   Confirm whether the `key`/`label`/`value` separation exists here too.

================================================================
STEP 2 — DESIGN THE INPUT
================================================================

## The framing — this is the part that must be right

Destination cost tiers **exclude airfare**, deliberately. A user thinking
"$3,000 for this trip" is including flights. Matching those directly would
make long-haul destinations look dramatically cheaper than they are.

**This already caused a real bad recommendation:** a budget traveller from
Dhaka was shown Brazil and South Africa, justified as "fits your budget."

**The fix: ask for daily on-the-ground spend, explicitly excluding flights.**

Something like: *"Not counting flights, roughly what would you spend per day?"*

Show a **live total readout** beneath — *"About $875 for your 7 days"* — so
people can sanity-check against the total they're actually thinking in, while
the stored figure stays the daily one that matches the data.

## Requirements

- Propose the input control: stepped slider, preset ranges, free numeric
  entry, or something else. Justify the choice. It must work well on a phone
  at 320px.
- Propose the range and step size, anchored to the catalogue distribution from
  Step 1 point 5.
- Keep a **"No preference"** option, consistent with every other question.
- Propose the exact question wording. It must be unmistakable that flights are
  excluded — this is the single most important piece of copy in the change.

================================================================
STEP 3 — DESIGN THE SCORING
================================================================

## The current model is wrong in a specific way

Ordinal distance penalises mismatch in **both** directions — someone who
selected "Comfortable" is scored *down* for a destination tagged "Budget."

That's incorrect. A traveller with $300/day going to Vietnam ($30/$70/$180)
will have an excellent time. **Having more money than a destination requires
is not a bad fit.**

## Proposed: asymmetric scoring

- Budget at or above the destination's **mid** tier → full marks
- Between **low** and **mid** → good, slight reduction
- Below **low** → meaningful penalty; the destination genuinely isn't
  affordable at that level
- Far above **high** → **no penalty.** Overshooting is not a mismatch.

Refine the curve if you can do better, but preserve that asymmetry.

## Handle these cases explicitly

- A destination missing cost data (report whether any exist)
- "No preference" selected — consistent with the audit decision to award full
  credit
- Existing saved trips holding the old ordinal value

================================================================
STEP 4 — SIMULATE THE BLAST RADIUS
================================================================

Do **not** modify source files. Arithmetic in a scratch script only.

Using the same wide profile set from the penalty-curve work (14 profiles),
report for the proposed model:

- Top 6 before vs after, per profile
- How many destinations change rank, and by how much
- Top-10 score spread before vs after
- Tie counts before vs after
- **Specifically: does any profile lose all its affordable options, or all its
  expensive ones?** Both would be overcorrection.
- Any ranking change that looks *wrong* on inspection, not merely different

## Important context

The travel-penalty curve changed **two sessions ago** and already reshuffled
rankings. Your simulation must run against the **current** code, not the
pre-penalty baseline, so the reported churn is what users would actually
experience on top of what they've already seen.

================================================================
STEP 5 — RECOMMEND
================================================================

Your recommendation, and anything that concerned you. If the ordinal tags and
cost data conflict badly (Step 1 point 4), say so plainly — that would mean
fixing the data before changing the scoring.

================================================================
REQUIREMENTS
================================================================

- Use real catalogue data via the `.env.local` hosted backend, not mocks
- **Do not modify any source file.** Scratch scripts only, removed before
  finishing.
- No commit needed unless you created something worth keeping — say what and
  why
- Report and stop. I'll pick an approach, then you implement in Stage 2.
