# WhereNova — Polish pass (v3)

Supersedes `travelfit-visual-fidelity-pass.md` and
`wherenova-fidelity-pass-v2.md`. **Use this file only.**

Sections 1–7 and 9 of the original fidelity pass are already done (commits
e30328a–690576a). This file covers everything still outstanding, plus new
items.

Behavior, timings, ARIA and stored values stay as they are unless a section
says otherwise. No changes to scoring, itinerary generation, or the
Destination entity's structure.

Order matters: Part A first (it's a correctness bug affecting the whole app),
then B, C, D, E, F.

---

# PART A — Fix the Tailwind opacity-modifier bug repo-wide

You found that `bg-wn-surface/70` is invalid — Tailwind's `/NN` opacity
modifier doesn't work on plain-hex CSS variables, so the declaration is
silently dropped and the element falls back to a browser default. That's what
made the Q1 input render white-on-white.

This is a correctness bug, not a style preference, and every instance is an
invisible failure.

1. Grep the whole repo for opacity modifiers on `wn-` tokens:
   `bg-wn-*/NN`, `text-wn-*/NN`, `border-wn-*/NN`, `ring-wn-*/NN`.
2. List every occurrence and what it currently renders as versus what it was
   meant to be.
3. Fix them. The durable fix is to define the tokens as space-separated RGB
   channels so Tailwind's `<alpha-value>` works — e.g. `--wn-surface: 16 37 66;`
   with `rgb(var(--wn-surface) / <alpha-value>)` in the Tailwind config. If
   that's too invasive, use explicit `rgba()` values instead, but say which
   route you took and why.
4. The footer (`bg-wn-surface/60`) is a known instance — currently fully
   transparent.

Report the full list before fixing, in case any of them were accidentally
load-bearing.

---

# PART B — Navigation bar

The grey-blue band carrying the WhereNova wordmark appears on every page
after the landing page. It's flat, opaque, and belongs to no theme — it reads
as a leftover component.

Replace with the frosted treatment already used on the landing hero.

**On dark surfaces** (discovery home, results, saved trips):

```css
position: sticky; top: 0;
height: 68px;
background: rgba(8, 20, 40, .72);
backdrop-filter: saturate(160%) blur(18px);
-webkit-backdrop-filter: saturate(160%) blur(18px);
border-bottom: 1px solid var(--line);
```

**On light surfaces** (trip page below the hero, about):

```css
background: rgba(246, 249, 252, .82);
border-bottom: 1px solid var(--line);
/* same backdrop-filter */
```

**On the trip page specifically:** the nav sits over the full-bleed dark hero,
so it starts fully transparent with no border and transitions to the light
frosted treatment once the user scrolls past the hero.

Nav link text uses `--text-2`, going to `--text` on hover. Wordmark unchanged.

The questionnaire has no nav at all — already done, leave it.

---

# PART C — Results page fidelity

Reference: `wherenova-results-dark-vs-light.html` (dark mode). Ask the user
for the file if it isn't in the repo — do not guess at the layout.

## C1. Page container is too narrow

The whole results column currently sits at roughly 690px on a wide display.
Set `max-width: 1320px`, padding `0 32px`, centred.

## C2. Hero match — proportions are inverted

Currently the image column is ~40% and short; content is ~60%. It should be
the other way round.

```css
.hero {
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr);
  border-radius: 24px;
  overflow: hidden;
  border: 1px solid var(--line);
  background: var(--surface);
}
.hero .photo { min-height: 440px; }
```

Below 900px, collapse to one column with the photo at `min-height: 280px`.

## C3. The destination name belongs on the photograph

This is the single biggest reason the results page doesn't feel cinematic.
Currently the name, country and flag sit in the text panel. They should be
overlaid on the image itself, bottom-left, over a scrim:

```css
.photo::after {
  content: "";
  position: absolute; inset: 0;
  background: linear-gradient(180deg,
    rgba(8,20,40,0) 30%,
    rgba(8,20,40,.55) 68%,
    rgba(8,20,40,.94) 100%);
}
```

Inside the photo overlay, bottom-left, in this vertical order:
1. Travel Fit ring (large, 104px)
2. Destination name — Manrope 800, `clamp(30px, 3.2vw, 42px)`, white
3. Country · region — 13.5px, `rgba(255,255,255,.82)`

The coral "Best fit" badge sits top-left of the photo. Nothing else overlays
the image — no counters, no arrows.

## C4. Replace the three-bullet list with one written line

The card currently shows a templated bullet list ("Great for history and
culture / Peak season in April / Fits your selected budget level"). "Peak
season in April" repeats identically on all three cards.

Replace with:
- **One sentence** about the destination — the descriptive copy that already
  exists in the data (Tokyo's "A blend of neon city energy and serene ancient
  temples…" is exactly right). 17px, weight 500.
- **Then** at most two short pills for the fit reasons — e.g. "Fits your
  budget", "Great in April". Pills, not bullets, and only where they add
  something.

Apply the sibling-deduplication rule: if a card's reason string is identical
to another card's in the same view, fall through to the next reason from
`buildReasons()` rather than repeating it.

## C5. Facts row needs structure

The three facts (how you'll travel / travel time / time on ground) currently
float as loose text. Give them a bordered grid:

```css
.facts { display: grid; grid-template-columns: repeat(3, 1fr); gap: 2px;
         background: var(--line); border: 1px solid var(--line);
         border-radius: 12px; overflow: hidden; }
.facts > div { background: var(--surface); padding: 14px 16px; }
```

Labels: 10px, weight 700, letter-spacing .13em, uppercase, `--text-3`.
Values: 14.5px, weight 600.

## C6. Cards 2 and 3 — equal height, aligned CTAs

The "View my trip" buttons sit at different heights because the cards have
different content lengths. Fix properly rather than by padding:

```css
.pair { display: grid; grid-template-columns: 1fr 1fr; gap: 28px;
        align-items: stretch; }
.card { display: flex; flex-direction: column; height: 100%; }
.card .body { display: flex; flex-direction: column; gap: 18px; flex: 1; }
.card .body .cta { margin-top: auto; }
```

Both cards must be pixel-identical in width, image aspect ratio (16:10),
padding and radius. The name overlays the photo here too, same as C3, with
the standard 76px ring top-right.

Verify with a long name (Marrakech, the Sahara & Fes, Morocco) beside a short
one (Beijing) — the CTAs must align exactly.

---

# PART D — Travel Fit ring

## D1. Ring and backdrop must be concentric

The grey disc behind the ring is offset from the ring, which reads as a
rendering error. Both must share one centre.

Build as a single SVG with one `viewBox` where the backdrop, track and arc all
use identical `cx`/`cy`. Do not position the backdrop as a separate
absolutely-positioned element — that's almost certainly the cause.

```html
<svg width="76" height="76" viewBox="0 0 76 76">
  <circle cx="38" cy="38" r="36" fill="rgba(6,16,32,.38)"/>
  <circle cx="38" cy="38" r="33" fill="none"
          stroke="rgba(255,255,255,.22)" stroke-width="5"/>
  <circle cx="38" cy="38" r="33" fill="none" stroke="var(--cyan)"
          stroke-width="5" stroke-linecap="round"
          stroke-dasharray="207" stroke-dashoffset="…"/>
</svg>
```

Large variant: 104×104, `cx`/`cy` 52, backdrop `r` 49, track/arc `r` 46,
stroke-width 6, dasharray 289.

## D2. Reduce weight

It currently sits on the photo like a sticker.

- Backdrop: `rgba(6,16,32,.38)` plus `backdrop-filter: blur(8px)`
- Track: `rgba(255,255,255,.22)`
- Arc: `--cyan` at full opacity — the one element that stays crisp
- Numeral white; "TRAVEL FIT" label white at 72%

Verify on a bright image (San Diego) and a dark one (Tofino).

---

# PART E — Questionnaire remainder

## E1. Remove desktop question pairing

Reversing the earlier decision. Pairing produces 7 screens on desktop vs 9 on
mobile, forces extra Continue clicks, and cramps headlines. Three separate
pieces of user feedback trace to it.

`screenOrderFor()` returns the same 9 screens on every viewport. Remove the
paired layout and its Continue button. Single-select questions auto-advance
(300ms) with no button; only Q5 (multi-select) has a Continue.

Update the comments marking pairing as deliberate, and record in
`docs/PARKED.md` that it was tried and removed, so it isn't reintroduced.

## E2. Completion screen copy

"We know where to send you" reads as presumptuous. Replace with:

> **{N} days from {City}. We found three you'll love.**

This echoes the landing headline ("Find where you'll love going"). If the
result count can vary, use "We found your places." rather than hardcoding
three.

## E3. Resume vs restart

Answers persist, so re-entering the questionnaire shows every dash lit and
every question pre-answered — it reads as broken rather than helpful.

With a complete saved answer set, show a short interstitial before Q1:
- "Picking up where you left off — 5 days from Vancouver, August."
- Primary: "Continue" → jumps to the completion screen
- Secondary: "Start fresh" → clears answers, begins at Q1 with dashes dim

Partial sets resume silently at the first unanswered question, as now.

---

# PART F — Destination modal and images

## F1. Modal — fix the seam

Moving between destinations shows a blurred band where the image meets the
content panel. Likely a `backdrop-filter` sampling the image behind it, or an
overlay gradient extending past the image bounds. Find the actual cause
before changing anything. Clean edge, identical on every destination.

## F2. Modal — fixed dimensions

Must not resize when moving between destinations.

- Desktop: fixed shell ~1100×680, image left 60% / content right 40%
- Radius 24, image fills its column with `object-fit: cover`
- Navigation arrows **outside** the modal shell, left and right
- No image counter over the photo

## F3. Modal — no internal scrolling

Fixed height plus variable content means content must be capped:

- Name, country/region, Travel Fit ring
- Description clamped to 3 lines
- Top experiences: **maximum 4**, one line each, ellipsis on overflow
- Suggested length and best months as one compact row
- CTA pinned to the bottom of the panel

If content still overflows at these caps, report it — don't add a scrollbar.

Verify across at least 8 destinations of varying content length.

## F4. Destination image audit — report only, no edits

Tofino and Victoria render with white bands top and bottom, and Tofino has
`1/500 sec, f/11` visible in the bottom band. Those are photographer's
presentation frames with EXIF captions **baked into the image file**. No CSS
fix exists.

Produce a report:
- Check all 54 destination images for baked-in frames, borders, watermarks,
  EXIF caption text, or logos
- List affected destinations
- Note each image's aspect ratio, flagging any that crop badly at 16:10 or 4:5

Also confirm all card images use `object-fit: cover` with a fixed aspect
ratio. Replacement happens in Base44's data layer, not this repo.

---

# Verification

- `git commit` after each Part, lint, build.
- The questionnaire is verifiable locally. Results, trip, modal, rails and
  saved trips are **not** — they need the Base44 preview. Don't claim browser
  verification for those.
- Confirm by interaction, not by reading code:
  - Every `wn-*/NN` instance from Part A now renders as intended
  - Nav is frosted, not flat grey, and transparent over the trip-page hero
  - Results hero: image ~57%, name over the photo, one sentence not bullets
  - Cards 2 and 3 CTAs align exactly with mismatched content lengths
  - Ring backdrop and arc share a centre on every card
  - All 9 questions on desktop, one at a time
  - Modal shell never resizes across 8 destinations
- Screenshot the results page, one modal, and the completion screen.
