# ADR-003: Graph data discipline

- **Status:** Accepted.
- **Date:** 28 September 2026
- **Deciders:** Rockstar (Asif), Claude, ChatGPT — three-way alignment, no open disagreements
- **Sources:** `claude/graph-direction-alignment-2026-09-25.md`, `claude/next-plan-2026-09-25.md` §2
- **Relates to:** ADR-001 (this is the data layer that ADR-001's shared engines read), ADR-002 (the variety rule constrains the edit engine)

---

## Context

ADR-001 commits to one shared world graph underneath both doors. This ADR says what may and may not be stored on it, and how the graph is reasoned over.

Two framings had to be corrected on the way here, and both corrections are load-bearing:

1. **The problem is not shortest-path.** The first research brief modelled trip selection as a Dijkstra/A* problem. It is not. Choosing a trip is an **Orienteering Problem / Tourist Trip Design Problem**: pick the best *subset* of places, in the best order, within the days and budget available. Shortest-path machinery answers a question nobody asked.
2. **"Graph" is a way of modelling data and reasoning, not a product to buy.** No Neo4j. Base44 entities plus ordinary JavaScript data structures.

The failure mode this ADR is written against is storing a *judgement* as if it were a *fact* — a "score" or "appeal" field on a place — which then cannot be honestly explained to any particular traveller and silently goes stale.

## Decision

### 1. Vocabulary, fixed

| Term | Meaning |
|---|---|
| **Place** | A node. Somewhere a traveller spends time. |
| **Connection** | An edge. A way of getting from one Place to another. |
| **Place attributes** | Node facts. |
| **Connection properties** | Edge facts. |
| **Reward** | `reward(place, traveller, trip_context)` — computed, never stored. |
| **Constraints** | Feasibility rules (time, opening, altitude, schedule). |
| **Route / itinerary** | A chosen path through the graph. |

### 2. Facts live on the graph. Reward is computed, never stored.

Places and Connections store **facts**. Reward is always a function of the place, the traveller and the trip context, calculated each time and **never written back as a field**. This is already how `scoring.js` works, and it is now a rule rather than an accident.

**Test to apply when adding any field:** *Is this a source-backed property of the Place or Connection, or does its value change because of the traveller's preferences or trip context?* Source-backed properties belong on the graph. Traveller- or trip-specific judgments are computed, not stored. Factual values may still vary by date, fare eligibility or other objective conditions; that does not make them reward.

### 3. Minimal, factual Connection model

A Connection stores: **from, to, mode, duration, cost or cost band, number of transfers, review/source metadata** (`reviewedBy`, `reviewedAt`, source name and URL).

**Friction and fatigue scores are derived by rules, never manually assigned as subjective ratings.** Curators may store source-backed factual inputs — such as duration, transfers, mode, departure/arrival timing or other generally applicable connection facts — and the rules derive friction/fatigue from those inputs. The reasoning can then be explained and changed in one place.

**Schedule-constrained connections (per decision D5):** some connections have fixed departures rather than a duration estimate. The engine may carry a **generic, minimal schedule concept** honoured by the scheduler when present. The concept, not the field name, is what this ADR fixes — Phase C0 may choose a small generic schedule object over a bare `departures` field. **This is not a timetable system**, and nothing here authorizes building one.

### 4. No region-specific schema, no region-specific branching

Two rules, both required (Phase C acceptance criterion (g)):

1. **No region-specific schema fields.** Any new field must be a generally applicable travel concept. `departures` or a generic schedule object: acceptable. `viaRailDepartures`: not acceptable.
2. **No destination-, region- or country-specific branching in shared engine code.** `if (country === 'Canada')`, or a check on a specific place or family ID, is not acceptable in `route.js`, `families.js`, `schedule.js` or `restructure.js`.

**The test:** could the new capability apply to another region with zero engine changes?

### 5. The variety rule (two levels, frozen context)

This goes into the Option B brief verbatim:

1. **Route-level variety** is used **only** when comparing whole route candidates. Once a route is chosen, it is **never re-scored because an activity changed.**
2. **Activity-level variety** is used **only** for the **one slot currently being filled or edited.** The rest of the itinerary is **frozen context.** `fill.js` and `edit.js` apply it through the same shared scoring function.

**The failure this prevents:** swapping one activity on Day 4 silently changes the scores on Days 1–10.

### 6. Decision evidence is stored with the trip

Saved trips store the reasons that applied **at generation time** — reason codes plus the key values behind them. Explanations are **never recalculated later under different rules**, because a recalculated explanation is a plausible-sounding invention rather than an account of what happened.

Natural home: the versioned snapshot reader from draft persistence. Implemented when explanations are built; the shape is decided in Phase F question 7.

### 7. Retrieve first, optimize second

At current scale, **route families and bounded enumeration are the optimizer** (`MAX_VARIANTS_PER_FAMILY = 24`). Curated Route Families are a deliberate quality decision, not a stopgap waiting for an automated planner.

### 8. Deterministic now; learned models are parked

Order: deterministic rules **now** → similarity retrieval and behaviour-informed reranking **later** → GNN, collaborative filtering, RL **maybe, much later, with their own decision.**

Not now, and not implied by anything above: **Neo4j, GNN, RL, collaborative filtering, a world-scale place database, a general-purpose route optimizer.**

**The reason is product, not engineering taste.** Learned models are black boxes, and explainability and traceability are core product requirements. "No silent lies" is not compatible with a recommendation nobody can account for.

## Consequences

**Positive**

- Adding a destination is adding facts, not opinions — which is what makes coverage scaling a data task rather than a judgement task.
- Explanations can always be traced to the factors that actually drove a decision.
- Criterion (g) gives Phase C a falsifiable test of whether the model generalized, instead of a verdict by vibe.

**Costs and risks**

- Deriving friction by rule is more work up front than a hand-entered number, and the rules need tuning.
- Refusing stored scores means recomputing on every request. Trivial at this scale; noted as a boundary.
- "No region-specific branching" will occasionally make a change harder than a quick conditional would. That difficulty is the signal the rule exists to produce.

## Review trigger

Revisit if a Route Family genuinely cannot be expressed without either a region-specific field or region-specific branching. That is exactly the finding Phase C is designed to surface, and it belongs at the Phase D checkpoint — not worked around quietly in a build.
