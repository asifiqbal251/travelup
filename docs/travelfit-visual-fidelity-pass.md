# WhereNova — Travel Fit visual fidelity pass

The Build 7 behavior is correct. The visual treatment diverged from the
approved prototype because the original command specified interaction rules
in detail but visual composition only sparsely. This closes that gap.

Reference prototype: `wherenova-travelfit-concepts.html`, Concept B.
Nothing here changes behavior, timings, ARIA, or stored values.

Work through in order — 1 and 2 account for most of the perceived difference.

---

## 1. Remove the site chrome from the questionnaire

The questionnaire currently renders inside the standard app layout, so the
full nav bar (Home / Saved trips / About / Clear my data) sits above every
question on a grey-blue band.

The questionnaire is a full-bleed immersive route. It should render outside
the standard layout wrapper, with only a small `WhereNova` wordmark top-left
(17px, Manrope 800, letter-spacing −0.01em, with the `N` in `--cyan`).

No nav links, no "Clear my data", no grey band. The back arrow and the
question counter already sit at the bottom and should stay there.

---

## 2. Restore the background glow and its progression

Currently a flat `--page` navy. It should be a radial bloom behind the
content that shifts hue as the user advances — this is what makes the flow
feel like moving through something rather than paging a form.

Full-bleed layer behind the content:

```css
background: radial-gradient(120% 90% at 50% 8%, VAR 0%, var(--page) 62%);
transition: background 1.1s cubic-bezier(.2,.7,.3,1);
```

Per-question `VAR` value, in question order:

| Q | Question | Hue |
|---|----------|-----|
| 1 | Origin | `#1E4E6B` |
| 2 | Duration | `#28506E` |
| 3 | Month | `#2E4C74` |
| 4 | Company | `#3A4A78` |
| 5 | Interests | `#46426F` |
| 6 | Budget | `#57406A` |
| 7 | Climate | `#5E4160` |
| 8 | Pace | `#664253` |
| 9 | Activity | `#6B4448` |
| — | Completion | `#2E6B6E` |

On desktop paired screens (6+7, 8+9), use the first question's hue.

Text contrast must stay ≥4.5:1 against the brightest point of the gradient.

---

## 3. Centre the content

Currently left-aligned. The prototype centres the entire question card.

- `text-align: center` on the question card
- Question headline centred
- Hint line centred beneath it
- Option groups centred (`justify-content: center` on the flex row)
- Suggestion chips centred
- Text input centred, with centred placeholder text

The bottom row (back arrow left, counter right) stays as it is.

---

## 4. Fix vertical composition

The question block currently sits roughly 55% down the viewport with a large
empty band above it. It should be optically centred.

```css
.stage { min-height: 100vh; display: grid; grid-template-rows: auto 1fr auto; }
.mid   { display: grid; place-items: center; padding: 24px 32px; }
```

Header row (wordmark + progress rail) is row 1, question card is row 2,
back arrow + counter is row 3.

---

## 5. Fix the Q1 input

The origin input renders white — it's inheriting a global input style.
Scope it to the questionnaire's dark surface:

```css
background: var(--surface);
border: 1px solid var(--line);
color: var(--text);
padding: 16px 18px;
border-radius: 12px;
font-size: 17px;
text-align: center;
```

Placeholder uses `--text-3`. Suggestion chips below: transparent background,
`1px dashed var(--line-2)`, `--text-2` text, `999px` radius, `8px 14px`
padding; on hover, border and text go `--cyan`.

---

## 6. Option controls — compact chips, not grid boxes

Options currently render as large full-width boxes in a 2-column grid. They
should be auto-width pills that wrap and centre:

```css
.opts { display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; }
.opt  {
  background: var(--surface);
  border: 1px solid var(--line);
  color: var(--text);
  padding: 14px 20px;
  border-radius: 12px;
  font-size: 15px;
  font-weight: 500;
}
.opt:hover { border-color: var(--line-2); transform: translateY(-1px); }
.opt[aria-checked="true"], .opt[aria-pressed="true"] {
  border-color: var(--cyan);
  color: var(--cyan);
  background: linear-gradient(180deg, rgba(63,216,224,.16), rgba(63,216,224,.07));
}
```

Note the selected state changes the **text** to cyan as well as the border.
Currently the label stays white, which reads as a weaker selection.

Keep the existing checkmark if you prefer — but selection must not be
communicated by colour alone, so the border weight change stays regardless.

For the four scale questions (6–9), use the segmented control from the
prototype (`.seg`) rather than loose chips — a single bordered container
with four equal cells inside, max-width 520px, centred.

---

## 7. Constrain content width

Question card `max-width: 640px`, centred. Currently closer to 900, which
spreads the options too far apart and weakens the centred composition.

Headline scale: `clamp(30px, 4.6vw, 50px)`, weight 800, line-height 1.08,
letter-spacing −0.03em.

---

## 8. Verify the font actually loaded

Check the computed `font-family` on a question headline in devtools. Confirm
Manrope is resolving and not silently falling back to a system sans. If it's
not loading, fix the font loading rather than changing the type spec.

Display type: Manrope 700/800. Body/UI: Inter 400–600.

---

## 9. Desktop paired screens

Pairing Q6+Q7 and Q8+Q9 above 1024px stays — that's intentional.

But paired screens currently lose the centred composition entirely, which is
where the flow feels most like a form. Fix: the two questions sit as two
centred columns within a max-width 1040px container, each column internally
centred, with the shared Continue button centred beneath both rather than
pushed to the bottom-right corner.

---

## Verification

- `git commit`, lint, build.
- Live-browser check in Base44 preview after sync (local `npm run dev` can
  load the questionnaire fine — only `/results` and destination pages 404).
- Confirm: no nav bar in the flow, glow visible and changing between
  questions, everything centred, no white input, options as chips.
- Confirm contrast on the brightest gradient (Q9, `#6B4448`).
- Confirm keyboard nav, focus rings and reduced-motion still work.
- Screenshot Q1, Q4, Q8 and the completion screen for side-by-side review
  against the prototype.
