# WhereNova — MVP functionality audit (Claude Code brief)

**Baseline:** Beta UI v0.9 — pull latest `origin/main` before starting.

This is an **audit, not a build.** Do not fix anything. Do not commit code
changes. The only file you write is the audit report itself.

If you find something obviously broken, record it — do not repair it. The
point of this exercise is an honest inventory to decide what to build next.

---

## Scope — deliberately narrowed

The questionnaire flow and destination modal were rebuilt and verified live
over the previous two sessions. **Do not re-audit them in depth.** Spot-check
only, and only to confirm nothing regressed.

Focus effort on the four areas below, which have never been systematically
tested and are the most likely to hide real problems.

---

## AREA 1 — Result count behaviour

The scoring engine has a confirmed path where fewer than three destinations
pass the `isPractical` eligibility gate. `Results.jsx` has UI for this, but no
explicit product decision has ever been made about it.

Determine and report:

1. Under what specific input combinations does `rankDestinations()` return
   fewer than 3? Give at least 3 concrete reproducible examples
   (origin + trip length + interests + month + scope).
2. Can it return **zero**? If so, what does the user see? Is that state
   usable, or a dead end?
3. Is the fewer-than-three message accurate and actionable — does it tell the
   user what to change?
4. Does anything currently relax constraints to reach three, or is the gate
   absolute?
5. Read `Results.jsx`'s handling of the 0/1/2/3 cases and report whether each
   is genuinely handled or just happens not to crash.

**Do not change behaviour.** This is the input to a product decision.

---

## AREA 2 — Practicality and travel-time correctness

The riskiest thing in the product is recommending a trip that doesn't
physically work.

Determine and report:

1. Trace `practicality.js` end to end. Document the actual formula for
   `usableDestinationDays`, `oneWayHours`, and `minUsableDays()`.
2. Test the boundary: for a 3-day trip from Vancouver, which destinations
   pass the gate? Are any of them implausible (e.g. long-haul)?
3. Test the inverse: for a 14-day trip, are genuinely long-haul destinations
   correctly eligible, or is something over-filtering them?
4. Are travel-time estimates plausible? Sample 10 origin/destination pairs
   across short-haul and long-haul and sanity-check the hours against
   real-world flight times. Report any that look wrong.
5. `min_days` is documented as the real lever protecting against
   unrealistically short bookings on drive-heavy destinations. Is it actually
   set sensibly across all 54, or are some defaults unexamined?

---

## AREA 3 — Score quality and differentiation

If every destination scores 78–86, the score is decoration rather than
information.

Determine and report:

1. Run 8 varied preference profiles through `rankDestinations()`. For each,
   report the score spread across the full 54 (min, max, median, and the
   top-10 spread).
2. Do scores cluster? If the top 10 are within a few points of each other,
   the ranking isn't meaningfully differentiating.
3. **"No preference" behaviour:** confirm empirically whether selecting it
   removes the dimension from scoring or contributes zero points. Prior work
   claimed it's rank-neutral via `levelDistance`/`BUDGET_ORDER.indexOf`
   returning -1 — verify this is actually true by comparing scores with and
   without, on the same profile.
4. Are the reasons shown to users (`buildReasons()`) accurate — do they
   reflect the factors that actually moved the score, or are they generic?
5. Do the same inputs always produce the same output? Confirm determinism.

---

## AREA 4 — Saved trips and data persistence

Determine and report:

1. Open a trip saved **before** the Phase 2 schema addition (the Travel Fit
   score field). Does it render correctly, or show blank/NaN/undefined?
2. Is packing-list state isolated per saved trip, or shared across trips?
3. What happens to a saved trip if the underlying destination record changes
   (e.g. the three images just regenerated)? Does it re-read live data or
   hold a snapshot?
4. Does "Clear my data" fully clear everything, including saved trips and
   questionnaire answers? Any orphaned state left behind?
5. Guest persistence: what survives a browser refresh, and what doesn't?

---

## Output format

Write findings to `docs/MVP-AUDIT-2026-08-29.md`. One table per area:

| Item | Status | Evidence | Issue / gap | Beta priority |
|---|---|---|---|---|

**Status** is one of: `Works`, `Works with caveats`, `Broken`,
`Missing`, `Undecided (product question)`.

**Evidence** must state how you verified — file read, function executed, live
browser check. Distinguish clearly between "I read the code and it looks
correct" and "I ran it and confirmed the output." The first is weaker.

**Beta priority** is one of: `Blocker`, `Should fix`, `Nice to have`,
`Post-MVP`.

End the report with:
- The **3–5 highest-priority items** to address next, ordered
- Any **product decisions required** that you cannot make yourself (the
  fewer-than-three question is at least one)
- Anything you **could not verify** and why

---

## Constraints

- Local `npm run dev` cannot load `/results` or destination pages — the
  Base44 SDK has no backend. Use `base44 dev --remote` if the CLI session is
  still authenticated; otherwise state clearly what you could not verify
  live rather than inferring from code alone.
- Do not modify any file except the audit report.
- Do not commit anything except the audit report.
- If a session limit interrupts you, commit the partial report first so
  nothing is lost, and note where you stopped.

Work through Areas 1–4 in order. Report after each area rather than saving
everything to the end, so progress survives an interruption.
