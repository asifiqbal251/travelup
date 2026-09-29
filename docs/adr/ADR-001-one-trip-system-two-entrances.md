# ADR-001: One trip system, two entrances

- **Status:** Accepted (direction). Implementation deferred to Phases F–G of `claude/next-plan-2026-09-25.md`.
- **Date:** 28 September 2026
- **Deciders:** Rockstar (Asif), Claude, ChatGPT — three-way alignment, no open disagreements
- **Sources:** `claude/graph-direction-alignment-2026-09-25.md`, `claude/three-way-alignment-door2-2026-09-24.md` (step 2), `claude/next-plan-2026-09-25.md` §2, §4
- **Supersedes:** nothing. **Superseded by:** nothing.

---

## Context

WhereNova has two entrances, and today they are two separate products underneath.

**Door 1 (Travel Fit)** is live and public. A traveller answers a questionnaire, and the deterministic scoring engine ranks single destinations. Its itineraries are built by the legacy path — `itinerary.js` and `multiDestItinerary.js` — from **bundle-shaped** day templates hanging off Base44 Destination records (for example "Cusco & Machu Picchu, Peru"). It has **no itinerary editing**, which 2 of 3 beta users have asked for since 18 September.

**Door 2 ("I know where I'm going")** is a hidden pilot at `/plan?key=door2`. The traveller names a destination, curated Route Families choose the stops and their order, and a newer chain — `route.js` → `schedule.js` → `fill.js` → `edit.js` — produces a **per-place, block-shaped** itinerary the traveller can actually edit (swap, reject, pin, make lighter, undo), plus structural edits (nights, optional stops, route switching).

The pressure this ADR resolves: the beta-requested feature is "let me edit my itinerary," and Door 2 already has a tested, live-verified edit engine. The obvious short path is to build a second editor for Door 1's bundle-shaped output. That path produces two edit engines, two sets of edit semantics, and two things to fix every time an edit rule changes.

A second pressure, resolved in the negative: ChatGPT proposed a shared "Trip Planner" that would decide, for both doors, which places, how many days and in what order. That quietly turns Travel Fit into a multi-stop planner — a product decision nobody has made — and replaces curated Route Families with a general automated planner that does not exist. ChatGPT withdrew the proposal (Addendum 3, `graph-direction-alignment-2026-09-25.md`).

## Decision

> **One graph. Shared primitives. Separate curated selection mechanisms. One `(place, days)[]` handoff. One shared itinerary + edit engine.**

Concretely:

1. **One shared world graph.** Places are nodes with factual attributes; Connections are edges with factual travel properties. Both doors read the same graph. See ADR-003 for what may be stored on it.

2. **Shared deterministic primitives.** Scoring and constraint/feasibility rules interpret that graph for a particular traveller and trip. Both doors use the same ones.

3. **Selection stays separate, deliberately.** Travel Fit ranks single destinations. Door 2 uses reviewed, curated Route Families. These are different mechanisms answering different questions, and unifying them is **not** part of this decision.

4. **One handoff contract.** Both doors' selection stages produce the same object: **a sequence of one or more places, each with an allocated number of days** — `(place, days)[]`, working name `TripSequence`. Travel Fit's sequence has one entry today; Door 2's has several. The contract is typed in Phase F.

5. **One itinerary engine and one edit engine.** After the handoff, everything runs through `fill.js` and then `edit.js`. Door 1 gets editing by **reusing `edit.js`**, never by building a second editor.

```text
                SHARED WORLD GRAPH (places + attributes + connections)
                        │
          ┌─────────────┴─────────────┐
       DOOR 1                       DOOR 2
    Travel Fit                 traveller names destination
  ranks single destinations          │
          │                    ROUTE FAMILIES (curated, reviewed)
          ▼                          ▼
     [(Tokyo, 7)]        [(Cusco, 3), (Aguas Calientes, 1), …]
          └─────────────┬─────────────┘
              SHARED ITINERARY ENGINE (fill.js)
                        ▼
              SHARED EDIT ENGINE (edit.js)
                        ▼
                  EDITABLE ITINERARY
```

## What this decision is not

This is a **direction recorded now, implemented later.** Nothing in this ADR authorizes a build. In particular:

- It does **not** merge the two doors' trip models today. That merge is Phase F (Option B) and Phase G, gated behind Eastern Canada. Running a new route family and a trip-model merge at the same time would conflate two independent sources of bugs and defeat the purpose of Eastern Canada as an isolated generalization test.
- It does **not** change Travel Fit's product promise. Travel Fit recommends single destinations. Its top-3 output is unchanged.
- It does **not** retire the legacy Door 1 itinerary path. That path stays until the shared engine has demonstrated **parity**, with evidence. Retire on evidence, not because the new design looks cleaner.
- It does **not** permit a temporary Door 1-only editor or adapter as a stopgap. If Door 1 editing moves earlier than planned (decision D7), it moves as **genuine convergence** — the real shared engine — or it waits.

## Explicitly undecided

These are named so that nobody mistakes silence for a decision. Each needs its own evidence and its own decision:

1. **Should Travel Fit ever recommend multi-stop trips?** Nothing above implies it.
2. **Should WhereNova ever have an automated graph planner** that picks extra places, nights, order and route from an anchor destination alone? Potentially valuable for Door 2 one day. Parked. Not part of the committed architecture.
3. **Door 2's public positioning** — replace Door 1's multi-destination flow, run alongside it, or stay a limited pilot. Decided at the Phase D checkpoint (D8).

## Consequences

**Positive**

- One edit engine to build, test, explain and fix. The beta-requested Door 1 editing arrives as reuse rather than as a second implementation.
- The graph foundation is what later ambitions need anyway: cross-border trips need connections that cross borders; Travel Companion needs places that own their content; "add somewhere nearby" needs traversal from where the traveller already is.
- Briefs can point at this file instead of re-deriving the target shape.

**Costs and risks**

- Door 1 editing waits for Option B. The mitigation is P4, a read-only diagnostic of how far Door 1's output is from Door 2's block shape, feeding checkpoint question 6.
- `fill.js` and `edit.js` become load-bearing for the whole product. Phase B's integration tests exist partly for this reason.
- Option B is a large phase touching 64 Base44 records. It is gated behind a design doc (F1), and no record migration starts until its questions 8–10 (identity, legacy compatibility, cutover/rollback) are approved.

## Review trigger

Revisit if the Phase F design doc concludes that Door 1 itineraries **cannot** be expressed in Door 2's block shape without either a lossy migration or a special case in the shared engine. That finding would be a real argument against this ADR, and it should reopen it rather than be worked around.
