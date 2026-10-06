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

---

## Amendment, 1 October 2026 — the fillable-content invariant, and `ConnectionExperience`

- **Source:** `claude/design-f1-option-b-2026-09-30.md` v6.1, decisions **F1-D19**, **F1-D19a**, **F1-D19b**, **F1-D23**.
- **Deciders:** Rockstar (Asif), with ChatGPT review. Rockstar overruled Claude's recommendation; see §4 below.
- **Status of ADR-003 itself:** unchanged — **Accepted**. This amendment is **additive**. No existing section is weakened, and §2 (no stored reward), §4 (no region-specific schema or branching) and §5 (the variety rule) apply to everything added here.

### 0. One correction to how this amendment was described

The Phase F design doc said this amendment would keep *"A `ContentItem` belongs to exactly one Place"* **as written in ADR-003**. **That sentence is not in ADR-003.** It has been an engine rule since Phase B and is stated in the F1 design doc's Q1, but it was never written into this ADR.

So §1 below **records the invariant in ADR-003 for the first time**, at the level of precision Phase F needs, and §2 adds the one exception. It is still narrow and still additive — but it is an addition to this ADR's text, not a narrowing of text already here. Recorded so nobody later reads §1 as a restatement of something they cannot find.

### 1. The fillable-content invariant

> **Only Places own *fillable* content.**
>
> **Fillable content** is anything eligible to be selected into an itinerary slot by `fill.js` or `edit.js` — anything that can be returned by `eligibleItemsForBlock`. **`ContentItem` is the only fillable type, and a `ContentItem` belongs to exactly one Place.**

A Destination record (Door 1) or a `RouteFamily` (Door 2, and shared — see the ADR-001 amendment of the same date) selects *which places, in what order, for how long*. **Neither contains content.**

The invariant is load-bearing in five places, and every one of them is about *filling*: never-borrow and honest gaps; no stored reward (§2 above); the single eligibility/scoring entry point; shelf sizing against trip length; and thin-shelf honesty. The word **fillable** is what makes that explicit.

### 2. `ConnectionExperience` — a distinct, restricted, non-fillable type

§3 of this ADR gives a Connection a minimal factual model with nowhere to put an experience that *is* the journey: the Icefields Parkway, Tizi n'Tichka, the Hải Vân pass. The M0 audit found 21 such legacy templates. Attributing them to the arrival Place — Claude's recommendation — was **overruled**, correctly: a scenic drive is not an activity of the city it ends in.

> **A Connection may carry a restricted class of en-route experiences, `experiences[]`, which render only inside that Connection's own travel block.**
>
> - **Place content** = an experience while **based at** a Place.
> - **Connection experience** = an experience occurring **during travel between** Places.

**Six constraints, which are the type's boundary:**

| # | Constraint | How it is enforced |
|---|---|---|
| 1 | Does not participate in normal Place `fill.js` selection | A distinct type. `eligibleItemsForBlock` cannot return one |
| 2 | Does not fill Place-content gaps — an empty Place shelf still shows an honest gap | Type separation, plus a test that a Place with an empty shelf still reports a gap on a trip whose inbound Connection carries experiences |
| 3 | Does not substitute for destination activities — renders on the travel block only | There is no code path from a Connection to an activity slot |
| 4 | Tied to that Connection; not a free-floating item a route reuses | Owned by the Connection row, resolved at build time from the entry's `inboundConnectionId` |
| 5 | Stable identity, source and provenance | Permanent opaque id, never reused; `review.sourceUrl` required; `provenance.sourceTemplateId` where it came from a legacy template |
| 6 | Never silently duplicated as Place content | Separate id spaces make one record being both impossible. For the textual case, a **`(sourceTemplateId, sourceFragmentId)` pair is consumed exactly once** — as Place content **or** as an experience — checked for uniqueness in the migration tooling. **One source template may legitimately yield several fragments** |

**A distinct type, not a flag.** `ConnectionExperience` has its own type, its own id space, is never in the `ContentItem` collection and is never reachable from `eligibleItemsForBlock`. A boolean on `ContentItem` would have been one flag away from a general second content system. **A separate type cannot drift there without a visible, reviewable schema change** — which is the point.

### 3. Time is recorded, never assumed

> Each experience carries **`timeCost: 'within_connection' | 'requires_additional'`**.
>
> - **`within_connection`** — the experience happens inside the journey's existing duration, and the reviewed data genuinely means that. **These ship in Phase F v1.**
> - **`requires_additional`** — the experience genuinely needs time the Connection does not contain. **Deferred, never rendered as though free.** The renderer refuses an experience whose `timeCost` it cannot honour.

**Zero schedule time is not a rule of this architecture.** It is a description of what has been modelled so far. Baking it in would make the schema lie about the world. An en-route site that genuinely needs its own time has two honest futures — **promotion to a Place**, or a **modelled en-route stop** — each its own decision with its own evidence.

### 4. Curated build output, not traveller state

> A connection experience is **resolved** from the applicable curated Connection at build time. **It is not selectable, pinnable or swappable, and is not stored as a traveller edit.** It is recorded in the trip's evidence under a `connection` scope, per §6 of this ADR.

It therefore adds **zero identity surface** to the Phase F block-identity work. Traveller-selectable en-route stops are a **named future feature**, not a deferred part of this one; if they ever ship they arrive with their own identity decision.

**An estimated Connection never carries `experiences[]`.** An en-route experience is reviewed and source-backed by definition; a derived edge has nothing to attach one to. This also keeps the derivation axis of §2 clean: `derivation: 'curated' | 'estimated'` and review status stay orthogonal, an individual runtime estimate is derived rather than curated, and **the estimator ruleset itself is reviewed, versioned and tested** — a curated Connection always overrides an estimate.

### 5. What this amendment does not do

- It does **not** permit content on any other graph element.
- It does **not** make a Connection a Place, or give it a shelf.
- It does **not** relax §2: an experience is reviewed **content**, never a stored reward, score or appeal value.
- It does **not** authorize a build or a record migration.

## Addendum — 5 October 2026: bounded F6 connection facts

Approved F6 revision 3 keeps movement hours separate from layovers and endpoint/mode allowances. `reverse.durationHours` denotes movement; segmented overrides must supply a consistent complete reverse path. Legacy rows and buffer constants retain their behavior.

Flight estimates are admitted by the registered, reviewed ruleset and freshly computed immutable in-process rows, never by fabricated human review metadata or a stored version label. Stored evidence explains estimates but does not re-admit or rebuild them. Estimated trips retain activity edits; structural rebuilding is explicitly unavailable in F6.

Connection evidence owns the full resolved experience list per directed travel occurrence, including return and repeated traversals. New experiences require the sourceBundleId/sourceTemplateTitle/sourceFragmentId provenance triple. They remain separate from fillable Place content. Additional-time experiences are deferred and never rendered as included activities.

This additive clarification does not approve content migration, seasonal behavior, durable edit identity, record authoring or pilot widening. TripSequence remains provisional; Q8–Q10 and P1 requirements remain open.
