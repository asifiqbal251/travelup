Read AGENTS.md, especially the multi-agent coordination protocol at the top. Confirm you've read it.

You are the declared writer for this session. Baseline is 6206263f8e787b96288c86e6d13a348966cc6aa1. No other system is editing this repo. Note: git fetch will fail from your sandbox — trust this stated baseline, and stop and tell me if your local checkout doesn't match it rather than proceeding.

CONTEXT — results of live testing the published app (nova.base44.app) on an iPhone:
- Your previous Q2 mobile overflow fix (min-w-0 on the grid containers) WORKS. Confirmed live. The diagnosis of the CSS Grid blowout was correct.
- Your previous Bug 2 fix (loading="eager") did NOT resolve the missing hero image. Revised diagnosis below.
- Two further mobile bugs found, one of them severe.

Three bugs to fix, in this priority order. All are mobile-only; desktop behaviour must not change.

================================================================
BUG A (SEVERE — fix first) — DestinationPreviewDialog traps the user on mobile
================================================================

On iPhone portrait, tapping a recommended destination opens the modal and THE USER CANNOT GET OUT. The close (X) button is not reachable, the content does not scroll, and the only escape is the browser back button. In landscape the X becomes reachable but scrolling still does not work.

This is a dead end in the primary user flow. A beta tester who taps a destination on their phone is stuck.

Additional visual defects on the same modal in portrait:
- The image is squashed into a very short strip at the top
- The country/region line ("United States · Mojave Desert, Nevada, United States") is overlaid ON TOP of the image
- That same region line then appears AGAIN below the destination name (duplicated)

Likely root cause: this modal was deliberately locked to fixed 1100x680 desktop dimensions with a 60/40 image/content split, and its content was deliberately capped so it never scrolls internally at desktop. On a phone viewport that fixed sizing places the close button outside the visible area, and the no-internal-scroll treatment means the user cannot scroll to reach anything.

Fix so the modal is fully usable on mobile:
- Close button always reachable within the viewport
- Content scrollable when it exceeds the viewport height
- Image at a sensible aspect ratio, not a squashed strip
- No text overlapping the image
- No duplicated region line

CRITICAL CONSTRAINT: desktop must keep its exact current behaviour — fixed 1100x680, 60/40 split, no internal scrolling, no reflow when switching between destinations. That desktop guarantee was verified by measurement across 8 destinations (including the worst case, Costa Rica, at scrollHeight 597 / clientHeight 597) and must not regress. Implement the mobile treatment as a separate responsive branch rather than loosening the desktop constraints.

================================================================
BUG B — HeroMatchCard image renders at zero height on mobile
================================================================

The #1 "Best Fit" result card shows no hero image at all on mobile — the card goes straight from the score ring into the destination name, with a blank gap where the image should be. No image, no fallback, no placeholder. Reproduced with multiple destinations (Rio de Janeiro, Mendoza, Las Vegas), so it is systemic, not data-specific.

Your loading="eager" change did not fix it. But live testing produced a decisive clue you did not have:

**Destination images DISPLAY CORRECTLY in DestinationPreviewDialog on the same phone, same session, same image URLs.**

Therefore this is NOT a broken URL, NOT a CORS problem, NOT a network issue, and NOT lazy-loading. Images load fine elsewhere in the app on that device.

Revised hypothesis to verify: on desktop, the hero card lays the image out side-by-side at roughly 57% width, and the image container derives its height from that flex/grid row. On a mobile viewport the layout stacks vertically, and if the image container has no explicit height, min-height, or aspect-ratio at mobile breakpoints, it collapses to 0px. The image loads successfully, renders invisibly at zero height, no error event fires — so the TRAVEL_FALLBACK_IMAGE chain never triggers either. That matches the observed symptom exactly: blank gap, no placeholder, no console error.

Investigate HeroMatchCard in Results.jsx and the ResponsiveImage component, focusing specifically on how the image container derives its height at mobile breakpoints versus desktop. Fix so the hero image has a defined height or aspect-ratio on mobile and looks intentional on a phone — not letterboxed, not stretched, not cropped awkwardly.

Keep the loading="eager" change. It is correct practice for an above-the-fold hero image even though it was not the cause here.

Also check supporting cards 2 and 3 in the results grid for the same zero-height issue.

================================================================
BUG C — Questionnaire header: logo overlaps progress bars, and uses the wrong logo
================================================================

Two related problems in the questionnaire header on mobile:

1. The "WhereNova" wordmark in the top-left renders directly ON TOP of the progress-step bars — they visually collide and overlap.

2. The questionnaire header shows a plain text wordmark, while the Results page header correctly shows the full logo (the mark plus the wordmark). The questionnaire appears to be using a different or incorrect logo treatment.

Fix so:
- The header logo and progress bars never overlap at any mobile width (test the range ~320px to ~430px)
- The questionnaire uses the same correct logo asset as the rest of the app

This is the first screen every user sees, so it matters more than its size suggests.

================================================================
REQUIREMENTS FOR ALL THREE
================================================================

- Do not change desktop behaviour for any of these fixes.
- Do not touch the engine files (questionnaireFlow.js, scoring.js, practicality.js, itinerary.js).
- Do not change the "7 days — suggested" label logic in DayScroller.jsx.
- State clearly for each fix which parts you verified by executing/measuring versus which are traced through code only and need live verification from me on a real phone.
- Run lint AND a production build. Both must pass clean before you commit.
- Commit when done. DO NOT PUSH — I push from Terminal with my SSH credentials.
- Report the commit hash and hand off explicitly per the AGENTS.md protocol.
