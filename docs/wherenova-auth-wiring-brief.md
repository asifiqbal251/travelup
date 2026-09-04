Read AGENTS.md, especially the multi-agent coordination protocol at the top. Confirm you've read it.

You are the declared writer for this session. Baseline is 1fd2643ae292550b2c5b49a9f15eefa116293bb3. No other system is editing this repo. Note: git fetch will fail from your sandbox — trust this stated baseline, and stop and tell me if your local checkout doesn't match it rather than proceeding.

================================================================
WHAT THIS IS
================================================================

Wiring real Base44 authentication into the guest flow you built last session
(commit 1fd2643). Everything exists but nothing is connected:

- `src/lib/auth.js` — the integration point you created. All functions are
  currently no-ops that show a "Sign-up isn't available yet" toast.
- `src/pages/Login.jsx`, `src/pages/Register.jsx`, `src/contexts/AuthContext.jsx`
  (or wherever they live) — pre-existing boilerplate. Base44 confirmed both
  pages already have a "Continue with Google" button as the first control,
  above an "or" divider and an email/password form, with return-to handling.
  BUT: no routes are registered, so nothing in the app can reach them.
- `src/lib/tripMigration.js` — migration logic, built but never triggered.

Base44 dashboard state (confirmed): Google authentication enabled using the
default Base44 OAuth. Email and password authentication enabled. Microsoft,
Facebook, Apple, and SSO are all OFF.

================================================================
STEP 1 — INSPECT BEFORE CHANGING (report first, don't fix yet)
================================================================

Read the existing Login.jsx, Register.jsx, AuthContext.jsx and any related
auth boilerplate. Report:

1. Do they call the correct current Base44 SDK methods? Specifically:
   `base44.auth.loginWithProvider` for Google, `register({email, password})`
   + `verifyOtp({email, otpCode})` + `loginViaEmailPassword` for the email
   path. Flag anything that looks like an outdated or wrong API pattern.
2. Do they use the app's design system — `wn-*` tokens, correct dark/light
   surface treatment, coral for CTAs, teal restricted to score indicators?
   Or do they look like generic unstyled scaffolding?
3. Is AuthContext actually wired to anything, or is it inert?
4. Your recommendation: keep and fix these files, or delete and rebuild them
   to match the app's design? Say which and why.

STOP AND REPORT after this inspection. Do not start rewriting until I
confirm the approach.

================================================================
STEP 2 — WIRE IT UP (after I confirm Step 1)
================================================================

## 2a. Register routes
Make Login and Register reachable. Follow the app's existing routing pattern.

## 2b. Replace the stubs in auth.js
Swap the no-op functions for real Base44 auth calls. Everything in the guest
flow already calls into this module — keep that contract intact so nothing
else needs rewiring.

## 2c. Wire the hard prompt's CTAs
`GuestUpgradeModal.jsx` has "Continue with Google" and "Use email instead"
buttons that currently fire the placeholder toast. Point them at the real
flows.

## 2d. Activate trip migration
`tripMigration.js` exists with fail-safe logic (local copy deleted only
after the account write confirms). Trigger it on successful sign-up and on
sign-in-with-existing-account. Do not weaken the fail-safe.

================================================================
THE CRITICAL PATH — OTP GAP HANDLING
================================================================

This is the part most likely to have edge cases, and it's why
`pendingTripSnapshot` was built the way it was.

Base44 requires MANDATORY email verification for email/password accounts and
it is not configurable. `register()` does NOT create a session.
`loginViaEmailPassword` FAILS until verified. Only `verifyOtp` yields the
first token.

So the email path looks like: user hits the second-trip wall → chooses email
→ enters email + password → **LEAVES YOUR APP** to find a code in their inbox
→ returns, possibly minutes later, possibly in a new tab → enters the code →
only now do they have a session → only now can the trip save.

Requirements:
- The pending trip MUST survive that entire gap, including a full page
  reload, a closed and reopened tab, and several minutes elapsed.
- The user must be able to get back to the verification step without
  starting over. If they return to the app mid-verification, guide them to
  where they left off rather than dumping them at the start.
- If they abandon verification entirely, the trip stays recoverable as a
  pending trip — do not discard it.
- The Google path skips all of this (Google has already verified the email,
  session is immediate). Keep Google visually primary everywhere for exactly
  this reason.

Test this path explicitly, including the reload-mid-verification case.

================================================================
PORTABILITY REQUIREMENTS
================================================================

Confirmed from Base44's docs: Base44 user IDs are internal identifiers that
would NOT survive a migration off the platform. Email is the portable key.

- Any app data attached to a user must key off EMAIL or a stable
  WhereNova-generated identifier, never Base44's internal user ID alone
- Saved trips keep their portable identifier independent of the user record
- Keep the account layer thin — app logic depends on no more than email and
  a stable identifier. Do not spread Base44-specific user fields through the
  codebase.

================================================================
WHAT MUST NOT HAPPEN
================================================================

- No registration wall before Travel Fit, the questionnaire, or results
- No account required to view recommendations or generate an itinerary
- No losing a guest's trip under ANY failure condition, including a failed
  or abandoned verification
- No aggressive re-prompting after a guest dismisses the soft offer
- No changes to scoring.js, practicality.js, itinerary.js, or
  questionnaireFlow.js
- No changes to destination data
- Do not enable or reference Microsoft, Facebook, or Apple sign-in — they
  are deliberately off

================================================================
EXISTING BEHAVIOUR THAT MUST NOT REGRESS
================================================================

- The guest one-trip limit, soft banner (with persistent dismissal), and
  hard prompt — all confirmed working live, don't break them
- Saved trips hold a content snapshot at save time and never re-read live
  destination data
- "Clear my data" — must now correctly handle BOTH guest and signed-in
  state, and be explicit about what it clears in each
- All prior mobile fixes: modal escapable/scrollable, hero image
  aspect-ratio, questionnaire header, hero card long-title overlap
- The trip page Essentials / Budget / Transportation panels
- The AlertDialogFooter flex-direction fix that keeps the primary CTA
  on-screen at phone widths — do not let a new dialog reintroduce that bug

================================================================
REQUIREMENTS
================================================================

- Mobile-first. Test 320px, 375px, 390px, 430px. Auth forms and dialogs must
  not trap or obscure content on a phone.
- Follow the design system: coral for CTAs, teal only for score indicators,
  dark surfaces for choosing / light for doing.
- Verify by actually rendering, not just tracing code. For anything
  involving layering or overlap, use elementFromPoint() rather than only
  getBoundingClientRect().
- State clearly which parts you verified by rendering versus traced through
  code only.
- Run lint AND a production build. Both must pass clean.
- Commit when done. DO NOT PUSH — I push from Terminal.
- Report the commit hash and hand off per the AGENTS.md protocol.

REMINDER: Stop after Step 1 and report your inspection findings before
writing any code.
