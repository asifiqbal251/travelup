# WhereNova — current state ledger

**Canonical, concise status record.** Source of truth for "where are we" once a session has repository access. The roadmap (master blueprint, current version in the Claude and ChatGPT projects) carries a dated snapshot generated from this file for chats that cannot read the repository. Where the two differ, this file is newer, or it is wrong and should be fixed.

## Rules for this file

- **Update at each event** — implementation, independent review, push, publication, hosted check — each as its own dated entry with its evidence. Do not wait for a later commit to sweep them up.
- **Never write a commit's own final hash inside that commit.** Record the source revision already known; read the current checkout HEAD from Git at session start.
- Keep reported results apart from checks someone actually ran. Write who ran what, and when.
- This file records state and decisions made elsewhere. It changes no gate, contract or approval. Gates and product choices keep their normal approval path.
- Routine evidenced updates do not need cross-model review. A changed gate, product decision or architecture decision does.

## Current state — 7 October 2026, after A6/A7, the push and the hosted checks

**Known application code revision:** `d8a809b` — direction B Stage 1 (`cb4982e`) plus the product amendments A1–A5 (independently approved by Codex at `bf2715d`) and the copy amendments A6 (`e1caecc`) and A7 (`d8a809b`) (checked by Claude chat, not by Codex). **Read current HEAD from Git**; do not rely on a SHA written here. Separate states, none of them implying another:

- **Implemented:** Stage 1 with A1–A7 (`6f7ce54`, `cb4982e`, `71373b9`, `b7e4beb`, `ecac7e2`, `bf2715d`, `e1caecc`, `d8a809b`).
- **Reviewed:** A1–A5 by Codex (approve at `bf2715d`). A6–A7 checked by Claude chat only; no Codex round, by design.
- **Pushed (owner-reported):** `e1caecc` and `d8a809b` are on GitHub `main`. Not verified from the sandbox; the owner's next push output will confirm it.
- **Published (owner-reported):** the owner published in Base44. Hosted Git SHA still not established.
- **Hosted-checked:** by Claude chat (read-only, desktop Chrome) and by the owner on a physical phone; see the 6–7 October events below. **The unlisted Stage 1 trial is in progress.** "Unlisted" is not private. The public entry buttons still go to `/find`.

**Active work:** direction B, Stage 1 of the public Door 2 replacement. Build brief B revision 3 was approved by the owner and Stage 1 implemented locally (`cb4982e`). Codex independently reviewed it and returned **approve with required amendments**; the amendments were then committed locally, and Codex reviewed `cb4982e..bf2715d` and returned **approve** (6 October). Since then the amendments were approved, A6–A7 added, and Stage 1 pushed, published and hosted-checked (events below). Earlier install and check rows below are retained as dated history.

| Item | State | Evidence |
|---|---|---|
| Final combined F6 | `61690bc`, 28 files, independently code-approved, pushed | Approval record 6 Oct (GPT-6 Astra · Extra High); Claude's independent review concurs, with finding R1 |
| Dependency update `cbad952` | Independently approved | Dependency review record 6 Oct |
| Publication | **R1 published and hosted-checked 6 Oct.** Owner republished; Claude ran the scoped hosted check in the owner's Chrome. Served bundle changed to `index-D8UGBwCA.js` (was `index-K9nINNo6.js`). **Hosted Git SHA still not established**; no authenticated deployment log. | `r1-hosted-check-2026-10-06.md` |
| Checks at `cbad952`, fresh locked install (history) | 598/598 Door 2 tests (132 are F6), 24/24 checker tests, lint, build | Run independently by the GPT reviewer and by Claude (cloud copy) on 6 Oct. **Mac dependencies:** Codex ran the full Door 2 suite on the Mac's newly installed dependencies in an isolated export of the checkout at `e86156c`: 598/598 (6 Oct). Lint, build and hosted checks not repeated there. |
| Mac checkout | Fast-forwarded to `cbad952` 6 Oct; `npm ci` completed (owner ran it). Nine untracked historical documents preserved. Both frozen fixtures byte-exact. | Claude (device shell) and owner (Terminal) |
| `npm ci` notes | Reported 22 audit findings, and three packages with install scripts not yet covered by the new `allowScripts` setting (core-js, esbuild, fsevents). Neither is reviewed or acted on. | Owner's Terminal output |
| Stage | S4 / Phase F, after the F6 release and the R1 fix; direction B Stage 1 (implemented locally, Codex-approved at `bf2715d`, not pushed) is the active work | |
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
- **6 Oct 2026 — Direction B Stage 1 implemented locally (`cb4982e`) and independently reviewed by Codex.** Result: approve with required amendments. Codex's core review of `cb4982e` remains applicable. Corrections to the Stage 1 packet: seven existing test files changed, not six (plus the shared harness and the new file); and "evidence guard before consent in every handler" was too broad — every pre-existing page-level `blockedStructure()` check still runs ahead of consent, while some nested handlers relied on their guarded entry sheet or the structural engine's own guard, which are unchanged. Codex found no newly permitted evidence operation and no activation of a held feature. Source: `codex-review-b-stage1-cb4982e-2026-10-06.md`.
- **6 Oct 2026, 21:58 PT — Owner approved the replacement copy** for the results footer and draft note, and the four implementation phrases (`decision-b-stage1-owner-approvals-2026-10-06.md` §7).
- **6 Oct 2026 — Stage 1 amendments A1 and A2 committed locally (`71373b9`); not pushed.** A1: the departure dialog now takes focus on open, contains Tab and Shift+Tab, closes on Escape, returns focus to the control used, and after "Yes" lands focus in the resulting sheet or page (local implementation; no new dependency or engine change). A2: the footer and draft note carry the owner-approved text; the draft flag, transport review status and planning behaviour are unchanged. Run by the writer on the Mac: Door 2 suite 652/652, checker tests 24/24, lint clean, build passes. Not yet reviewed independently.
- **6 Oct 2026 — Codex approved `bf2715d`.** Codex independently reviewed `cb4982e..bf2715d` and returned **approve** (`codex-review-b-stage1-amendments-bf2715d-2026-10-06.md`). It reproduced 653 planner tests, 24 checker tests, lint, build and both fixture hashes; confirmed the explicit boundary list diffs empty against `3812789`; and checked A1 with real keyboard events in a headless desktop Chrome production build. Limits: localhost only, stubbed settings, no hosted backend, no physical phone, no old browser, **no screen reader, and the background was not made inert**. Corrections recorded as facts:
  - The A1/A2/A5 additions are five A1 tests, one A2 test and one A5 test (646 → 652 → 653).
  - A repository dialog component exists at `src/components/ui/dialog.jsx`. A1 used a local implementation, which the brief allowed; suitability of the existing component was the writer's judgement, not a finding.
  - `/dev/door2?key=door2` loads the developer harness in a production build without sign-in. It is unlisted and query-key gated, **not access-protected**. Pre-existing at `3812789`; no product link to it; no change requested or authorized.
