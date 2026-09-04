Read AGENTS.md, especially the multi-agent coordination protocol at the top. Confirm you've read it.

You are the declared writer for this session. Baseline is 37a3fea5af141cf648d5dffe03af103707bc8259. No other system is editing this repo. Note: git fetch will fail from your sandbox — trust this stated baseline, and stop and tell me if your local checkout doesn't match it rather than proceeding.

================================================================
WHAT THIS IS
================================================================

Building the display for visa and entry guidance — the last of the five
pre-beta features. All 54 destinations now have this data populated in live
fields. Nothing displays it yet.

================================================================
THE DATA
================================================================

- `entry_overview` — string, 1-2 sentences. Always ends by directing the
  reader to check their own government's travel advice. Populated 54/54.
- `passport_validity` — string, e.g. "Valid for at least 6 months beyond
  your departure date". Populated 54/54.
- `typical_tourist_stay` — string, e.g. "Up to 90 days within any 180-day
  period across the whole Schengen Area". Populated 54/54.
- `entry_requirements_notes` — array of strings, up to 3, short. Populated
  54/54.
- `official_source_name` — string, e.g. "UK Government — Check if you need a
  UK visa". Populated 52/54.
- `official_source_url` — string, official government page. Populated 52/54.
- `entry_last_reviewed` — date string, e.g. "2026-09-04". Populated 54/54.

Morocco and Uruguay intentionally have NO official source — no reliable
official English-language page exists for either, and linking something
unreliable would be worse than linking nothing. Their other fields are
complete. The panel must handle this gracefully: no broken link, no empty
row, no "source unavailable" apology.

There are `draft_` prefixed duplicates of all seven fields. IGNORE THESE
ENTIRELY — they are a rollback backup. Never read from or render a draft_
field.

================================================================
WHERE IT GOES
================================================================

The trip page (TripView.jsx), in the existing practical cluster alongside
Destination Essentials, Trip Budget and Transportation guidance.

Reasoning, consistent with the earlier decision: the modal is a *choosing*
surface; the trip page is a *preparing* surface. Visa requirements help you
prepare for a trip already chosen.

Do NOT add this to the destination modal. That modal has zero vertical slack
in its fixed desktop shell — 5 destinations already overflow it and are
being silently clipped (logged in docs/PARKED.md). Adding anything would
make that worse.

================================================================
TWO THINGS THIS PANEL MUST GET RIGHT
================================================================

## 1. The "verify" instruction must be genuinely prominent

This is the only data in WhereNova where a user acting on it without
checking could be denied boarding or turned away at a border. Every other
field is a convenience; this one has consequences.

The instruction to verify must read as an INSTRUCTION, not a disclaimer.
Not 11px grey text at the bottom of the card. It should be impossible to
read the panel and miss it.

At the same time: do not make it alarming or make the panel feel legally
defensive. The tone is "here's where to confirm this for your passport,"
not "we accept no liability."

Where an `official_source_url` exists, it should be an obvious, tappable
link — this is the single most useful element in the panel.

## 2. `entry_last_reviewed` must be visible

Visa rules change — Thailand's permitted stay changes on 15 September 2026,
and China's visa-free scheme expires at the end of 2026. Unlike currency or
plug types, this data has a shelf life.

Showing when it was last checked lets the user judge for themselves how much
to trust it. Present it plainly (e.g. "Checked September 2026"), not as a
buried timestamp.

================================================================
DISPLAY REQUIREMENTS
================================================================

- Same hide-when-empty rule as every other field in this app: empty means
  the row does not render. No "N/A", no placeholders, no empty rows. If the
  whole section's fields were empty, the section header would not render
  either.
- Morocco and Uruguay: source fields absent. The panel must look complete
  and intentional without them.
- `entry_requirements_notes` renders as a short bulleted list.
- Never present any of this as personalised to the reader. The content is
  written to be nationality-neutral; the presentation must not undercut that
  (e.g. don't add a heading like "Your visa requirements").
- Group sensibly rather than as a flat list of seven rows.

================================================================
DESIGN CONSTRAINTS
================================================================

- Follow the existing design system. Teal is restricted to score/match
  indicators only. Coral is for CTAs only.
- Light surfaces on the trip page (the wn-*-l token set) — this is a "doing"
  surface.
- Mobile-first: test 320px, 375px, 390px, 430px.
- The panel should feel like a sibling of Essentials / Budget /
  Transportation, not a bolted-on afterthought.

================================================================
MUST NOT REGRESS
================================================================

- The Essentials, Budget and Transportation panels on the trip page
- Guest one-trip limit for signed-out users, soft banner with persistent
  dismissal, hard prompt (GuestUpgradeModal)
- The OTP-gap resume path and trip migration on sign-up
- Account trip sync: reading from the SavedTrip entity when signed in,
  cross-device visibility, account-aware deletes
- Sign-out control and signed-in state indication
- All prior mobile fixes: modal escapable/scrollable, hero image
  aspect-ratio, questionnaire header, hero card long-title overlap, the
  AlertDialogFooter flex-direction fix
- Saved trips holding a content snapshot at save time

IMPORTANT: saved trips are snapshots. Verify these new fields survive the
save → reopen flow, the same way the Essentials/Budget/Transportation fields
were verified.

================================================================
REQUIREMENTS
================================================================

- Do not touch scoring.js, practicality.js, itinerary.js, or
  questionnaireFlow.js. Display only.
- Do not modify destination data.
- Do not read or render draft_ fields.
- Verify by actually rendering, not just tracing code. For anything
  involving layering or overlap, use elementFromPoint() rather than only
  getBoundingClientRect().
- Test explicitly with Morocco and Uruguay (missing source), a Schengen
  destination (long typical_tourist_stay text), and a destination with 3
  requirement notes.
- State clearly which parts you verified by rendering versus traced through
  code only.
- Run lint AND a production build. Both must pass clean.
- Commit when done. DO NOT PUSH — I push from Terminal.
- Report the commit hash and hand off per the AGENTS.md protocol.
