# WhereNova — current state ledger

**Canonical, concise status record.** Source of truth for "where are we" once a session has repository access. The roadmap (master blueprint, current version in the Claude and ChatGPT projects) carries a dated snapshot generated from this file for chats that cannot read the repository. Where the two differ, this file is newer, or it is wrong and should be fixed.

## Rules for this file

- **Update at each event** — implementation, independent review, push, publication, hosted check — each as its own dated entry with its evidence. Do not wait for a later commit to sweep them up.
- **Never write a commit's own final hash inside that commit.** Record the source revision already known; read the current checkout HEAD from Git at session start.
- Keep reported results apart from checks someone actually ran. Write who ran what, and when.
- This file records state and decisions made elsewhere. It changes no gate, contract or approval. Gates and product choices keep their normal approval path.
- Routine evidenced updates do not need cross-model review. A changed gate, product decision or architecture decision does.

## Current state — 6 October 2026, about 20:45 America/Vancouver

**Known application code revision:** `0e0c2d8` — the independently approved R1 session-ID fallback. Commits above it are documentation only. **Read current HEAD from Git**; do not rely on a SHA written here. At the last measurement (20:18, Claude and Codex independently) GitHub `main` and the Mac checkout were both `b6583bda492fa8a80050dd0cc13e38850f167fe1`, with nothing pending to push.

**Active work:** direction B, the public Door 2 replacement. The brief is at revision 2 with Codex's amendments applied; it awaits the owner's product text, future-saves policy, rollout choice and feedback destination before implementation. Earlier install and check rows below are retained as dated history.

| Item | State | Evidence |
|---|---|---|
| Final combined F6 | `61690bc`, 28 files, independently code-approved, pushed | Approval record 6 Oct (GPT-6 Astra · Extra High); Claude's independent review concurs, with finding R1 |
| Dependency update `cbad952` | Independently approved | Dependency review record 6 Oct |
| Publication | **R1 published and hosted-checked 6 Oct.** Owner republished; Claude ran the scoped hosted check in the owner's Chrome. Served bundle changed to `index-D8UGBwCA.js` (was `index-K9nINNo6.js`). **Hosted Git SHA still not established**; no authenticated deployment log. | `r1-hosted-check-2026-10-06.md` |
| Checks at `cbad952`, fresh locked install (history) | 598/598 Door 2 tests (132 are F6), 24/24 checker tests, lint, build | Run independently by the GPT reviewer and by Claude (cloud copy) on 6 Oct. **Mac dependencies:** Codex ran the full Door 2 suite on the Mac's newly installed dependencies in an isolated export of the checkout at `e86156c`: 598/598 (6 Oct). Lint, build and hosted checks not repeated there. |
| Mac checkout | Fast-forwarded to `cbad952` 6 Oct; `npm ci` completed (owner ran it). Nine untracked historical documents preserved. Both frozen fixtures byte-exact. | Claude (device shell) and owner (Terminal) |
| `npm ci` notes | Reported 22 audit findings, and three packages with install scripts not yet covered by the new `allowScripts` setting (core-js, esbuild, fsevents). Neither is reviewed or acted on. | Owner's Terminal output |
| Stage | S4 / Phase F, after the F6 release and the R1 fix; direction B scope preparation is the active work | |
| Contract | `TripSequence` provisional. The live planner does not run through the forward materialisation and assembly chain. | |

## Held — nothing here is authorized

Production estimate and experience activation · any record migration · Q8 durable identity (two triggers: F7 preparation, or an observed identity collision; six acceptance tests) · all six Q10 conditions · unresolved record decisions (records 8, 17, 27, 29, 33, 37, 47).

## Decisions recorded 6 October 2026 (owner)

