Read AGENTS.md, especially the multi-agent coordination protocol at the top. Confirm you've read it.

You are the declared writer for this session. Baseline is [PASTE HASH FROM git rev-parse HEAD]. No other system is editing this repo. Note: git fetch will fail from your sandbox — trust this stated baseline, and stop and tell me if your local checkout doesn't match it rather than proceeding.

Four items, all from beta tester feedback. They are independent — if one runs
longer than expected, report rather than rushing the others.

================================================================
ITEM 1 — "Fits your budget" is misleading (do this first)
================================================================

## What a tester saw

A budget traveller from Dhaka got Thailand first (sensible), then **Brazil and
South Africa** — both justified with the reason **"Fits your selected budget
level."**

## Why it's wrong

Destination cost tiers deliberately **exclude airfare**. So "fits your budget"
is a claim about on-the-ground spending only — but it reads as a claim about
the whole trip. Dhaka → Brazil is among the most expensive flights available.
For a budget traveller, that reason is not merely imperfect, it's misleading.

## The fix

Reword the budget-related reason strings so they say what they actually mean:
on-the-ground daily costs, not total trip cost.

Something like "Daily costs on the ground fit your budget" — propose your own
wording if it reads better, but it must be unambiguous that airfare isn't
included.

**Scope carefully.** `buildReasons()` lives in `scoring.js`, which is a
protected file. **Change only the reason strings. Do not touch any scoring
maths, weights, thresholds, or ranking logic.** If the fix appears to require
changing anything beyond the text, stop and report instead.

Report every reason string you change, before and after.

================================================================
ITEM 2 — Verify whether citizenship is collected (report only, no fix)
================================================================

A tester noted that citizenship isn't requested in the questionnaire.

**This may be correct behaviour.** Visa guidance was deliberately scoped to be
nationality-neutral precisely so the app never makes citizenship-specific
claims. Not asking would be consistent with that.

**Investigate and report only — do not change anything:**

1. Is citizenship or country of residence collected anywhere in the
   questionnaire today? If so, where, and what is the value used for?
2. Does anything in the app read a citizenship value, or imply to the user
   that one was collected?
3. Is there dead code or an unused field left over from an earlier design?

Report findings and stop on this item. I'll decide what to do.

================================================================
ITEM 3 — Show more than three recommendations
================================================================

A tester asked what to do when they don't like the three options offered.

## The approach — read this before building

**Do NOT build a shuffle or randomise button.** WhereNova is deterministic by
design: identical inputs produce identical results. A button that returns
different destinations for the same inputs would undermine that, and
determinism was explicitly verified in the MVP audit.

Instead: show the **next best matches after the top three** — ranks 4 onward.
`rankDestinations()` already computes the full ranking, so this should be a
display change rather than an engine change. Confirm that's true before
building; if it isn't, stop and report.

## Requirements

- A clear affordance below the existing three results, e.g. "More options"
- Reveals the next 3 (ranks 4–6). Whether further reveals are possible beyond
  that is your call — report what you chose.
- These are visually secondary to the top three. The top three are the
  recommendation; these are alternatives.
- **Edge case that must be handled:** the practicality gate excludes
  destinations entirely, so fewer than 6 may qualify. If only 4 exist, reveal
  1. If exactly 3 qualify, the affordance must not appear at all — do not show
  a control that reveals nothing.
- This must work alongside the existing fewer-than-three handling, including
  the actionable suggestion chips. Do not regress that.

================================================================
ITEM 4 — Home page destination cards aren't clickable
================================================================

## What a tester saw

Cards under "Great this month" on the home page look interactive but don't
open anything. A user who hasn't completed Travel Fit hits a dead end — they
see "Find my Travel Fit" and no way to learn about the destination that
caught their eye.

## The approach — decided, build this

Clicking a card opens the **destination modal** showing everything that does
**not** depend on the user:
- Photo, description, top experiences, best months, region, tags

And withholding everything that genuinely **cannot be computed** without an
origin and trip length:
- Travel Fit score, travel time, practicality, "on the ground" days

**This works because the withheld information truly requires their input** —
it reads as reasonable rather than as an arbitrary gate. The CTA in that state
should reflect that, e.g. "See how well this fits you" leading into Travel
Fit.

## Requirements

- Works for signed-out guests and signed-in users who have no Travel Fit
- If the user **does** have a Travel Fit, the modal should show the full
  personalised version as it does today — do not regress that path
- The modal already exists; reuse it rather than building a second one
- **Critical constraint:** the destination modal has a hard-won desktop
  guarantee — fixed 1100×680, 60/40 image/content split, no internal
  scrolling. Five destinations already overflow it and are silently clipped
  (logged in `docs/PARKED.md`). Since this state shows *less* content than the
  personalised one, it should fit comfortably — but verify, and do not loosen
  the desktop constraints.
- Mobile: the modal must remain escapable and scrollable, per the earlier fix

================================================================
MUST NOT REGRESS
================================================================

- The "Xh total travel each way" label and its Travel Fit panel caption
- Fewer-than-three results handling and the actionable suggestion chips
- Determinism: identical inputs, identical results
- Packing deletion (delete, undo, restore, denominator)
- Guest one-trip limit, soft banner, hard prompt incl. the AlertDialogFooter
  flex fix
- Account trip sync, sign-out, profile page and dropdown
- Trip page panels: Essentials, Budget, Transportation, Entry requirements
- All prior mobile fixes: modal escapable/scrollable, hero image
  aspect-ratio, questionnaire header, hero card long-title overlap, opaque
  mobile menu

================================================================
REQUIREMENTS
================================================================

- `scoring.js`: **strings only, in `buildReasons()`.** No maths, weights,
  thresholds or ranking changes.
- Do not touch `practicality.js`, `itinerary.js`, or `questionnaireFlow.js`
- Do not modify destination data
- Mobile-first: test 320/375/390/430px
- Design system: coral for CTAs only, teal for score/match indicators only
- Verify by actually rendering, not just tracing. For layering or overlap, use
  `elementFromPoint()` — geometry checks have missed real paint-order bugs in
  this codebase before.
- State clearly which parts you verified by rendering versus traced through
  code only
- Run lint AND a production build. Both must pass clean.
- Commit when done. DO NOT PUSH — I push from Terminal.
- Report the commit hash and hand off per the AGENTS.md protocol.