- **6–7 Oct 2026 — A6 and A7.**
  - **A6** `e1caecc` — `/plan` catalogue line "Pilot catalogue · …" replaced with "Early-access catalogue · a handful of places, built properly." One test added (654).
  - **A7** `d8a809b` — empty-search message replaced with "No matches in the early-access catalogue yet." One existing assertion updated (still 654).
  - Both found by Claude chat on the published app and by A6's search step; owner-approved. Checked by Claude chat against their briefs: 654 tests, 24 checker tests, lint, build, frozen fixtures byte-identical, boundary paths empty against `9fd1de5`.
  - **No Codex round**, by design: Codex stated a broad review was unnecessary unless application changes expanded scope. These are two public strings with no engine, storage, consent or dependency surface. They are not Codex-reviewed.
  - The remaining "pilot" mentions are internal only: comments in `src/lib/door2/pilotData.js`, test titles and comments in `contentSchema.test.js`, and the A2/A5 negative assertions in `flowBStage1.test.js`. `Door2Dev.jsx` keeps its developer-harness wording by owner decision.
- **7 Oct 2026 — Push.** Two pushes of `e1caecc` and `d8a809b` were rejected by GitHub with **Internal Server Error** at 16:57:53Z and 16:59:51Z (request IDs `F419:1CCF:66D58:7D852:6AC67A09`, `F44A:1E3FA7:200F85:2B3DC9:6AC67A80`). Before each retry, a fresh fetch showed `origin/main` unmoved at `9fd1de5`, two commits behind local. No force push was used. A later push succeeded (owner-reported), and the owner published in Base44.
- **6–7 Oct 2026 — Hosted checks (Stage 1 + A1–A7).** Two sources, kept separate.
  - **Claude chat, desktop Chrome, read-only, published app.** After the `9fd1de5` publish: header "WhereNova · Early access"; the approved limits text verbatim with route names; the "Go to the classic planner" link with "You'll need to enter your trip details again there."; `/dev/door2` with no key returns not-found; the landing page's "I know where I'm going" goes to `/find`. After the `d8a809b` publish: the A6 line is live and no "pilot" wording appears in the `/plan` page text. No clicks, saves or searches were made; this was the owner's own browser.
  - **Owner, physical phone, checklist `hosted-check-b-stage1-2026-10-06-rev2.md`.** **All rows pass** (owner-reported): page fit and scrolling, departure question unanswered by default, decline builds nothing and offers the classic planner, all four routes build, footer and draft-itinerary wording, before-save and after-save wording, save and reopen, refine with Yes and with No after a fresh load, the three landing buttons going to `/find`, the feedback link, and the signed-in checks.
  - **Observation, not a defect:** saved trips do not appear in a private/incognito window. Expected: saves live in the browser's own storage, a private window starts with none, and the approved wording says trips are saved only in this browser. A traveller using private browsing will lose a trip when the window closes.
  - **A7 on the hosted app: not separately confirmed**, because that message only appears after a search with no results.
  - **Not proven by anyone:** screen-reader behaviour (the departure dialog's background is not made inert), old browsers.

## Next

1. **Stage 2 brief:** handing trip details to the classic planner.
2. The unlisted Stage 1 trial continues. **Public entry buttons remain on `/find`.** The switch to `/plan` needs: Stage 2, the phone / save-and-reopen / fallback checks on Stage 2, **and resolution of the developer-harness item in `docs/PARKED.md`** (protect or remove `/dev/door2?key=door2`).
3. Then the next bounded convergence scope, including Q8 preparation if F7 is chosen.
4. Everything on the held list stays held.

## Where things live

Repo `github.com/asifiqbal251/travelup`, branch `main` · Base44 app `6a7ce8f29cef18f569162dc7` · public `wherenova.base44.app` · hidden Door 2 pilot `/plan?key=door2` · Door 2 approvals, releases and briefs in the Codex outputs folder and the Claude project.