- **Q9: ruled.** Old Door 2 saved trips need not be preserved, because the owner was the only person who saved any. Nothing is deleted; v5 stays refused and retained, v6 still opens. Does not cover trips saved from now on, or Door 1 account-saved trips.
- **R1 released.** Commit `0e0c2d8` (four files, +244/−1): `newSessionId()` with randomUUID, getRandomValues and clock/counter fallbacks. Checks: Claude 613/613, 24/24, lint, build, fixtures unchanged, new page tests fail before the fix and pass after. **Codex diff review approved, no required changes**, independently reproduced on the Mac plus eight forced-fallback runs. **Pushed** (`origin/main` `2944b0e`), **published** by the owner, **hosted-checked** by Claude: Peru 10 built as core route, save and reopen identical, Japan 10 built as Tokyo+Kyoto, and **R1 itself verified live** — Japan built with `randomUUID` removed and again with `crypto` removed entirely, where before the fix both refused. No console errors. Not done: physical old-browser test, hosted Git SHA. The check created one new saved draft ("Peru · 10 days · Oct 6, 2026") in the owner's browser; nothing was deleted.
- **Door 2 replaces the public "I know where I'm going" entry.** The owner wants the current Door 2 (`/plan`) to replace the Door 2 published publicly today (the older flow at `/find`). **Direction chosen: B**, the new planner as the main entry with the classic planner (`/find`) as fallback, with broader eligibility rules covering departure city, route and trip length, not just destination. Coverage is selected routes in four countries, not the countries comprehensively. A bounded replacement brief is still to be written after R1 is released; B is a direction, not a release specification. A policy for newly saved trips is required before broader release. See `decision-door2-replaces-find-2026-10-06.md` (revision 2). No code has changed.
- **This file created.**

## Open findings (Claude's independent F6 review, 6 Oct)

R1 **fixed and released** 6 Oct. R2–R4 dormant: preconditions for activating estimates and experiences. Details in the project note `f6-independent-review-61690bc-2026-10-06.md`.

## Events since the R1 release

- **6 Oct, hosted check sequence clarified.** For each crypto-removal check, the page was fully reloaded first, the override applied before any build in that page instance, and the first build of that instance then allocated a fresh session identifier under the override. Native `randomUUID` was confirmed restored afterwards. It remains a feature-removal simulation, not a physical old-browser test.
- **6 Oct, Codex consolidated review.** Direction B and its two-stage design accepted; a finite amendment list applied to the brief (revision 2). R1's code approval remains closed. Roadmap corrected to v1.5.
- **6 Oct 2026 — Owner decisions for direction B, Stage 1 product choices (recorded by Claude from the owner's chat message, 20:51 PT).**
  - (a) Limits text, departure question and declined-departure copy approved as proposed in build brief B §8; the departure question starts unanswered. Save copy approved with the before-save text "When you save, your trip stays in this browser on this device. These trips do not sync to your account." and the after-save text "Saved in this browser on this device. These trips do not sync to your account."
  - (b) Future-saves policy approved: keep compatible saved trips usable; if one cannot open, retain its information and explain; never silently delete it or rebuild it into a different trip. Q9 unchanged. No migration authorized.
  - (c) Rollout order approved: unlisted Stage 1 trial → Stage 2 handoff → public-button switch after the phone, save-and-reopen and fallback checks pass. Push and publication remain owner-controlled.
  - (d) Feedback: a "Send feedback" email link to backstage.innovators@gmail.com, monitored by the owner initially.
  - Build brief B is now revision 3. Nothing implemented, pushed, published or activated by this event.
  - Source: `decision-b-stage1-owner-approvals-2026-10-06.md` §6. No decision numbers are assigned here: this file carries no numbered ledger, and the writer did not invent any.

## Next

1. B's bounded replacement brief (written 6 Oct, awaiting independent review), then build, representative-journey checks, owner-controlled rollout.
2. Then the next bounded convergence scope, including Q8 preparation if F7 is chosen.

## Where things live

Repo `github.com/asifiqbal251/travelup`, branch `main` · Base44 app `6a7ce8f29cef18f569162dc7` · public `wherenova.base44.app` · hidden Door 2 pilot `/plan?key=door2` · Door 2 approvals, releases and briefs in the Codex outputs folder and the Claude project.
