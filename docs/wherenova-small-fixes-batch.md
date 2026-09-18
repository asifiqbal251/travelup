# WhereNova — Small Fixes Batch: CTA Width + Miss-State Ranking

Date: 2026-09-18
Status: Ready to hand to Claude Code
Note: the `activity_levels` data backfill originally bundled with this batch
has already been applied directly to the database and does not need building.

---

## 0. Risk framing

Both fixes are self-contained UI/logic changes in already-identified,
non-protected files. No protected file (`scoring.js`, `practicality.js`,
`itinerary.js`, `questionnaireFlow.js`) needs touching for either fix — if you
find otherwise, stop and report back.

---

## 1. Fix: landing page CTA buttons are unequal width

**File:** `src/pages/Landing.jsx`

**Root cause:** the two buttons sit in a `flex` container using `flex-1`.
`flex-1` equalizes *growth*, not rendered width — with `min-width: auto`
(the default), a button's intrinsic content width still wins, so "I know
where I'm going" (longer label) renders wider than "Find my Travel Fit."

**Fix:** change the container from `flex flex-col sm:flex-row ...` to CSS
grid, and both buttons from `flex-1` to `w-full`:

```jsx
<div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-stretch max-w-lg mx-auto">
  <Button asChild size="lg" className="w-full bg-ink text-on-dark ring-1 ring-teal/40 shadow-[0_10px_30px_-12px_rgba(2,218,227,0.55)] hover:bg-surface-dark hover:ring-teal/70 min-h-12 px-6 text-base focus-visible:!ring-teal focus-visible:ring-offset-cinema">
    <Link to="/questionnaire">Find my Travel Fit <ArrowRight className="w-4 h-4 ml-2" /></Link>
  </Button>
  <Button asChild size="lg" className="w-full bg-ink text-on-dark ring-1 ring-teal/40 hover:bg-surface-dark hover:ring-teal/70 min-h-12 px-6 text-base focus-visible:!ring-teal focus-visible:ring-offset-cinema">
    <Link to="/find"><MapPin className="w-4 h-4 mr-2" /> I know where I&apos;m going</Link>
  </Button>
</div>
```

Grid columns are equal-width by default, so both buttons render identically
regardless of label length. Keep every existing class on each `Button`
(styling, shadow, ring, hover states) — only the container and the
`flex-1` → `w-full` swap change.

**Verify:** both buttons render the same width at mobile (stacked) and
desktop (side-by-side) widths.

---

## 2. Fix: miss-state "close in spirit" ranking

**File:** `src/components/doorb/DestinationSearch.jsx`, `rankAlternatives()`

**Two real bugs, confirmed by reading the current code:**

1. **Distance banding causes wrong tie-breaks.** Distance is currently scored
   in coarse bands (`<500km` → 40, `<1500km` → 25, `<4000km` → 10, etc.)
   rather than continuously. Two destinations at meaningfully different real
   distances can land in the same band and then get ordered by array
   position instead of actual distance — e.g. Amsterdam (700km from a given
   query point) and Paris (900km) both score 25 and Amsterdam can rank
   *below* Paris despite being closer.
2. **Tag-similarity scoring was never implemented.** The original Tier 1
   brief asked for proximity blended with `interest_tags`/`primary_interests`
   overlap and shared `region`/`climate_tags`. Only proximity is currently
   scored — the similarity half is a no-op. This was not flagged as a scope
   gap in the prior completion report.

**Fix both:**

1. Replace the banded distance score with a continuous function of
   `distanceKm` (e.g. a smooth decay — closer scores higher with no hard
   band edges — max out at some ceiling for very close matches, floor near
   zero for very far ones; keep it simple and monotonic, no new dependency).
2. Implement the similarity half: score overlap between the query
   destination's (or resolved-country's) available tag signals and each
   candidate's `interest_tags` / `primary_interests`, plus a smaller bonus
   for shared `region` or overlapping `climate_tags`. Blend with the
   (now-continuous) distance score — reasonable starting weights are fine;
   this doesn't need to be perfectly tuned, just genuinely two-factor as the
   original brief specified.
3. Each suggestion must still state *why* it's offered (existing
   requirement, unchanged) — update the reason text if it now reflects a
   similarity match rather than only distance.

**Verify:** re-run the Amsterdam/Paris case (or equivalent) and confirm
ranking now reflects real relative distance, not band position. Confirm a
case where a farther-but-more-similar destination can now legitimately
outrank a closer-but-dissimilar one — that's the point of adding the
similarity term.

---

## 3. Verification before reporting done

- `git diff --stat` shows changes limited to `src/pages/Landing.jsx` and
  `src/components/doorb/DestinationSearch.jsx` — no protected files touched
- Landing page: both CTA buttons equal width, mobile and desktop
- Miss state: re-test a "Prague" style query and at least one case designed
  to expose the old banding bug; confirm ordering now makes sense
- Full regression suite not strictly gated (no protected files), but run it
  before shipping to production per standing policy
