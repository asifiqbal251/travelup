# WhereNova — current state ledger

**Canonical, concise status record.** Source of truth for "where are we" once a session has repository access. The roadmap (master blueprint, current version in the Claude and ChatGPT projects) carries a dated snapshot generated from this file for chats that cannot read the repository. Where the two differ, this file is newer, or it is wrong and should be fixed.

## Rules for this file

- **Update at each event** — implementation, independent review, push, publication, hosted check — each as its own dated entry with its evidence. Do not wait for a later commit to sweep them up.
- **Never write a commit's own final hash inside that commit.** Record the source revision already known; read the current checkout HEAD from Git at session start.
- Keep reported results apart from checks someone actually ran. Write who ran what, and when.
- This file records state and decisions made elsewhere. It changes no gate, contract or approval. Gates and product choices keep their normal approval path.
- Routine evidenced updates do not need cross-model review. A changed gate, product decision or architecture decision does.

## Current state — 6 October 2026, about 19:30 America/Vancouver

**Source revision recorded here:** `cbad952f0715cb158866effc511e7ced5751c1b9` — "Update base44 packages" (Base44 bot; `package.json` and `package-lock.json` only), direct child of `61690bc775d450ee78382f506281dcf89c731630`. Read current HEAD from Git; it will be one commit later than this once this file is committed.

| Item | State | Evidence |
|---|---|---|
| Final combined F6 | `61690bc`, 28 files, independently code-approved, pushed | Approval record 6 Oct (GPT-6 Astra · Extra High); Claude's independent review concurs, with finding R1 |
| Dependency update `cbad952` | Independently approved | Dependency review record 6 Oct |
| Publication | **Owner reported republication.** Builder recorded passing scoped hosted checks. **Hosted Git SHA not established.** | Release record 6 Oct |
| Checks at `cbad952`, fresh locked install | 598/598 Door 2 tests (132 are F6), 24/24 checker tests, lint, build | Run independently by the GPT reviewer and by Claude (cloud copy) on 6 Oct. Not yet run on the Mac after the dependency update. |
| Mac checkout | Fast-forwarded to `cbad952` 6 Oct; `npm ci` completed (owner ran it). Nine untracked historical documents preserved. Both frozen fixtures byte-exact. | Claude (device shell) and owner (Terminal) |
| `npm ci` notes | Reported 22 audit findings, and three packages with install scripts not yet covered by the new `allowScripts` setting (core-js, esbuild, fsevents). Neither is reviewed or acted on. | Owner's Terminal output |
| Stage | S4 / Phase F, after the reviewed F6 release | |
| Contract | `TripSequence` provisional. The live planner does not run through the forward materialisation and assembly chain. | |

## Held — nothing here is authorized

Production estimate and experience activation · any record migration · Q8 durable identity (two triggers: F7 preparation, or an observed identity collision; six acceptance tests) · all six Q10 conditions · unresolved record decisions (records 8, 17, 27, 29, 33, 37, 47).

## Decisions recorded 6 October 2026 (owner)

- **Q9: ruled.** Old Door 2 saved trips need not be preserved, because the owner was the only person who saved any. Nothing is deleted; v5 stays refused and retained, v6 still opens. Does not cover trips saved from now on, or Door 1 account-saved trips.
- **Fix R1 approved in scope.** Session-ID fallback in the planner page. Brief is drafted and awaits independent review. No code written.
- **Door 2 replaces the public "I know where I'm going" entry.** The owner wants the current Door 2 (`/plan`) to replace the Door 2 published publicly today (the older flow at `/find`). **Scope and coverage consequences are not yet decided**; see the decision note in the Claude project, `decision-door2-replaces-find-2026-10-06.md`. No code has changed.
- **This file created.**

## Open findings (Claude's independent F6 review, 6 Oct)

R1 live, small: planner refuses every request on browsers without `crypto.randomUUID`. R2–R4 dormant: preconditions for activating estimates and experiences. Details in the project note `f6-independent-review-61690bc-2026-10-06.md`.

## Next

1. Run the Door 2 test suite on the Mac against the updated dependencies (expect 598/598).
2. Independent review of the R1 brief, then build, review, push, publish, scoped hosted check.
3. Owner to settle the coverage question for the Door 2 replacement (what a visitor sees for a destination Door 2 does not cover).
4. Then the next bounded convergence scope, including Q8 preparation if F7 is chosen.

## Where things live

Repo `github.com/asifiqbal251/travelup`, branch `main` · Base44 app `6a7ce8f29cef18f569162dc7` · public `wherenova.base44.app` · hidden Door 2 pilot `/plan?key=door2` · Door 2 approvals, releases and briefs in the Codex outputs folder and the Claude project.
