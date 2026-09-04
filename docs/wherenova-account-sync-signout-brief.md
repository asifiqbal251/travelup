Read AGENTS.md, especially the multi-agent coordination protocol at the top. Confirm you've read it.

You are the declared writer for this session. Baseline is 35fd605ef8d8aebad490a83816d4227f91575715. No other system is editing this repo. Note: git fetch will fail from your sandbox — trust this stated baseline, and stop and tell me if your local checkout doesn't match it rather than proceeding.

================================================================
CONTEXT — what your auth wiring got right
================================================================

Live testing confirms:
- Google sign-in works
- The email/OTP path works end to end, including the resume-after-reload case
- Your defensive verifyOtp guard is confirmed correct — this empirically
  resolves the SDK doc ambiguity that couldn't be settled from documentation
- Trip migration on sign-up works

Two gaps remain. One is severe.

================================================================
BUG 1 (SEVERE) — account trips are written but never read back
================================================================

Reproduction: signed up via Google on desktop Safari, saved trips
successfully. Then signed in with the SAME Google account on a mobile
browser. No trips appear.

You built `saveTripToAccount` to write to the new SavedTrip entity, but
nothing reads from it. SavedTrips.jsx and related surfaces appear to still
read only from local storage — so on a device with empty local storage, a
signed-in user sees nothing, even though their trips exist in the database.

This defeats the entire value proposition of creating an account. "Access
your trips from any device" is the literal promise made in
GuestUpgradeModal, and it currently does not work.

## Build the read path

- When signed in, saved trips must load from the SavedTrip entity, keyed on
  `created_by` (email) per the portability design you already implemented
- **Merge behaviour:** decide and implement sensible handling when a
  signed-in user ALSO has local trips on that device. Do not silently drop
  either set. Do not create duplicates. Explain the approach you chose and
  why.
- **Degrade gracefully:** if the account fetch fails, fall back to whatever
  is available locally rather than showing an empty state that implies the
  user's trips were lost. An empty saved-trips page after a network error is
  a genuinely alarming experience.
- **The one-trip guest limit must NOT apply to signed-in users.** They can
  save freely. Confirm GUEST_TRIP_LIMIT is only enforced for signed-out
  users.
- **Deleting a trip while signed in must delete it from the account**, not
  just locally — otherwise it reappears on the next device.

================================================================
BUG 2 — no sign-out, and no visible account state
================================================================

There is no way to sign out anywhere in the app, on desktop or mobile. The
nav "Sign in" link correctly hides when signed in, but nothing replaces it —
so a signed-in user has no account controls at all and cannot even tell they
are signed in.

## Build

- A sign-out control, reachable on both the desktop nav and the mobile menu
- Some indication of signed-in state (the account email, or similar) so the
  user knows which account they are in
- Sign-out must clear the session cleanly and return the user to a sensible
  state. Do NOT delete their local trips on sign-out. Any confirmation copy
  must be explicit about what does and does not happen to their data.

## Also review "Clear my data"

Now that real accounts exist, this control is ambiguous. It must be explicit
about whether it clears local data, account data, or both — and it must not
silently destroy account trips a user reasonably expects to persist. State
what you changed and why.

================================================================
MUST NOT REGRESS
================================================================

- The guest one-trip limit for SIGNED-OUT users
- The soft banner, including its persistent dismissal
- The hard prompt (GuestUpgradeModal), including the AlertDialogFooter
  flex-direction fix that keeps the primary CTA on-screen at phone widths
- The OTP-gap resume path
- Trip migration on sign-up
- Saved trips holding a content snapshot at save time, never re-reading live
  destination data
- All prior mobile fixes: modal escapable/scrollable, hero image
  aspect-ratio, questionnaire header, hero card long-title overlap
- The trip page Essentials / Budget / Transportation panels

================================================================
REQUIREMENTS
================================================================

- Do not touch scoring.js, practicality.js, itinerary.js, or
  questionnaireFlow.js
- Do not modify destination data
- Mobile-first: test 320px, 375px, 390px, 430px
- Design system: coral for CTAs, teal only for score/match indicators, dark
  surfaces for choosing / light for doing
- Verify by actually rendering, not just tracing code. For anything
  involving layering or overlap, use elementFromPoint() rather than only
  getBoundingClientRect().
- State clearly which parts you verified by rendering versus traced through
  code only. Be explicit about anything you could not exercise without a
  real backend session.
- Run lint AND a production build. Both must pass clean.
- Commit when done. DO NOT PUSH — I push from Terminal.
- Report the commit hash and hand off per the AGENTS.md protocol.
