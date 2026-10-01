# ADR-002: Structural edits — preview → validate → apply, with reconciliation

- **Status:** **PROVISIONAL.** Validated against Peru (Route Family #1) only. Graduates to Accepted, or is revised, at the Phase D checkpoint using evidence from Eastern Canada (Route Family #2).
- **Date:** 28 September 2026
- **Deciders:** Rockstar (Asif), Claude, ChatGPT
- **Sources:** `claude/claude-response-to-chatgpt-review-2026-09-24.md` (Q1, Q4), `claude/design-door2-route-families-2026-09-23.md`, `claude/three-way-alignment-door2-2026-09-24.md` (step 2), verified directly against the source of `restructure.js` and `families.js` on 24 Sep
- **Source-verified:** 28 Sep 2026, read-only, against `main` at commit `28cdf77` (`restructure.js`, `families.js`, `fingerprint.js`, `planner.js`, and the change-route handler in `Door2Plan.jsx`). Where the code differs from the earlier 24 Sep description, this text follows the code.
- **Relates to:** ADR-001 (the edit engine this describes is the shared one), ADR-003 (the variety rule it applies)

---

## Why this one is provisional

Writing a general architecture rule from a single family risks writing a **Peru-shaped rule that merely claims generality.** Peru's shape is narrow in ways that were invisible until they were named: one linear backbone whose order is fixed by altitude acclimatization, one optional stop (Huaraz) that only ever attaches at the ends of the route, and connections that are all point-to-point duration estimates rather than real timetables.

So this ADR records what the code actually does today and commits to the contract, while flagging that its **generality is unproven until Eastern Canada exercises a reversible backbone, a genuinely mid-route optional insertion, and two simultaneously-active optionals.** Do not cite this ADR as settled precedent before Phase D.

## Context

A "structural edit" changes the shape of a trip, not just its contents: add a night, remove a night, add or remove an optional stop, move an optional stop to a different position, switch to a different authored route alternative. These differ from bounded edits (swap, reject, pin/unpin, make-lighter) in that the calendar itself changes, which means the activities that were placed against the old calendar may no longer fit.

The naive approach — mutate the trip in place and patch up what breaks — produces trips that quietly lose a traveller's pinned choices, and previews that do not match what actually gets applied.

## Decision

### 1. Preview → validate → apply, with no recalculation at apply time

Every structural `preview*` function in `restructure.js` (`previewAdjustNights`, `previewChangeLength`, `previewAddOptional`, `previewRemoveOptional`, `previewMoveOptional`) returns **either**:

- **ranked proposals**, where each proposal carries a **fully rebuilt, filled and re-validated `Trip`** plus a diff describing what changed; **or**
- a **structured refusal** with a machine-readable reason.

`applyProposal` **never recalculates.** It checks a fingerprint match and then commits `proposal.trip`. The only additions at commit time are bookkeeping, not recomputation: the previous trip is pushed onto the undo history (capped at 20, the same cap as `edit.js`), and when the nights allocation changed the plan is marked `nightsSource: 'user'`.

**The guarantee this buys:** the itinerary the traveller was shown in the preview is exactly the one they get (the trip content is not rebuilt at apply time). There is no second, differently-parameterized build between looking and accepting.

### 2. Stale-preview guard by content hash

A proposal carries `baseFingerprint`, a deterministic content hash (FNV-1a, canonical JSON) over the trip's `spec`, `routePlan` and `days`; `history` is deliberately excluded, so an undo restores an earlier fingerprint too. The hash detects staleness; it is not a security feature. A proposal is bound to the trip state it was computed from. If that state has changed since — the traveller edited something in another part of the UI — `applyProposal` **refuses** rather than committing a proposal built against a trip that no longer exists. The UI's correct response is to rebuild the proposal and show it again, not to force it through.

### 3. Reconciliation preserves accepted choices by stable block id

`reconcile()` is what survives a structural change:

- **Pinned items are tried first.** A pinned item is kept when its block still exists as an open block of the same slot class and the item is still eligible there. **A pinned item that cannot survive the change is not kept and not silently dropped:** it is reported in the proposal's `keptItemsAffected`. (This matches the design rule "incompatible pins produce a listed conflict, never a silent drop." Whether the UI surfaces that list to the traveller is not confirmed; test B12 must assert it.)
- **Rejected items are never re-placed** — they are filtered out of the fill shelf before `fillTrip` runs.
- **Everything else that still fits is kept**, matched by block id + slot + eligibility.
- Only genuinely orphaned content is re-filled.

### 4. Full-skeleton rebuild, not a dependency graph

`reconcile()` rebuilds the **entire** skeleton from the route plan and then reconciles content against it by matching stable block ids. There is **no explicit dependency graph** computing an "affected region."

This is a deliberate choice, not an omission. It reaches the same practical outcome — untouched days usually survive byte-identical — without dependency-tracking machinery. Trips are small (10–19 days) and the rebuild is cheap. A real dependency graph would be premature for a pilot.

**Revisit only if** Eastern Canada's larger or more interdependent structure makes full rebuilds noticeably lossy or slow. Not before, and not on aesthetic grounds.

### 5. Variant enumeration is compiled and bounded, not hand-authored

`compileFamily()` mechanically enumerates every non-exclusive combination of optionals × positions (`enumerateCombos`) and hard-caps the result at `MAX_VARIANTS_PER_FAMILY = 24`, throwing a `FamilyAuthoringError` at compile time if a family would exceed it. `exclusiveWith` lets an author prune known-incompatible pairs before the ceiling is reached.

A human authors **constraints** — backbone, optionals, positions, exclusivity. The compiler produces the bounded combinatorial closure. Nobody hand-writes 24 itineraries.

`previewAddOptional` / `previewMoveOptional` build the **full current selection**, not just the one change, when looking up the target package — so multi-optional combinations resolve through the same `findRoutePackage` path as single-optional ones. No special case is needed for N > 1.

### 6. Held positions are compiled, validated, and never served

A position authored `pending_review` makes its variant "held". Held variants are compiled and schedule-checked, but never served to a traveller. **How it is actually enforced (verified):** (1) `compileFamilies` excludes held variants from its default output, so the served package list never contains one; a separate all-variants list (`includePending: true`) exists only so a saved route plan can be looked up by id. (2) Every add / remove / move path in `restructure.js` refuses when the resolved package is held. **It is a guard applied by each caller, not one central barrier** — `findRoutePackage` will return a held variant if asked. A future structural function that forgets the check would leak one, so Phase B adds an invariant test that no preview or planner path can return a trip built on a held variant.

## Scope boundaries — what this contract does NOT cover

Named plainly so that the ADR never implies more than the code does:

1. **Booking locks do not exist.** No `Trip` or `RoutePlan` field represents "this leg is actually booked and non-negotiable." Today **"locked" means traveller-pinned — a preference lock, not an agent-booked hard lock.** That is correct for a pilot where nothing is booked. A distinct hard-locked state is **named future work** for the Travel Companion phase, not a gap to close before Eastern Canada.
2. **`MAX_VARIANTS_PER_FAMILY = 24` is a provisional safety bound**, not a researched ceiling. It is documented as such and revisited only if a real family approaches it.
3. **`checkVariantsSchedulable` validates each compiled variant once, at its own minimum length, against a fixed synthetic spec:** origin `vancouver` (a parameter with that default, not hard-coded), **`travelMonth: 1`**, a couple, balanced pace. Multi-origin is a stated scope boundary. **Month is a real gap for Eastern Canada:** a schedule-constrained or seasonal connection is checked only for January. Phase C0 must decide how schedulability is validated across months.
4. **Route-alternative switching is outside this contract.** It is not a `preview*` function. `handleChangeRoute` in `Door2Plan.jsx` rebuilds the whole trip from the spec with a new `routeTemplateId`, which discards the traveller's edits (pins, swaps, added stops) without preview, stale-guard or warning. That was a deliberate MVP choice (23 Sep route-alternatives brief), not an accident, but it is the one structural change that does not preview → validate → apply. Whether Eastern Canada's reversible direction is offered as route switching or as a structural edit is a Phase C0 question.
5. **Pinning has no UI.** `edit.js` exports `pinActivity` / `unpinActivity`, but `Door2Plan.jsx` never calls them (verified 28 Sep 2026 at commit `28cdf77`; any earlier assumption of a pin control on `/plan` is not borne out by the code). Swapping does not lock a block either. So `reconcile()`'s pinned-first path is reachable today only from engine code and tests, not by a traveller. Adding a pin control is a new feature, frozen until the Phase D checkpoint; if it is ever built it must ship with traveller-visible surfacing of `keptItemsAffected` (finding F2).

## Consequences

**Positive**

- Previews are trustworthy by construction; "no silent lies" holds at the edit layer.
- A traveller's pins and rejections survive structural change, which is what makes iterative editing feel safe.
- Authoring a new family is authoring constraints, not permutations — the property that makes Route Families scalable at all.

**Costs and risks**

- Every structural edit costs a full rebuild. Cheap now; a real constraint if trips ever get much longer.
- Reconciliation correctness depends entirely on **stable block ids**. This is why Phase F question 8 (permanent IDs for Place, content item, itinerary block and `TripSequence`) is a gate, not a detail.
- **The empirical gap:** Peru has exactly one optional, so a family with **two or more simultaneously-active optionals has never been compiled, schedule-checked or exercised end to end.** Whether `schedule.js`'s day-count simulation behaves correctly with two insertions spliced into one backbone is genuinely unverified — not because the design lacks support, but because nothing has asked it to. Eastern Canada's Ottawa + Niagara combination is the test.

## How this ADR graduates

At the Phase D checkpoint, using Phase C evidence, answer:

1. Did §3 (reconciliation by stable block id) hold for a **mid-route** insertion, not just an end-attached one?
2. Did §5 hold with **two optionals active at once**, through compile, `checkVariantsSchedulable`, and add/remove in either order?
3. Did §4 (full-skeleton rebuild) stay cheap and non-lossy for a reversible backbone?
4. Did anything require destination-, region- or country-specific branching in `route.js`, `families.js`, `schedule.js` or `restructure.js`? Any such change is a finding, reported as **"reusable capability"** or **"Eastern-Canada-specific special case"** — the second is the warning sign, not code change as such.

5. Did preview → validate → apply remain correct when a structural proposal involved a **schedule-constrained Connection**, with infeasible rebuilt trips refused before apply?

**All five clean → Accepted. Any one not clean → revise this ADR before Phase E.**

The Phase B integration tests B10 (stale preview refused) and B12 (pin → structural change → apply → undo) exist specifically to test this ADR's promises where features *interact*, and should be treated as its executable specification.

---

## Amendment, 30 September 2026 (agreed) / 1 October 2026 (recorded) — a preview never throws

- **Source:** `claude/checkpoint-phase-e-2026-09-30.md` §4; defect **EF1**, closed 30 Sep (`claude/ef1-diff-review-2026-09-30.md`).
- **Deciders:** Rockstar (Asif), with ChatGPT review (the authoring / data-integrity carve-out is ChatGPT's correction 6).
- **Status of ADR-002 itself:** unchanged by this amendment. See the note on status below.

### The invariant

> **A preview invoked from a valid, traveller-reachable trip state must return proposals or a structured refusal; it must not throw an uncaught exception. This does not prohibit authoring or data-integrity errors from throwing — a `FamilyAuthoringError` or `PackageAuthoringError` raised by invalid authored data is correct behaviour and remains so.**

### Why it is an explicit invariant and not an implication of §1

§1 already says every `preview*` returns ranked proposals **or** a structured refusal. Until EF1 that held only where the night allocation sat within authored limits.

EF1: the round-robin scheduler deliberately stretches a stop past its authored maximum on a long trip (Tokyo at 12 nights against an authored max of 10, on a 14-day trip), but `emitOverride` in `schedule.js` rejected that same allocation and two clamps in `restructure.js` clamped it back down. Four separate previews threw, and the UI dutifully rendered the throw as a refusal.

> **A refusal that is really a caught crash is worse than a crash, because it looks like a product decision.**

That is the failure this invariant exists to name. It was closed by EF1 — the rule now enforced is *an over-maximum allocation may be kept or reduced, never raised; the minimum stays a hard floor; a preview never throws* — behind a 500-preview and a 466-day-trip sweep.

### Scope, stated precisely

- **The precondition is load-bearing.** "From a valid, traveller-reachable trip state" is what the invariant is scoped by. Caller-contract guards on invalid **arguments** — `previewAdjustNights` rejecting a `delta` other than ±1, an unknown `stopKey`, a trip with no `routePlan` — are programming-error guards, not reachable from a traveller's trip, and are not prohibited.
- **Route-alternative switching is outside this invariant**, as it is outside the whole contract. Scope boundary 4 stands: `handleChangeRoute` is not a `preview*` function.
- **Day-trip selection is inside it.** `buildTripFromRoutePlan` refuses rather than throws (Phase E), which is the same rule applied at the resolver.

### A note on this ADR's status, for whoever reads it next

This file still reads **PROVISIONAL**, graduating at the Phase D checkpoint. That checkpoint has since passed (29 Sep) and Phase E has closed (30 Sep). Of the five graduation questions: 1, 2, 3 and 4 are **clean across three families** — mid-route insertion (test F7), two simultaneous optionals, non-lossy full-skeleton rebuild now including excursion selections, and **no destination-specific branching, verified by grep**. **Question 5 (a schedule-constrained Connection) remains NOT ANSWERABLE** and has now been deferred by name a third time; it is the same open item as ADR-002 Q5 in the Phase F design.

The Phase E checkpoint recorded *"no change of status"* while describing the ADR as accepted for what three families have proven. **This amendment does not resolve that ambiguity, because a status change is a decision and not a documentation fix.** It is flagged here so the next reader sees it rather than inferring one answer or the other.
