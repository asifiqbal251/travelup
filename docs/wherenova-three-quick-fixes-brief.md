Three small fixes.

FIX 1 — Mobile menu background is semi-transparent. On iPhone, opening the mobile menu shows page content bleeding through behind the menu items — packing list rows and "Add back" controls were legible behind the menu links on a trip page. Make the menu background opaque. Diagnose whether it's a missing background colour, insufficient opacity, a missing backdrop/scrim, or a z-index issue, and report which. Verify at 320/375/390/430px over BOTH a dark surface (saved trips, results) and a light surface (trip page) — the bug was seen over a light one, so a dark-only fix isn't a fix. Use elementFromPoint() to confirm nothing behind the menu is reachable while it's open.

FIX 2 — Remove the "Signed in as [email]" line from the mobile menu. Mobile menu shows "My profile" and "Sign out" only. DO NOT change the desktop dropdown — the email stays there, where there's room and someone with multiple accounts needs it. It's also still on the profile page.

FIX 3 — Budget figures don't state their currency. They are USD. Add currency to the Trip Budget panel, kept light — the panel already says "flights not included" and two stacked caveats make an estimate look over-hedged. Suggested: fold into the existing note, e.g. "Estimates in USD. Flights not included." Propose different wording if it reads better. Check whether cost figures appear elsewhere needing the same treatment; report, don't add it to surfaces without costs.

MUST NOT REGRESS: the "Xh total travel each way" label and its Travel Fit caption; desktop profile dropdown incl. email; packing deletion (delete/undo/restore/denominator); guest one-trip limit, soft banner, hard prompt incl. the AlertDialogFooter flex fix; account trip sync and sign-out; trip page panels; all prior mobile fixes.

Do not touch scoring.js, practicality.js, itinerary.js, questionnaireFlow.js. Do not modify destination data. Mobile-first 320/375/390/430px. Coral for CTAs only, teal for score indicators only. Verify by rendering, not tracing — Fix 1 is a paint/layering bug, use elementFromPoint(). State what you verified live vs traced. Lint and build clean. Commit, DO NOT PUSH.
