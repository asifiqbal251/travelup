Read AGENTS.md, especially the multi-agent coordination protocol at the top. Confirm you've read it.

You are the declared writer for this session. Baseline is e8770f0afcd24d074f7c32381e9def06c0f48126. No other system is editing this repo. Note: git fetch will fail from your sandbox — trust this stated baseline, and stop and tell me if your local checkout doesn't match it rather than proceeding.

================================================================
THE PROBLEM — reported by a beta tester
================================================================

A tester couldn't tell the difference between the **Pace** question and the
**Activity** question in the questionnaire.

That matters more than it sounds. If the person answering can't distinguish
the two questions, their answers are unreliable — and every recommendation
scored on those answers inherits that unreliability.

================================================================
THE DECISION — reword, do not merge
================================================================

The two questions genuinely measure different things:

- **Pace** = how many things you do in a day. How full the schedule is.
- **Activity** = how physically demanding those things are.

These are independent. Someone can want a *relaxed pace with high activity*
(one long hike a day, nothing else) or a *fast pace with low activity* (five
galleries in a day, all sedentary). Merging them would lose real signal.

The problem is purely that the words "pace" and "activity" sound like
synonyms — both read as "how much am I doing?"

**The fix: name what each question actually asks, and give every option a
short concrete example so the difference is self-evident.**

================================================================
STEP 1 — READ AND REPORT BEFORE CHANGING ANYTHING
================================================================

Report:

1. The **exact current wording** of both questions — heading, any subtitle or
   helper text, and every option label.
2. **Where the display text lives.** Is it in `questionnaireFlow.js`, in a
   component, in `options.js`, somewhere else?
3. **CRITICAL: are the display labels the same strings as the stored
   values?** For example, does selecting "Relaxed" store the literal string
   `"Relaxed"`, which then gets compared against destination pace tags and
   `PACE_ORDER`?

**If labels and stored values are the same string, STOP AND REPORT before
changing anything.** In that case, changing a label would silently change
what's stored — breaking scoring against destination tags and every existing
saved trip. The fix would then require introducing a separation between value
and label (a display-label map keyed on the stored value), which is a
different and larger change than editing strings.

Do not edit any option label until you've confirmed which situation you're in.

================================================================
STEP 2 — THE REWORDING
================================================================

Below is my starting proposal. Refine the wording if you can do better, but
keep the *structure*: a heading that names the real question, plus a short
concrete example under each option.

## Pace question

- **Heading:** "How full do you want your days?"
- **Relaxed** — "A couple of things a day, plenty of downtime"
- **Balanced** — "A few planned things, room to wander"
- **Fast-paced** — "Full days, see as much as you can"

## Activity question

Read the current options first — I don't have them. Assuming something like
Light / Moderate / Active:

- **Heading:** "How physically active do you want to be?"
- **Light** — "Mostly walking, cafés and museums"
- **Moderate** — "Some hiking, cycling, longer days on foot"
- **Active** — "Hiking, watersports, physically demanding days"

Adapt to whatever the real options are.

## Requirements

- The eyebrow labels above each heading (currently "PACE" and similar) should
  also make the distinction clear if they're kept
- Option descriptions must be **short** — one line each. These render on
  phones, one question per screen.
- Leave the "No preference" option wording alone
- Do not change the number of options or their order
- Do not change the stored values

================================================================
HARD CONSTRAINTS
================================================================

**Stored values must not change.** Whatever gets written into the answers
object, the saved-trip snapshot, and compared against destination tags must be
byte-identical to today. Only what the user *reads* changes.

Verify this explicitly: complete the questionnaire before and after your
change and confirm the stored answers object is identical for the same
selections.

**Do not change scoring.** `scoring.js`, `practicality.js` and `itinerary.js`
are untouched. `PACE_ORDER` and any comparable ordering constant must stay
exactly as-is.

**Do not change question order or the flow.** If the display text lives in
`questionnaireFlow.js`, edit only the display strings there — not the
sequence, the mappings, or the answer keys.

================================================================
CONTEXT WORTH KNOWING (do not fix, just be aware)
================================================================

`docs/PARKED.md` records that **15 of 54 destinations are tagged only
`["Balanced"]` for pace.** So pace data is thin, and pace scoring is
correspondingly weak regardless of how clearly the question is worded. That's
a separate data problem, out of scope here — but don't be surprised if pace
appears to have little effect when you test.

================================================================
MUST NOT REGRESS
================================================================

- The questionnaire flow: one question per screen, auto-advance behaviour,
  resume/restart interstitial
- The "7 days — suggested" label on the duration scroller
- The questionnaire header fix (logo not overlapping progress bars)
- Q2 mobile overflow fix (`min-w-0` on the grid containers)
- Existing saved trips must still open correctly
- Determinism: the same selections must produce the same results as before

================================================================
REQUIREMENTS
================================================================

- Mobile-first: test 320/375/390/430px. Option descriptions must not cause
  overflow or awkward wrapping.
- Design system: coral for CTAs only, teal for score/match indicators only.
  Option descriptions should read as supporting text, not compete with the
  option labels.
- Verify by actually rendering, not just tracing code
- State clearly which parts you verified by rendering versus traced
- Run lint AND a production build. Both must pass clean.
- Commit when done. DO NOT PUSH — I push from Terminal.
- Report the commit hash and hand off per the AGENTS.md protocol.

REMINDER: Step 1 first. If display labels and stored values are the same
strings, stop and report before editing anything.
