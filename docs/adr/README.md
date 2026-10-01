# WhereNova Architecture Decision Records

**Purpose:** these files hold WhereNova's settled architecture decisions and its two standing engineering rules. They live in the repo so that every Claude Code, ChatGPT/Codex or human session reads them without being told to. A build brief should be able to point at an ADR instead of re-arguing a decision.

**Mirror:** each file is also saved to the claude.ai project as `claude/adr-*-2026-09-28.md` for planning sessions that have no repo access. The repo copy is authoritative.

---

## Index

| ADR | Title | Status |
|---|---|---|
| [ADR-001](./ADR-001-one-trip-system-two-entrances.md) | One trip system, two entrances | **Accepted (direction).** Implementation deferred to Phases F–G. **Amended 1 Oct 2026** — the handoff carries one *or more* entries; `RouteFamily` is a shared domain object a Destination record references; the handoff counts nights. |
| [ADR-002](./ADR-002-structural-edits-preview-validate-apply.md) | Structural edits: preview → validate → apply, with reconciliation | **Provisional** as written. **Amended 1 Oct 2026** — *a preview never throws* added as an explicit invariant. **Status needs a call:** graduation questions 1–4 are clean across three families, question 5 is still unanswerable, and the file and the Phase E checkpoint disagree on whether that graduates it. See the amendment. |
| [ADR-003](./ADR-003-graph-data-discipline.md) | Graph data discipline | **Accepted. Amended 1 Oct 2026** — the fillable-content invariant recorded, and `ConnectionExperience` added as a distinct non-fillable type. Additive. |

**How to change one:** an ADR is amended by a new dated section at the bottom, or superseded by a new ADR that names it. Never edit the decision text of an accepted ADR in place — the history is the point.

---

## Standing rule 1 — Peru feature freeze

**Decided 24 September 2026. In force from 24 Sep until the Phase D checkpoint — which passed on 29 September 2026, so this freeze has EXPIRED by its own terms.** Kept for the record; it no longer blocks work on Peru.

The Peru pilot (Route Family #1) is **frozen for new features**. No new capability is added to it, no polish pass, no "while we're in there" additions.

**Allowed under the freeze:**

- **Correctness fixes.** A behaviour that is wrong is fixed, not queued.
- **Explicitly including bugs found while building the Phase B safety net.** A correctness bug surfaced by a new integration test is a correctness fix, not new capability, and is fixed immediately in the same cycle. This is how the 24 Sep Move bug was handled, and it does not need re-litigating mid-build.
- **Reviewed connection-data corrections**, where a source turns out to disagree with what is stored.
- **Changes Peru inherits automatically from a genuinely shared engine capability** built for another family, provided no Peru-specific feature, content, UI, route authoring or conditional code is added to take advantage of it.

**Not allowed:**

- New optional stops, new route alternatives, new Peru places or content beyond what exists.
- New edit operations, new UI affordances, or new statuses that only Peru exercises.
- Visual polish on `/plan`.

**Why:** Peru is the reference implementation. Every new Peru feature is another thing Eastern Canada has to generalize past, and another way to mistake "Peru works" for "the architecture works."

**When it lifts:** at the Phase D checkpoint, with evidence from Route Family #2.

---

## Standing rule 2 — Testing gate

**Decided 24 September 2026. Applies to every build brief from Phase B onward.**

> **A build brief for a user-facing feature is not returned as complete until a real user-flow integration test for that feature exists and passes.**

This is a completion gate, not a target. Specifically:

1. **"Real user-flow" means** the test renders the actual page or component **in a DOM environment** and drives it with user actions (click, type), then asserts on what the traveller would see and on the state that results. Unit tests on engine functions are necessary and do not satisfy this gate. **Note on the 24 Sep Move test (`tests/door2/moveUi.test.js`):** it bundles the real `StructureSheet` with esbuild and renders it to static markup, calling handlers directly. That is a valuable component-level check, but it cannot exercise page state (React hooks, storage, multi-step flows), so it does **not** by itself satisfy this gate for flows that depend on page state. Phase B adds a DOM harness for exactly that reason.
2. **The test is part of the same brief**, not a follow-up. A completion report that says "tests to follow" is an incomplete return.
3. **The live-browser check still happens.** Integration tests prove the intended user flow in the test environment; the live-browser check independently verifies that the published product behaves correctly in its deployed environment. Both are required. Neither replaces the other.
4. **Completion reports must name the test** — file and test name — for each user-facing behaviour in the brief's scope.

**Why:** two real bugs in the week of 22–24 Sep (the Remove dead-end and the Move no-op) got past 113 passing unit tests and were caught only by clicking through the live app. In the Move case, the integration test was written *after* the manual check found the bug. That ordering is what this rule inverts.

**Still to do (not yet done as of 28 Sep 2026):** add this gate to the brief template (§3) and the completion-report template (§4) of `claude/dev-workflow-guide-2026-09-18.md`.
