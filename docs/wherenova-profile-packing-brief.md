Read AGENTS.md, especially the multi-agent coordination protocol at the top. Confirm you've read it.

You are the declared writer for this session. Baseline is 5e10102401710a085acd11f6d05f9a70a4431e66. No other system is editing this repo. Note: git fetch will fail from your sandbox — trust this stated baseline, and stop and tell me if your local checkout doesn't match it rather than proceeding.

Two features. They are independent — if one turns out larger than expected, report rather than rushing the other.

================================================================
FEATURE 1 — My profile (nav consolidation + profile page)
================================================================

## The problem

The nav currently carries six items when signed in: Home · Saved trips ·
About · asifiqbal251@gmail.com · Sign out · Clear my data.

That's crowded, and a raw email address is a poor signed-in indicator.

## What to build

**A "My profile" nav item** replacing the email address, opening a small
dropdown containing:
- The signed-in email (so someone with multiple accounts can tell which
  they're in — this information is useful, it just shouldn't dominate the nav)
- A link to the profile page
- Sign out

**Move "Clear my data" off the nav** and onto the profile page. It's a rare,
destructive action and doesn't belong in primary navigation. After this the
signed-in nav reads: Home · Saved trips · About · My profile.

**A profile page** at a sensible route. Content, all of which already exists
in the app — do not invent new data:

1. **Account** — signed-in email, sign out
2. **Travel preferences** — the user's current Travel Fit answers (origin,
   trip length, month, interests, etc. — whatever the stored answers object
   holds), presented readably, with a link to update them. The home page
   already surfaces a summary line like "Your Travel Fit: 6-day trip from
   London · Flexible timing · cities and history and culture" with an
   "Update preferences" action — reuse that data, don't duplicate the logic.
3. **Saved trips** — count, with a link to the saved trips page
4. **Your data** — "Clear my data", with the existing confirmation and copy.
   Keep the existing explicit distinction between local and account data.

## Signed-out state

A signed-out visitor has no account but may have guest preferences and one
local trip. Decide and implement sensible behaviour: either the profile page
is signed-in only (and the nav shows "Sign in" as it does now), or it works
for guests showing preferences and local trips with a sign-up prompt. State
which you chose and why. Do not leave a signed-out visitor at a broken or
empty page.

## Design

Follow the Saved trips page's surface treatment — that's the closest sibling
and keeps account-adjacent pages consistent. Design system rules apply: coral
for CTAs only, teal for score/match indicators only. Mobile menu must carry
the same consolidation as the desktop nav.

================================================================
FEATURE 2 — Delete items from the packing list
================================================================

## What to build

An unobtrusive remove control (a light × at the end of each row) letting a
user drop packing items they don't need for their destination.

## The seven data decisions — all approved, implement as stated

1. **Deletions persist.** Saved into the trip's stored state. A deletion that
   vanishes on reload is worse than no delete at all.

2. **Per-trip, not global.** Someone doesn't need a sun hat in Iceland but
   does in Jordan. Do not build a global "never show me this" preference.

3. **Deletions survive itinerary regeneration.** Store the deletion list
   separately from the generated list and apply it as a filter on top.
   Removed items must not silently reappear.

4. **Undo is required.** Deleting is one tap and accidental taps happen on
   phones. A brief undo affordance in a toast. Do NOT add a confirmation
   dialog on every delete — that would be more annoying than the occasional
   mistake.

5. **Deletions leave the denominator.** Removing an unpacked item moves
   18/28 to 18/27, with the percentage rising accordingly. Without this,
   someone can never reach 100% after removing an item they'll never pack.

6. **Removed items are recoverable.** A quiet "3 items removed — show" link
   at the bottom of the list, expanding to the removed items with an add-back
   control. Low prominence, but present — otherwise a mistaken deletion is
   permanent once the undo toast is gone.

7. **Works for guests and signed-in users alike.** The deletion list rides
   along with the trip. When a guest trip migrates into an account at
   sign-up, deletions must migrate with it.

## Explicitly out of scope

**Adding custom items.** It's the obvious next request and it's a separate
feature — needs input UI, validation, category assignment, and its own
regeneration decision. Do not build it here.

## Storage

The deletion list is additive to the saved trip structure. Existing saved
trips without it must keep working — an absent list means nothing deleted.
Same backwards-compatibility rule as every field added to date.

================================================================
MUST NOT REGRESS
================================================================

- Guest one-trip limit for signed-out users; soft banner with persistent
  dismissal; hard prompt (GuestUpgradeModal) including the
  AlertDialogFooter flex-direction fix that keeps the primary CTA on-screen
- OTP-gap resume path and trip migration on sign-up
- Account trip sync: reading from the SavedTrip entity when signed in,
  cross-device visibility, account-aware deletes
- Sign-out functioning correctly after being moved into the dropdown
- Trip page panels: Essentials, Budget, Transportation, Entry requirements
- Saved trips holding a content snapshot at save time
- All prior mobile fixes: modal escapable/scrollable, hero image
  aspect-ratio, questionnaire header, hero card long-title overlap

================================================================
REQUIREMENTS
================================================================

- Do not touch scoring.js, practicality.js, itinerary.js, or
  questionnaireFlow.js
- Do not modify destination data
- Do not read or render draft_ fields
- Mobile-first: test 320px, 375px, 390px, 430px. The dropdown and the ×
  control both need adequate tap targets (44px minimum) and must not overlap
  adjacent controls.
- Verify by actually rendering, not just tracing code. For anything
  involving layering or overlap — particularly the nav dropdown — use
  elementFromPoint() rather than only getBoundingClientRect().
- Test the packing deletion round trip: delete, verify percentage updates,
  reload, verify it persisted, restore via the removed-items list, verify
  the percentage updates again.
- State clearly which parts you verified by rendering versus traced through
  code only.
- Run lint AND a production build. Both must pass clean.
- Commit when done. DO NOT PUSH — I push from Terminal.
- Report the commit hash and hand off per the AGENTS.md protocol.
