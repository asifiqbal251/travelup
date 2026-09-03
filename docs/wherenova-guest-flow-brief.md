Read AGENTS.md, especially the multi-agent coordination protocol at the top. Confirm you've read it.

You are the declared writer for this session. Baseline is 18966569773fa2b22616e720970a9a2084277bd4. No other system is editing this repo. Note: git fetch will fail from your sandbox — trust this stated baseline, and stop and tell me if your local checkout doesn't match it rather than proceeding.

================================================================
WHAT THIS IS
================================================================

Building the guest-first flow for progressive registration. This is the
behaviour layer. Base44's actual auth (login page, Google button,
email/password forms, user records) does NOT exist yet — it will be
configured in a separate Base44 session AFTER this work.

So: build everything up to the point of sign-up, and leave a clean, clearly
marked integration point where auth will plug in. Do not stub out a fake
login form. Do not attempt to call base44.auth — it isn't configured yet.

================================================================
THE FLOW
================================================================

1. Anyone completes Travel Fit — NO registration
2. Views recommendations — NO registration
3. Creates their first itinerary — NO registration
4. Saves that trip — stored LOCALLY in their browser, still no registration
5. THEN a soft, dismissible offer appears: "Create an account to save this
   trip across devices"
6. A guest who dismisses it keeps their trip and keeps using the product
   with no further nagging

An account becomes REQUIRED when the user wants to:
- Save a second (or further) trip
- Access trips from another browser or device
- Have permanent cloud backup (protection against local storage clearing)
- (Future) receive personalised updates — not built now, but don't preclude it

The design principle: THE LIMIT IS THE PROMPT. The user hits a natural wall
at the exact moment they are already invested and the benefit is obvious,
rather than being interrupted arbitrarily earlier.

================================================================
WHAT TO BUILD
================================================================

## 1. Guest state and the one-trip limit

Saved trips already persist locally — this app has had guest saving for a
while. Read the existing implementation before changing anything and report
how it currently works.

Add: a guest may save exactly ONE trip. Attempting to save a second triggers
the hard prompt (below) rather than silently saving or silently failing.

Existing guest trips saved before this change MUST keep working. If a guest
somehow already has more than one saved trip locally, do not delete any of
them — grandfather them in and report this case if you find it's possible.

## 2. Soft prompt — after the first trip is saved

Appears after a successful first save. Framed as benefit, not requirement.
Something like: "Trip saved to this device. Create a free account to access
it anywhere and save more."

Requirements:
- Genuinely dismissible
- Dismissal persists — do not re-show it on every page load. Once dismissed,
  it should stay dismissed for that guest.
- It must NOT block the user from anything or cover content they need
- Not a modal that traps them. An inline banner or a lightweight card is
  more appropriate than a full-screen interruption at this stage.

## 3. Hard prompt — attempting to save a second trip

This one blocks the action, because the action genuinely requires an account.

Requirements:
- Explain plainly WHY: a free account is needed to save more than one trip
- List the benefits (multiple trips, any device, permanent backup)
- The sign-up entry point sits right here — the user should not have to go
  hunting for it
- CRITICAL: the trip they were trying to save must be PRESERVED through the
  sign-up journey. If they sign up, that trip saves. If they abandon sign-up
  and come back, the trip should still be recoverable — do not discard it
  the moment the prompt is dismissed.

## 4. Sign-in entry point for returning users

A quiet "Sign in" affordance in the nav, for someone returning on a new
device who already has an account. Low prominence — this is not the primary
path for a first-time visitor.

## 5. THE AUTH INTEGRATION POINT (important)

Where sign-up/sign-in would happen, create a single clearly-named component
or module that currently does nothing functional but is structured to accept
Base44's auth. Mark it unmistakably, e.g.:

  // AUTH INTEGRATION POINT — Base44 auth not yet configured.
  // Google OAuth (primary) + email/password (fallback) will be wired here.

Everything else in the flow should call into this one place, so wiring auth
later is a single well-defined change rather than edits scattered across the
codebase.

Note for context (do not implement yet): Google will be the PRIMARY sign-up
method and email/password the fallback. Google is preferred because Base44
requires mandatory email OTP verification for email/password accounts —
register() does not create a session and login fails until the user enters a
code from their email. Google sign-in skips that entirely. Design the flow so
the Google path is the prominent one and so the email/password path can
tolerate the user leaving the app to check their email and returning several
minutes later WITHOUT losing their trip.

## 6. Trip migration scaffolding

The logic that moves a guest's local trip into their account after sign-up.
Build the function and its fail-safe behaviour now; it just won't be
triggered until auth exists.

Requirements:
- Migration is automatic on successful sign-up — the user doesn't ask for it
- The trip's content snapshot is preserved EXACTLY. Do not regenerate it.
  Saved trips deliberately hold a snapshot rather than re-reading live
  destination data — that behaviour must not change.
- FAIL SAFE: if migration fails for any reason, the local copy must NOT be
  deleted. A user must never lose a trip because a migration errored.
- Confirm to the user that the trip moved

Also handle the case where a guest with a local trip signs IN to an existing
account (rather than signing up). Recommend merging the local trip in, with
the same fail-safe rule. Flag if you think a different behaviour is better.

================================================================
PORTABILITY REQUIREMENTS — build these in now
================================================================

Confirmed from Base44's docs: Base44 user IDs are internal identifiers that
would NOT survive a migration off the platform. Email is the portable key.

Therefore:
1. Any app data attached to a user must key off EMAIL or a stable
   WhereNova-generated identifier — never Base44's internal user ID alone
2. Give every saved trip a portable identifier independent of the user
   record
3. Keep the account layer thin — app logic should depend on no more than
   email and a stable identifier. Do not spread Base44-specific user fields
   through the codebase.

These are cheap now and expensive to retrofit once real users exist.

================================================================
WHAT MUST NOT HAPPEN
================================================================

- No registration wall before Travel Fit, the questionnaire, or results
- No account required to view recommendations or generate an itinerary
- No losing a guest's trip under ANY failure condition
- No aggressive re-prompting after a guest dismisses the soft offer
- No changes to scoring.js, practicality.js, itinerary.js, or
  questionnaireFlow.js — this is persistence and UI only
- No changes to destination data
- No calls to base44.auth — it is not configured yet

================================================================
EXISTING BEHAVIOUR THAT MUST NOT REGRESS
================================================================

- Saved trips hold a content snapshot at save time and never re-read live
  destination data. Deliberate. Preserve it.
- "Clear my data" must continue to work correctly, and should be explicit
  about what it clears in guest vs (future) signed-in state
- All prior mobile fixes: modal escapable and scrollable on mobile, hero
  image aspect-ratio, questionnaire header not overlapping, hero card text
  not overlapping on long destination names
- The trip page's new Essentials / Budget / Transportation panels

================================================================
REQUIREMENTS
================================================================

- Mobile-first. Test 320px, 375px, 390px, 430px. Prompts must not trap or
  obscure content on a phone.
- Follow the design system: teal restricted to score/match indicators only,
  coral for CTAs only. Dark surfaces for choosing, light for doing.
- Verify by actually rendering, not just tracing code. For anything
  involving layering or overlap, use elementFromPoint() rather than only
  getBoundingClientRect() — geometry checks have missed real paint-order
  bugs in this codebase before.
- State clearly which parts you verified by rendering versus traced through
  code only.
- Run lint AND a production build. Both must pass clean.
- Commit when done. DO NOT PUSH — I push from Terminal.
- Report the commit hash and hand off per the AGENTS.md protocol.

Before starting, report how guest trip storage currently works so I can
confirm your understanding is correct before you change it.
