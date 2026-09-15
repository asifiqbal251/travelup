Read AGENTS.md, especially the multi-agent coordination protocol at the top. Confirm you've read it.

You are the declared writer for this session. Baseline is [PASTE HASH FROM git rev-parse HEAD]. No other system is editing this repo. Note: git fetch will fail from your sandbox — trust this stated baseline, and stop and tell me if your local checkout doesn't match it rather than proceeding.

================================================================
THE FEATURE
================================================================

**Today:** completing the questionnaire overwrites the previous preferences.
The old answers are gone.

**After this:** the last three sets of preferences are kept. The user can
switch back to any of them from the profile page.

**Deliberately NOT building:** naming, saving, deleting, or managing sets.
This is automatic memory, not a filing system. The user does nothing to make
it happen — they simply stop losing their old answers.

If you find yourself adding a management UI, stop and report — that's the
larger "named preference sets" version, which was explicitly deferred.

================================================================
STEP 1 — READ AND REPORT BEFORE BUILDING
================================================================

Report:

1. **How preferences are stored today.** `getPrefs()` / `setPrefs()` in
   `storage.js` — the exact shape, where it's written, and everywhere it's
   read.
2. **What happens on questionnaire completion** — trace the exact point where
   the previous preferences are overwritten.
3. **What `hydrateAnswers()` does** and how switching back would re-enter the
   questionnaire flow.
4. **How the profile page renders the current preferences summary** — it
   reuses `isReturningPrefs` / `returningContext` from
   `discoveryCollections.js`. Confirm whether that logic can produce a summary
   line for an arbitrary preferences object, or whether it's hardcoded to the
   current one.
5. **Guest vs signed-in.** Preferences live in local storage today. Confirm
   whether this feature works identically for both, or whether signed-in users
   need anything extra.

**Report and pause briefly if anything contradicts the design below.**
Otherwise continue to Step 2.

================================================================
STEP 2 — BUILD
================================================================

## The storage change

Keep a short history of previous preference sets. Maximum **three** previous
entries, plus the current one.

- On questionnaire completion, the outgoing preferences move into history
  before the new ones are written
- Oldest entry drops off beyond three
- **Do not store duplicates.** If someone completes the questionnaire with
  identical answers, that shouldn't push a duplicate into history. Decide how
  to detect this — `tripFingerprint()` already exists and may be reusable.

## The profile page UI

A **"Recent Travel Fits"** section beneath the current preferences.

Each entry shows a one-line summary in the same style as the current
preferences line, e.g.:
> 7 days from Vancouver · Warm · Food, Cities

Tapping an entry makes it the current preferences. What was current moves into
history — so switching is non-destructive in both directions.

Requirements:
- Section does not render at all when there's no history — no empty state, no
  placeholder, consistent with every other hide-when-empty field in this app
- Entries are visually secondary to the current preferences
- Keep it light. No timestamps, no counts, no icons per entry, no delete
  control. A tappable summary line is the entire interaction.

## After switching

Switching should feel immediate and obvious. Decide and report what happens —
whether the user stays on the profile page with the summary updated, or is
taken to results for the newly-active preferences. Justify the choice.

Note the second option means recommendations recompute, which is the actual
point of switching.

================================================================
CONSTRAINTS
================================================================

- **Preferences shape must not change.** History stores the same object shape
  that `getPrefs()` returns today. Do not introduce a new preferences format.
- **Existing stored preferences must keep working.** A user with prefs and no
  history sees no history section, and everything else behaves exactly as
  today.
- **Saved trips are unaffected.** They snapshot preferences at save time and
  are immutable. Switching preference sets must not touch them.
- **The questionnaire flow is unchanged.** Same questions, same order, same
  resume/restart interstitial. `hydrateAnswers()` should work with a
  history entry exactly as it works with current preferences.
- Do not touch `scoring.js`, `practicality.js`, `itinerary.js`, or
  `questionnaireFlow.js`
- Do not modify destination data

## Recent changes that must not regress

- Climate multi-select (`prefs.climate` is now an array) and its legacy
  string hydration
- Numeric budget (`prefs.budget` is a number) and its legacy ordinal
  hydration
- **History entries may contain BOTH shapes** — an old entry could hold a
  legacy climate string or ordinal budget. Confirm the existing hydration
  handles history entries, not just the current preferences.
- Budget as question 9 of 9, continuous slider, pointer-release auto-advance
- Pace/activity stacked descriptions
- Profile page: account, preferences, saved trips count, clear my data
- "Clear my data" must also clear the history — verify and report

================================================================
REQUIREMENTS
================================================================

- Mobile-first: test 320/375/390/430px
- Design system: coral for CTAs only, teal for score/match indicators only
- Verify by actually rendering, not just tracing code
- Test the full round trip: complete the questionnaire, complete it again with
  different answers, confirm the first set appears in history, switch back,
  confirm results recompute correctly
- Test with a legacy-shaped history entry (string climate, ordinal budget) to
  confirm hydration holds
- State clearly which parts you verified by rendering versus traced
- Run lint AND a production build. Both must pass clean.
- Commit when done. DO NOT PUSH — I push from Terminal.
- Report the commit hash and hand off per the AGENTS.md protocol.

NOTE ON CLEANUP: three previous sessions have deleted tracked files while
clearing test artifacts (caught and restored each time via git). If you create
screenshots or temporary files, remove them individually by name rather than
with `rm -rf` on a directory.
