Read AGENTS.md, especially the multi-agent coordination protocol at the top. Confirm you've read it.

You are the declared writer for this session. Baseline is [PASTE HASH FROM git rev-parse HEAD]. No other system is editing this repo. Note: git fetch will fail from your sandbox — trust this stated baseline, and stop and tell me if your local checkout doesn't match it rather than proceeding.

CONTEXT — your previous three fixes (commit b5f6e54) are CONFIRMED WORKING on a real iPhone:
- Bug A (modal trap on mobile): fixed, close button reachable, content scrolls, portrait and landscape both good
- Bug B (hero image zero height): fixed, images now render. Your root cause was correct — percentage height not resolving against a min-height-only parent
- Bug C (questionnaire header overlap + wrong logo): fixed
Desktop confirmed unregressed.

One new bug found in continued live testing.

================================================================
BUG D — HeroMatchCard: text elements overlap when the destination name wraps
================================================================

On iPhone portrait (390px), the #1 Best Fit card for "Lisbon & Porto, Portugal" renders with overlapping text. Specifically:

- The destination title wraps to TWO lines ("Lisbon & Porto," / "Portugal")
- The country/region line ("🇵🇹 Portugal · Southern Europe") renders ON TOP OF the description paragraph ("Sun-drenched hills, pastel facades, trams and port wine — affordable, friendly and full of flavour.")
- Both occupy the same vertical space, so the text is unreadable where they collide

This did NOT reproduce with Rio de Janeiro, Mendoza, or Las Vegas — all of which have SHORT, single-line destination names. It reproduces with the long, two-line name.

Hypothesis to verify: something below the title is either absolutely positioned, or sits in a container with a fixed/assumed height that was sized for a single-line title. When the title wraps to a second line it grows downward into the space the country line and description were positioned to occupy, rather than pushing them down. Check whether the title overlays the image via absolute positioning and whether the content block below it reserves a fixed height.

Fix so the layout flows correctly regardless of title length — one-line, two-line, or three-line destination names must all render without any overlap, on widths from ~320px to ~430px.

Test explicitly with the longest destination names in the catalogue. Other likely long candidates to check: "Tanzania & Zanzibar", "Istanbul & Cappadocia", "Kyoto & Osaka", and any other multi-part name. Do not just test the short ones.

ALSO CHECK while you're in this component: the "BEST FIT" badge and the Travel Fit score ring both overlay the image at top-left. With the image container now at aspect-[16/10] on mobile, confirm these two elements don't collide with each other or with the title at narrow widths. Report what you find — do not restructure the layout for aesthetic reasons, only fix actual collisions.

NOTE ON SCORE RING PLACEMENT: I mentioned the score ring might read better on the right side of the image rather than the left. Treat this as an OPEN QUESTION, not an instruction. Report whether moving it would resolve any actual collision. If it's purely a visual preference with no functional problem, leave it where it is and say so — I'll decide separately.

================================================================
REQUIREMENTS
================================================================

- Do not change desktop behaviour.
- Do not touch the engine files (questionnaireFlow.js, scoring.js, practicality.js, itinerary.js).
- Do not regress any of the three fixes from commit b5f6e54 — particularly the desktop modal's fixed 1100x680 no-internal-scroll behaviour, and the hero image aspect-ratio fix.
- State clearly which parts you verified by actually rendering/measuring versus traced through code only.
- Run lint AND a production build. Both must pass clean before you commit.
- Commit when done. DO NOT PUSH — I push from Terminal with my SSH credentials.
- Report the commit hash and hand off explicitly per the AGENTS.md protocol.
