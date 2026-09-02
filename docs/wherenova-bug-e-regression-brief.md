Read AGENTS.md, especially the multi-agent coordination protocol at the top. Confirm you've read it.

You are the declared writer for this session. Baseline is [PASTE HASH FROM git rev-parse HEAD]. No other system is editing this repo. Note: git fetch will fail from your sandbox — trust this stated baseline, and stop and tell me if your local checkout doesn't match it rather than proceeding.

URGENT REGRESSION from your last fix (commit 12cd50d, "Fix HeroMatchCard text overlap when destination title wraps").

Your restructure changed the hero card overlay from absolute inset-0 positioning to a CSS Grid stack (grid + grid-area:1/1 per layer). This fixed the text-overlap bug (confirmed), but has broken something worse: on live mobile testing, the destination NAME AND LOCATION LINE ARE COMPLETELY MISSING from the hero card.

Reproduced on: Beijing (single-line title, the exact "control" case your own verification said was safe and pixel-identical to before). Screenshot shows: image, then score ring, then straight to the description paragraph — no "Beijing" title, no "China · Northern China, China" location line anywhere. Compare against the same destination correctly showing "Beijing / China · Northern China, China" in a DESKTOP screenshot from the same session — so this is mobile-specific and hero-card-specific.

DIAGNOSE THIS CAREFULLY, don't just re-apply the same class of fix blind. Leading hypothesis: with absolute positioning, the layer added last in the DOM automatically painted on top of earlier layers (implicit stacking via DOM order). Converting to a CSS Grid stack with grid-area:1/1 on each layer removes that implicit ordering — grid items need an EXPLICIT z-index to guarantee paint order. If the restructure didn't add explicit z-index to the text layer, the gradient scrim and/or image layer may now be rendering ON TOP of the text layer, hiding it entirely rather than causing visible overlap.

Check:
1. Does the title/location text layer have an explicit z-index higher than the gradient and image layers in the new grid structure?
2. Is the text layer perhaps rendering with zero opacity, wrong color (matching background), or genuinely empty due to a data-binding issue introduced by the restructure — rule this out too, don't assume it's purely a stacking problem.
3. Test with MULTIPLE destinations, both single-line (Beijing, Las Vegas) and multi-line (Lisbon & Porto) titles, to confirm the fix works for both cases this time — the single-line "control" case regressing means your prior verification method (isolated repro + getBoundingClientRect measurement) missed something the real rendered page has. Figure out why the isolated repro didn't catch this and say so explicitly.

Fix so BOTH are true simultaneously: title/location text is ALWAYS VISIBLE (this regression), AND text never overlaps when the title wraps (the original Bug D fix). Do not regress one to fix the other.

Given that your isolated-repro verification missed a real breakage, for this fix specifically: if you have any way to actually render the built app (not just an isolated component repro) before reporting done, use it. If you still cannot render the live app, say so plainly and flag this as needing my live-phone verification before I push, same as before — but be extra explicit about the gap given what just happened.

Run lint and build. Commit only after both pass. Do not push — I push from Terminal.
