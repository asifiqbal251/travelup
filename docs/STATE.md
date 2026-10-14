# WhereNova — current state ledger

**Canonical, concise status record.** Source of truth for "where are we" once a session has repository access. The roadmap (master blueprint, current version in the Claude and ChatGPT projects) carries a dated snapshot generated from this file for chats that cannot read the repository. Where the two differ, this file is newer, or it is wrong and should be fixed.

## Rules for this file

- **Update at each event** — implementation, independent review, push, publication, hosted check — each as its own dated entry with its evidence. Do not wait for a later commit to sweep them up.
- **Never write a commit's own final hash inside that commit.** Record the source revision already known; read the current checkout HEAD from Git at session start.
- Keep reported results apart from checks someone actually ran. Write who ran what, and when.
- This file records state and decisions made elsewhere. It changes no gate, contract or approval. Gates and product choices keep their normal approval path.
- Routine evidenced updates do not need cross-model review. A changed gate, product decision or architecture decision does.

## Current snapshot — 13 October 2026, evening

**This is the live summary. Everything below it is dated history, kept as evidence and not rewritten.** Read current HEAD from Git rather than trusting any SHA written here.

| | |
|---|---|
| **GitHub `main`** | `3c11c52`, a Base44-bot commit of 13 October (one line in `package.json` and its lockfile: `@base44/vite-plugin` 1.0.44 → 1.0.45), directly on `b8fff25`. **Not independently reviewed, and not part of any release record below.** Read from GitHub by Claude on 13 October |
| **Application code** | `b8fff25` — the direct-arrival Combine duration fix, tree `b63a2c11…`, byte-identical to the Codex-approved `5ab7894` tree, directly on `37cb366` (the Stage 3 acceptance records). The Stage 3 code `be34e5e` is the release before it |
| **Mac checkout** | Not read by Claude since 8 October. The owner's Terminal output on applying the patch showed the matching tree; the nine untracked historical documents were expected to remain |
| **Public entry** | all three "I know where I'm going" links open `/plan`; `/find` remains available as the explained fallback |
| **Checks at the `b8fff25` tree** | 753 Door 2 tests (748 before, 5 new), lint clean, build succeeds, frozen fixtures byte-exact — run by Claude, reproduced by Codex. Not re-run after the bot commit |
| **Stage 3 release** | accepted 8 October (owner-reported signed-out run). See the Stage 3 section |
| **Direct-arrival duration fix** | implemented, independently approved, pushed, published, hosted-checked and **accepted on the owner's signed-out private-window run (owner-reported, 13 October)**. Most signed-out rows are a single owner statement without values; see the section below for what is evidenced and what is not |
| **Hosted revision identity** | **ESTABLISHED, 13 October — the first time in this project.** The live app is built from **`b8fff25`**, published **9 October 2026 at 18:27:58 UTC (11:27 Vancouver)**. Read by Claude from Base44's checkpoint list, which carries `git_commit_hash` and `last_deployed_at` per checkpoint. **The full deploy history back to 6 October is recovered** — see the section below. **The bot commit `3c11c52` is NOT in the live build**, which answers the question this row previously left open |
| **D16 — F7 preparation** | **DESIGN PACKET APPROVED BY THE OWNER, 13 October**, at revision 6, after four independent review rounds. **This authorizes an implementation brief and nothing else:** no record write, no migration, no engine switch, no flag flip, no activation. Q8 and all six Q10 conditions stay unmet. D15 is closed |
| **Held** | production estimate and experience activation · any record migration · Q8 durable identity · all Q10 conditions |

## Historical — current state as recorded on 7 October 2026, after A6/A7, the push and the hosted checks

*Superseded by the snapshot above and by the dated sections that follow. Retained because it is the record of that day, not because it is current.*

**Known application code revision at that date:** `d8a809b` — direction B Stage 1 (`cb4982e`) plus the product amendments A1–A5 (independently approved by Codex at `bf2715d`) and the copy amendments A6 (`e1caecc`) and A7 (`d8a809b`) (checked by Claude chat, not by Codex). **Read current HEAD from Git**; do not rely on a SHA written here. Separate states, none of them implying another:

- **Implemented:** Stage 1 with A1–A7 (`6f7ce54`, `cb4982e`, `71373b9`, `b7e4beb`, `ecac7e2`, `bf2715d`, `e1caecc`, `d8a809b`).
- **Reviewed:** A1–A5 by Codex (approve at `bf2715d`). A6–A7 checked by Claude chat only; no Codex round, by design.
- **Pushed (owner-reported):** `e1caecc` and `d8a809b` are on GitHub `main`. Not verified from the sandbox; the owner's next push output will confirm it.
- **Published (owner-reported):** the owner published in Base44. Hosted Git SHA still not established.
- **Hosted-checked:** by Claude chat (read-only, desktop Chrome) and by the owner on a physical phone; see the 6–7 October events below. **The unlisted Stage 1 trial is in progress.** "Unlisted" is not private. The public entry buttons still went to `/find` at that date. *(Superseded 8 October: the three entry links now go to `/plan` — see "Direction B Stage 3" below.)*

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

## Direction B Stage 2 — released 7 October 2026

**Carrying the traveller's basic answers from `/plan` into the classic planner `/find`.** Pushed and published; desktop hosted checks pass; **physical-phone section B passed (owner-reported, 7 Oct 2026).**

### What is live

- **Commit `f1535f1`** on `origin/main`, directly on top of `988a242`. Its tree is `d79b660af8849c6ca529a92f0b571cebdbd60b92` — **byte-identical to the Codex-approved tree**, verified by fetching `origin/main` after the push. The approval was issued against local commit `b5e700c`; `git am` re-dated it, which is why the id differs and the tree does not.
- Eight files: `classicHandoff.js` (new), `Door2Plan.jsx`, `DoorB.jsx`, `DestinationSearch.jsx`, `DayScroller.jsx`, and three test files. No protected file, no engine, no storage implementation, no dependency, and none of the three public `/find` links changed.
- Checks at that tree: **726 Door 2 tests**, checker 111 verified / 0 failed, lint, build, both frozen fixtures byte-identical.
- Published on Base44 by the owner the same evening. **Base44's `last_deployed_git_commit_hash` was not read by Claude** — build identity was established functionally instead (below), which is the stronger evidence. The owner can still confirm that field.

### Review history — three rounds, three real defects

1. **`198766e`** — Codex found two: a changed Combine length was replaced by the incoming value on the page's Back button, and a chosen length reached the route but not `prefs.travelDays`.
2. **`107d68e`** — Codex found two more: after switching between the single-destination and Combine paths the build could take the other path's length, and a global explicit-choice flag made one path's choice confirm the other path's untouched default.
3. **`b5e700c`** — approved. The fix is structural rather than patched: each path keeps its own current length, gate and label, and the build reads the length of the path it is building, so the route and the stored preferences cannot disagree. Codex ran eight independent probes including a region-step journey and a capped-catalogue case.

### Hosted checks — desktop, by Claude in the owner's Chrome, on the published app

Checklist `hosted-check-b-stage2-2026-10-07.md` revision 4. **Build identity was established functionally, not from the `route=peru` marker**, which also exists in the rejected `198766e`.

| Row | Result |
|---|---|
| A1 limits-block link, empty search | PASS — plain `/find`, no second sentence |
| A2 / A3 typed text | PASS — both the limits-block and miss-message links carry `dest_q=Reykjavik` with "We'll take what you typed with you." |
| A4 / A7 Eastern Canada exit | PASS — `dest_q=Canada`, `route=eastern-canada`, `month=10`, `days=10`, `party=two`, with the approved declined-departure sentence |
| A5 route arrival | PASS — "Your full route hasn't been transferred…" and **not** the search sentence; Peru's 3 records and Combine offered; nothing selected |
| A6 essentials after selecting | PASS — October, 10 days, Two of us already set; **no "— suggested"** |
| A8 unrecognised `route=japan` | PASS — falls back to the search sentence, everything else still carried |
| A9 `month=13&days=7.5&party=bogus` | PASS — month and party blank, 7 "— suggested", search text kept, no error page |
| A10 direct `/find` | PASS — no notice, no reset control |
| A11 Clear carried details | PASS — box empty, notice and control gone, **all 9 of the owner's saved Door 2 drafts untouched** |
| A12 reload after clearing | **Behaves as designed — carried details return. Accepted by the owner, 7 Oct 2026** |
| A13 page Back | PASS — empty search box, no notice, carried text not re-applied |
| A14 browser Back | **Recorded:** Chrome **restored the existing page** (back/forward cache) rather than remounting — React step state was preserved and the address was not re-read |
| A15 built Japan 10 → Refine 19 | PASS — `days_req=19`, no `days`, correct sentence, **with** the itinerary disclosure |
| A16 Japan 19 as a first build | PASS — same href and sentence, **without** the disclosure. The two cases are correctly separated |
| A17 gate | PASS — Build inert with the 19-day notice; after choosing 9, built a 9-day trip |
| A18 Combine with carried 10 | PASS — 10 selected, not "suggested" |
| A19 change to 12, Continue, page Back | PASS — **12 retained** (the original `198766e` defect) |
| A20 build it | PASS — preferences 12, legs 12, "A suggested 12-day plan" |
| **A20a** single destination 12 → Combine at its own 10 → build | **PASS — preferences 10, legs 10, 10-day trip.** The rejected build stored 12 |
| **A20b** Combine 9 → single destination 11 → Combine again → build with no further tap | **PASS — preferences 9, legs 9, 9-day trip.** The rejected build stored 11 |
| **A20c** choose 8 on one path, enter Combine first time | **PASS — Combine shows its own 7, labelled "— suggested", gate still closed.** The rejected build dropped the label |
| A21 fault rebuild retaining the trip | **NOT RUN** (owner confirmed 7 Oct) — could not be provoked deliberately on the hosted app |
| A22 unsupported-origin restored trip (E8) | **NOT RUN** (owner confirmed 7 Oct) — all nine saved drafts are Vancouver trips, so the notice cannot appear. Producing it means seeding a fabricated non-Vancouver saved trip into the owner's browser, which was not done without asking |
| A23 three public buttons | PASS — hero, footer and questionnaire links are all plain `/find` |

**A20a, A20b and A20c are the rows that prove the approved build is live.** All three pass.

### Catalogue — section C

- **C1 New York City** — id `6a7e984900175cfc5fe2005a`, country United States, type `single_base`. Under the app's own matching rules the search text "New York City" matches **exactly one** record.
- **C2 Tokyo & Kyoto, Japan** — id `6a7ced35c41497521b54e0bc`, country Japan, type `multi_stop`. "Tokyo" matches **exactly one** record.
- **C3** — 64 destination records on 7 October 2026.
- **C4 / C5** — PASS. "Peru" offers 3 records plus Combine; "Canada" offers 6 plus Combine; both pinnable names reach a usable record by hand.

**This satisfies brief §11's condition for pinning the two `dest_id` values, but nothing was pinned.** `VERIFIED_CLASSIC_DESTINATION_IDS` still holds `null` for both, outgoing links still carry search text only, and pinning remains a separate brief, review and hosted re-check.

### Not proven by anyone

- **Section B — the physical phone — passed, owner-reported (7 Oct 2026, evening).** The owner first reported "works fine so far", then later that evening reported all of section B complete and passed. **The report was a single statement: no per-row list and no handset name were given**, so the record holds "section B passed, owner-reported" and not row-level detail. Browser automation cannot substitute for a handset, and none was used by Claude.
- A21 and A22, as above — not run, and the owner has agreed they stay not run.
- Screen-reader behaviour and old browsers, unchanged from Stage 1.

### Owner's judgement

- **A12 — accepted (7 Oct 2026).** A reload restores the carried details after "Clear carried details". By design: nothing about the handoff is persisted, so the page cannot remember that it was dismissed.
- **A22 — no judgement possible.** Not run: the owner has no saved trip departing from a non-Vancouver city. The departure sentence is shared between the declined-departure case and the unsupported-origin notice; it reads correctly in the declined case, and nobody has read it in place on the other.

### Side effect of the desktop checks

Claude built several test trips in the owner's own Chrome. `travelup_state_v1` now holds the last of them (a 12-day Peru multi-stop: `prefs`, `prefsHistory`, `selectedDestinationId`, `multiStopLegs`, `packingByTrip`). **Nothing was saved to the account and nothing was deleted** — the nine Door 2 drafts are intact. Building any new trip overwrites this state.

### Still held after this release

- **The public buttons stay on `/find`.** *(Written 7 October; superseded 8 October — see "Direction B Stage 3" below.)* Stage 2 completing does not authorize the switch; the parked developer-harness item (`/dev/door2?key=door2`) must be resolved first.
- **The direct-arrival preferences defect is parked, not fixed.** On a direct, parameter-free `/find` arrival the Combine path's duration still does not reach `prefs.travelDays`. Codex accepted parking it and explicitly did not call it correct. Its own brief and review when wanted. *(Written 7 October; fixed and released — see "Direct-arrival Combine duration fix" below.)*
- One behavioural change does reach direct arrivals: a chosen Combine length and its label now survive the page's Back button, where the old step reset them. Recorded rather than claimed as identity.
- Everything on the held list above stays held.

## Developer harness closed on the published app — released 7 October 2026

**The Door 2 developer harness is development-builds-only. Pushed, published and hosted-verified. The `docs/PARKED.md` item is resolved, and with it the last named blocker on switching the public entry buttons.** The buttons themselves had **not** moved at that point and still went to `/find`; moving them was a separate owner decision, made and released on 8 October (see "Direction B Stage 3" below).

### What is live

- **Commit `2816ece`** on `origin/main`, directly on top of `db403cb`. Its tree is `a876b91b50fd19da2cd3a26f8bf9f80888f41ca3` — **byte-identical to the Codex-approved tree**, verified from the sandbox by fetching `origin/main` after the owner's push, and by a `git diff` against the reviewed commit returning empty. The approval was issued against local commit `78a2d41`; `git am` re-dated it on the owner's Mac, which is why the id differs and the tree does not.
- **Two files:** `src/App.jsx` (+10/−2) and the new `tests/door2/devHarnessGate.test.js`. Everything else byte-identical to the base, including `Door2Dev.jsx` itself, `Door2Plan.jsx`, `DoorB.jsx`, `Landing.jsx`, all of `src/lib/**`, all of `src/components/**`, `vite.config.js`, `package.json` and the lockfile. No new dependency.
- **The change.** The static harness import is gone. A module-scope gate — the development flag **and** a non-production mode — decides whether a lazy import of the harness exists at all, and the route is registered only when it does. A production build therefore contains neither the harness module nor its "Not for real travellers" wording. The development server is unchanged apart from a brief blank interval on first open while the module loads.
- **Why two conditions, not one.** The development flag follows NODE_ENV. Measured: an ordinary build with NODE_ENV=development merely present in its environment **shipped the harness** under a one-flag gate. Passing a mode argument alone changed nothing. The two-condition gate excludes that case.
- Checks at that tree: **734 Door 2 tests** (726 before, 8 new), lint clean, build succeeds, both frozen fixtures byte-identical.
- Published on Base44 by the owner the same evening, shortly before 23:09 America/Vancouver. **The owner did not report the exact publish timestamp or Base44's `last_deployed_git_commit_hash`**, so hosted revision identity rests on the functional checks below rather than on a deployment record.

### Review history

Brief draft 1 → Codex **amend** (four required amendments: the hosted-failure diagnosis, a self-contradictory test rule, deterministic build environments, and the overstated name "local-only"). Draft 2 adopted all four, and chasing the third produced the finding above, which **changed the design** from one condition to two and added test T4. Codex **approved** draft 2's design with three editorial corrections; revision 3 made them. The patch was then independently diff-reviewed and **approved at the exact tree**, with no code amendment required.

Codex independently reproduced: the patch hash and resulting tree, 726 tests before and 734 after, lint, the production build, the rendered development and production behaviour, and the mutation checks.

### Verification

**Local, by Claude (sandbox), reproduced by Codex in its own isolated clone:**

| Check | Result |
|---|---|
| Door 2 suite at the base, before the change | 726 pass, 0 fail — re-run, not taken from this file |
| Door 2 suite at the commit | **734 pass, 0 fail**; suite runtime grew about 22 seconds (three real builds) |
| Lint, production build | clean; one JS bundle, harness wording absent (the base shipped it) |
| Frozen fixtures | `88ebac17…e91e5d` and `d3f97744…b8491d` unchanged |
| Rendered, development server, headless Chromium | `/dev/door2?key=door2` renders the harness and its warning; `/dev/door2` renders not-found |
| Rendered, production preview, headless Chromium | **both** harness addresses render the ordinary not-found page **inside the site layout**; `/plan`, `/` render normally |

**The new tests were shown able to fail.** Each protection was removed in turn and the right tests failed, in both Claude's and Codex's runs:

| Mutation | Failed | Still passed |
|---|---|---|
| Gate reduced to the development flag alone | the gate test **and T4** | the production-build test |
| Static import restored, route still conditional | the import tests, the production-build test, T4 | the positive control |
| Route made unconditional | the route-structure test | the three build tests |

The first row is the point of T4: a production build passes under a one-flag gate, so only T4 distinguishes the two designs.

**Hosted, after publication — H1–H3 of the approved brief:**

| Row | Owner, signed out, private window | Claude, in the owner's Chrome (signed in; supporting evidence only) |
|---|---|---|
| H1 `/dev/door2?key=door2` | **PASS** (owner-reported) | **PASS** — "404 Page Not Found … The page \"dev/door2\" could not be found", no harness wording |
| H2 `/dev/door2` | **PASS** (owner-reported) | **PASS** — same not-found page |
| H3 `/plan?key=door2`, `/find`, `/` | **PASS** (owner-reported) | **PASS** — `/plan` shows the early-access catalogue and the owner's three saved trips; `/find` loads its destination screen; the landing page renders with both entry buttons |

**The owner's signed-out private-window check is the acceptance record.** Claude's pass is a second observation in a signed-in browser, not a repeat of it. Neither establishes the hosted source revision; that remains inferred from the pushed tree plus these functional results.

### Honest limits of this release

- **This is not authentication.** A build with NODE_ENV=development **and a custom non-production mode** would still include the harness, and nothing here confines a development server to one machine. Recorded and accepted; the published app was the exposure that mattered.
- **No deployment record.** Base44's publish timestamp and deployed commit hash were not read, so hosted revision identity is inferred, not established.
- **The source tests pin this implementation closely**, including the exact gate text. Codex accepted that for this boundary; an equivalent future refactor will need the tests changed with it.
- `/find`'s destination list could not load in Claude's sandbox. A build of the **unmodified base** showed the identical message there, so it is the sandbox and not this change; the live `/find` loads normally. The underlying sandbox cause was not diagnosed.

## Direction B Stage 3 — public entry links switched to the new planner — released 8 October 2026

**The three "I know where I'm going" entry links now open the new planner at `/plan`. Pushed, published, hosted-checked.** The owner decided on 8 October (D15, option 1) to make the new planner the main starting point for Door 2 now, given very few users, while it continues to improve. The classic planner at `/find` stays available, including existing links and bookmarks, and remains the explained fallback.

### What is live

- **Commit `be34e5e`** on `origin/main`, directly on top of `4db146c`. Its tree is `d0be1d960cd608db62dd9418318c43d9e0d4563d` — **byte-identical to the Codex-approved tree**, verified from the sandbox by fetching `origin/main` after the owner's push. The approval was issued against local commit `140b45d`; `git am` re-dated it on the owner's Mac, which is why the id differs and the tree does not. Patch v2, sha256 `59a43669cb0402227fcde9b506e57e2a201a2640df33a81cd64c02a8c34eb834`.
- **Four files:** `src/pages/Landing.jsx` (+1/−1), `src/components/LandingHeroSlideshow.jsx` (+1/−1), `src/components/questionnaire/QuestionView.jsx` (+2/−2), and the new `tests/door2/publicEntryLinks.test.js`. Everything else byte-identical to the base, including `App.jsx`, `Door2Plan.jsx`, `classicHandoff.js` and all of `src/lib/**` (so `scoring.js`, `practicality.js`, `itinerary.js` and `questionnaireFlow.js` are untouched). No new dependency.
- **The change.** Landing's final-CTA entry link and the hero entry link now target `/plan`. The questionnaire's existing shortcut now reads "Already know where you're going? **Go to the planner →**" and targets `/plan` (it said "Skip straight to the dates →" and targeted `/find`, which was never accurate: the classic planner opens on destination search). The two "I know where I'm going" button labels and both "Find my Travel Fit" buttons are unchanged.
- Checks at that tree: **748 Door 2 tests** (734 before, 14 new), lint clean, build succeeds, both frozen fixtures byte-identical.
- Published on Base44 by the owner on 8 October. **The owner did not report the publish timestamp or Base44's `last_deployed_git_commit_hash`**, so hosted revision identity rests on the functional checks below, not a deployment record.

### Review history

Brief draft 1 → Codex **amend** (five corrections: preservation tests need their own mutation checks; a hosted failure does not prove the wrong build; the classic planner opens on destination search; rollback reverts the whole commit and does not undo saved trips; Travel Fit completion and output parity must be separated). Revision 2 → Codex **approve**, with one small A9b wording correction made in revision 3. The owner chose the wording "Go to the planner →", kept both button labels, and had all three links switch together. The first patch (`4f1aaf7`) → Codex diff review **amend** (T1 counted links instead of identifying the intended button, so swapping the hero's two targets passed; T5 used inclusion, so appended words passed; Travel Fit completion had no acceptance route → hosted H8; a claim about computed targets was withdrawn). The v2 patch (`140b45d`) → Codex diff review **approve**, with one non-blocking wording correction (T1 requires literal targets on the five named controls; T2 detects literal `/find` targets elsewhere and does not evaluate computed destinations).

Codex independently reproduced the patch hash and resulting tree, 748 tests, lint, build, 21/0/9 on the brief checker, **all twelve mutations failing as listed**, and 9 failing / 5 passing against the base app files (the five passes being the preservation checks).

### Local verification — what it did and did not cover

- Acceptance examples A1–A8c: **pass** against a real production build in headless Chromium, zero uncaught page errors; Codex additionally built, saved and reopened a Peru trip through Continue.
- **A9a (Travel Fit completion): partial locally** — the shortlist cannot render without the Base44 backend; carried to hosted H8 below. **A9b (output parity): not run** — no pinned catalogue snapshot, no comparison, **no parity claim**. The boundary diff (every file under `src/lib` byte-identical; `QuestionView.jsx` differs only in the shortcut's target and label) is unchanged-source evidence, not an executed output comparison.

### Hosted checks — 8 October 2026

Checklist: brief §8 / review packet v2, rows H1–H8. Record: `hosted-check-b-stage3-2026-10-08.md` in the Claude project.

| Row | Result |
|---|---|
| H1 landing entry link | **PASS** (Claude, in the owner's Chrome) — `href="/plan"`; click lands on `/plan` with the limits block |
| H2 hero entry link | **PASS** (Claude) — same |
| H3 questionnaire shortcut | **PASS** (Claude) — approved wording, `href="/plan"`, lands on `/plan`; retired wording absent |
| H4 direct `/find` | **PASS** (Claude) — classic destination screen, no carried-details notice |
| H5 `/plan` miss → fallback | **PASS** (Claude) — typed "Bali"; fallback link opened `/find?dest_q=Bali` with the carried notice and Bali offered |
| H6 Travel Fit button | **PASS** (Claude) — opens the questionnaire at step 1 of 9 |
| H7 physical phone | **PASS — owner-reported.** A single statement ("H7 worked"); no per-row list and no handset name were given, so the record holds "H7 passed, owner-reported", not row-level detail |
| H8 Travel Fit completed against the live catalogue | **PASS** (Claude) — answers recorded first (Vancouver, 8 days, May, a couple, Food/Cities/History, Mild, Balanced, Moderate, budget 65; read back from stored preferences), then top 3: Mexico City 87, New York City 80, Montréal and Québec City 71; score breakdown visible; "View my trip" opened a full 8-day Mexico City itinerary. Nothing saved |

**Acceptance — 8 October, evening.** The approved brief §7.2 makes the owner's signed-out, private-window run the acceptance record. The owner ran it on the published app and reported "all works fine" for the signed-out check. That is a **single owner statement with no per-row detail**: it is recorded as "the signed-out run passed, owner-reported", not as seven separately observed rows. Together with Claude's signed-in rows (H1–H6, H8) and the owner's phone pass (H7), the acceptance condition in §7.2 is met, and Stage 3 is recorded as **accepted**.

History, kept because it was corrected once: Claude first recorded these rows as accepted on the signed-in run alone; an independent review pointed out that §7.2 requires the signed-out run, and the status was changed to "released, acceptance pending" until the owner's run was reported.

What the signed-in run could not show, and the owner's run now covers: with stored preferences present the landing page renders its returning-traveller strip, so a first-time visitor sees a different page from the one Claude checked. The three entry links are the same elements either way.

**A9b (exact output parity) is separately allowed to stay not run** and is not equivalent to the signed-out acceptance check. One is an optional comparison nobody required; the other was the agreed acceptance gate, now met.

### Side effect of the hosted checks

Running H8 in the owner's Chrome **overwrote the stored Travel Fit preferences** in that browser (previously October, 10 days, a couple) and added an entry to the preference history. No trip was saved or deleted; the three saved trips (Japan, Canada, Peru) were untouched. A stray click on the Base44 "Built with Base44" badge opened its promo modal; it was closed and nothing was cloned.

### Honest limits of this release

- **No deployment record.** Base44's publish timestamp and deployed commit hash were not read; hosted revision identity is inferred from the pushed tree plus the functional results.
- **Source-structure tests do not evaluate computed destinations** (see review history); rendered and hosted checks cover real navigation.
- **Accessibility unchanged and unproven.** No screen reader; the departure dialog's background is still not made inert.
- **Stage 2's A21 and A22 stay not run**, by agreement.
- The new planner's limits (selected routes from Vancouver, trips saved only in this browser) and its fallback to the classic planner are as released in Stages 1–2; this release changes where the three links go, not those limits.

## Direct-arrival Combine duration fix — released by 9 October, accepted 13 October 2026

**On the classic planner, the length a traveller chooses on the Combine control now reaches the stored preferences, and so the saved-trip label and snapshot, when they arrive directly at `/find` as well as through a handoff.** Before, a parameter-free arrival that combined two destinations stored the single-destination default (7), so a trip combined at 10 days could be saved with a "7-day trip" label. Pushed, published, hosted-checked; acceptance rests on the owner's signed-out private-window run, which is a mostly single-statement report (see below).

### What is live

- **Commit `b8fff253cae127567e51648fd70834ab3ede803b`** on `origin/main`, directly on `37cb366`. Its tree is `b63a2c11b8df639f5a0b62117359e4745ae3eba6` — **byte-identical to the Codex-approved tree**, read from GitHub by Claude on 13 October (the commit and tree ids matched). The approval was issued against local commit `5ab7894`; `git am` re-dated it on the owner's Mac (23:31, 8 October), which is why the id differs and the tree does not. Patch sha256 `e20dae49366b7dc4f395e9e5e81c71168f8a2632aaa213a9c41f14efa415d5fb`.
- **Two files:** `src/pages/DoorB.jsx` (+7/−5, one expression and its comment) and `tests/door2/flowBStage2Arrival.test.js` (+98). Everything else byte-identical to the base, including the four protected files, every engine and storage module, the dependencies and the frozen fixtures.
- **The change.** `buildAndGo` now always hands `activeTravelDays()` to the preferences builder. When combining, that is the Combine control's displayed value, **including an untouched default of 7**; for a single destination it is `answers.travelDays`, so that path is value-identical to before. The owner approved this reading (brief revision 3, §4.1). Handoff behaviour, route fitting, itinerary generation, the storage format and already-saved trips are unchanged.
- Checks at that tree: **753 Door 2 tests** (748 before, 5 new, no existing test edited), lint clean, build succeeds, both frozen fixtures byte-identical.
- **Published on Base44 on 9 October 2026 at 18:27:58 UTC — 11:27 America/Vancouver.** Checkpoint `6ac9321987c59fc2cc3ea34c`, `git_commit_hash` `b8fff253cae127567e51648fd70834ab3ede803b`. **Read directly from Base44 on 13 October**, so this release's hosted identity is established rather than inferred. It is the most recent deployment: no checkpoint created after it carries one.

### Review history

Brief draft 1 → Codex **amend** (findings on how change and preservation tests were classified, exact equality in D2, the chosen budget versus capped allocations, itinerary claims, and handoff versus re-entry paths — all resolved in revision 2). Revision 2 → Codex **amend, limited to hosted-check wording**: H3 could not observe a carried duration through the search-miss link (it carries search text only), and H6 had to separate the saved preference from the rendered itinerary. Revision 3 → **owner approved** (8 October), with the §4.1 behaviour. Implementation by Claude as sole declared writer → Codex diff review **approve** at the tree (8 October), no required changes.

Codex independently reproduced the patch hash and resulting tree, 753 / 753, lint, build, a clean whitespace check and unchanged fixtures, and the three mutations:

| Mutation | Result |
|---|---|
| **M1** — the pre-fix expression put back | D1, D2, D2b and D5 fail; D3 and the handoff cases pass (40 pass, 4 fail) |
| **M2** — `activeTravelDays` always returns the Combine value | D3 and two existing single-destination handoff cases fail (41 pass, 3 fail) |
| **M3** — duration inferred by summing the fitted legs | only D2b fails, 8 instead of 12 (43 pass, 1 fail) |

### Local verification — what it did and did not cover

The harness bundles the real `DoorB.jsx`, stubs only the catalogue call, and reads the **stored route and stored preferences**. It has not seen the rendered itinerary, the saved list or the packing list; those are the point of the hosted rows. **Three numbers stay distinct** throughout: the requested budget, the allocated leg days (capped by each destination's maximum) and the generated itinerary days. The tests assert equality between budget and leg days only on an uncapped fixture, and assert 12 requested against 8 allocated on a capped one.

### Hosted checks

Checklist: brief revision 3 §8, rows H1–H6 with H3a, H3b and H3c. Record: `hosted-check-direct-arrival-duration-2026-10-13.md` in the Claude project.

| Row | Signed out, private window — the owner, 13 October (acceptance record) | Signed in, Claude in the owner's Chrome (supporting evidence only) |
|---|---|---|
| H1 bare path, combine, budget 10 | **PASS, owner-reported.** Screenshot: Mendoza 5d → Buenos Aires 5d, "A suggested 10-day plan", Day 1–Day 10. The budget the owner clicked was not stated; the 5d + 5d split is the one the signed-in runs gave for 10. The owner first wrote "worked mostly" and did not say what "mostly" meant; the later statement is that H1–H6 all worked | **PASS** — budget 10, legs 5 + 5, itinerary Day 1–10, stored 10 |
| H2 save; label and snapshot | **PASS, owner-reported.** Screenshot of the list: "Mendoza · Argentina · From home · 10-day trip", updated 13 October, "Trip saved to this device". The opened snapshot was reported as working, with no screenshot | **PASS** — same label; the opened trip says "A suggested 10-day plan" |
| H3a query-only handoff | **PASS, owner-reported.** Screenshot: `/find?dest_q=argentina` (lowercase as typed, no `days`), notice "We've brought your destination search. Choose a destination below." The control's starting value, the chosen length and the result were not given | **PASS** — notice as above, control 7 untouched, chose 9 → stored 9, legs 5 + 4, itinerary 9. Not saved |
| H3b duration-carrying handoff | **PASS, owner-reported.** Screenshots: `/find?dest_q=New+York+City&month=10&days=6&party=two`, the same notice, and a built 8-day plan (Mendoza 4d → Buenos Aires 4d, Day 1–Day 8). The control's starting value was not given; the owner changed the search text to Argentina to reach Combine, as instructed | **PASS** — control opened at 6, chose 8 → stored 8, legs 4 + 4, itinerary 8; October and a party of two carried. Not saved |
| H3c bare re-entry | **PASS, owner-reported, no values** | **PASS** — bare `/find`, no notice, control 7, chose 11 → stored 11, legs 6 + 5, itinerary 11. Not saved |
| H4 single destination | **PASS, owner-reported, no values** | **PASS** — Buenos Aires, chose 9 → stored 9, "9-day plan" |
| H5 packing list | **PASS, owner-reported** ("present, in the optional items"); no screenshot | **PASS** — "Laundry bag" and "Travel detergent" present on the 10-day combined trip |
| H6 Essentials, Back, Combine untouched | **PASS, owner-reported, no values and no screenshot** — in particular the saved label for this row was not shown | **PASS, with a limit** — control showed 7 untouched; stored 7; legs 4 + 3; itinerary 7; saved label "Mendoza · Argentina · From home · 7-day trip". A second run set Essentials to 11 by script before Back; Claude did not independently confirm that the 11 had registered |

**Acceptance — 13 October.** The owner ran the signed-out run in a private window and reported that H1–H6 all worked. That is recorded as **"the signed-out run passed, owner-reported"**. Four rows (H1, H2 label, H3a, H3b) have screenshots with part of their values, and the other rows and the remaining values are the owner's statement only. The duration fix is recorded as **accepted** on that basis, with the evidence limits above stated in the record rather than left implicit.

### Observations — not part of this fix, and not expanded

- **The saved-trip label names only the first stop** ("Mendoza · Argentina" for a Mendoza + Buenos Aires trip). Claude did not establish whether this behaviour changed; it is a separate observation, not claimed as a regression and not a reason to widen the fix.
- **The arrival notice for a duration-carrying link names only the search** — the link also carried the days, month and party, and the control opened at the carried 6. Consistent with what the approved checklist describes; recorded because a traveller may notice it.
- **Signed out, saving works on the device.** "Save itinerary" stored the trip in the browser with "Trip saved to this device" and offered "Create free account"; the owner did not use it. The signed-out header also shows "Clear this device".

### Deployment identity — established 13 October

**Read by Claude from `GET /api/apps/{app_id}/app-checkpoints`**, which carries `git_commit_hash` and `last_deployed_at` per checkpoint. Scanned across the 24 most recent checkpoints. **Read-only: no builder turn, no app edit, no entity write, no checkpoint, no deploy.**

| Deployed (UTC) | Commit | Release |
|---|---|---|
| 2026-10-06 16:17:00 | `cbad952` | F6 plus the first dependency bump |
| 2026-10-07 02:58:27 | `2944b0e` | `docs/STATE.md` introduced |
| 2026-10-07 06:18:38 | `9fd1de5` | Stage 1 owner-decision records |
| 2026-10-07 17:09:19 | `d8a809b` | A7 copy |
| 2026-10-08 03:13:51 | `f1535f1` | Direction B Stage 2 |
| 2026-10-08 04:11:56 | `93526b3` | Stage 2 records |
| 2026-10-08 06:06:04 and 06:06:38 | `2816ece` | Developer-harness closure |
| 2026-10-08 23:55:29 | `be34e5e` | Direction B Stage 3 |
| **2026-10-09 18:27:58** | **`b8fff25`** | **This fix — the current live build** |

**Three consequences:**

1. **The bot commit `3c11c52` is not in the live build.** This file previously recorded that as unknown. The live build predates it by four days, so `@base44/vite-plugin` 1.0.45 has never been deployed. Its independent review returned **KEEP** (owner-reported 13 October; the review document is not in Claude's hands).
2. **The owner's signed-out acceptance run tested `b8fff25`** — the approved tree, and the correct build. That was assumed on 13 October; it is now established, and it strengthens this release's acceptance.
3. **The records commit `b48f1a5` is not deployed**, which is correct for a docs-only commit.

**One platform observation**, recorded and not investigated: checkpoint `6ac732c36d690833bcb679e3` (commit `2816ece`, created 8 October) shows `build_ended_at` of 13 October 17:44:49, five seconds before the bot commit reached GitHub. **A GitHub push appears to trigger a rebuild without a deploy.**

**Every earlier release's inference turns out to have been correct.** They are simply no longer inferences.

### Side effects of the hosted checks

Claude's signed-in rows created two Mendoza trips (a 10-day and a 7-day) in the owner's synced saved list, and overwrote the stored Travel Fit and Combine preferences in that browser. Claude cannot delete trips; the owner was asked to remove the two and **confirmed on 13 October that both are deleted** (owner-reported; not independently checked by Claude or by the reviewer). The signed-out run left nothing behind, because a private window discards its storage on closing. A stray click on the Base44 badge opened its promo modal during the signed-in rows; it was closed and nothing was cloned.

### Honest limits of this release

- **The deployment record now exists** (above), so this release's hosted identity is established. What remains unestablished is any claim about *behaviour* beyond the rows actually run.
- **Most signed-out detail is a statement, not an observation.** See the table: H3c, H4, H5, H6, the H2 snapshot and several starting values have no signed-out evidence beyond the owner's word.
- **H1's budget and the word "mostly"** were never pinned down.
- **No migration.** A trip saved before the fix keeps its old label; one saved afterwards carries the chosen length. Nothing rewrote any record.
- **Generator shortfalls were not examined.** The runs happened to fill every day; a route that cannot fill its budget would still show fewer days than requested, and that is pre-existing behaviour this fix does not touch.
- **Rollback, if ever wanted:** revert `b8fff25` whole, tests included. It cannot undo trips travellers saved meanwhile.

## F7 preparation — the design packet, approved 13 October 2026

**D16 was opened by the owner on 8 October, bounded to planning and design. The five design documents (D-A to D-E) are now approved by the owner at revision 6**, after four independent review rounds. **Approval authorizes an implementation brief and nothing else.**

### Review history — four rounds, three of them AMEND

| Round | Verdict | What it found |
|---|---|---|
| Revision 1 → 2 | **AMEND** | Five required amendments (R1–R5) plus four D-C corrections |
| Revision 2 → 3 | **AMEND** | The correspondence rule still violated the governing flag-don't-reattach invariant; a two-pin counterexample showed a displaced pin taking a survivor's block |
| Revision 3 → 4 | **AMEND** | Five findings. Two were defects proved by executed probes: an issued id could be **reused** after apply-and-undo, and a reader-only client could write **identity-bearing state under the old payload version**. A third showed the reversal claim false on real Eastern Canada data |
| Revision 4 → 5 | **AMEND** | Two focused corrections: validation was ordered **before** issuance, so any proposal that added a block would have been rejected; and the ambiguity rule never terminated, stripping a new owner's identity on every rebuild |
| Revision 5 → 6 | **APPROVE WITH REQUIRED CLARIFICATIONS** | Targeted models passed 27 assertions across issuance, undo, conflicts and refusal. Three clarifications, all in D-A, incorporated at revision 6 |

**Claude confirmed the mechanism of each finding in source** rather than accepting it on the reviewer's word; the reviewer's two probe results (the reversal measurement and the v7-carrying-identity probe) are attributed to the reviewer and were not re-run.

### The product decision the owner took with this approval

> **A day that changes shape is treated as a different block, so the traveller is asked before a pinned activity is moved.** Where a suitable window exists an explicit offer is made; if the original day later returns, the pin returns with it.
>
> **Stated accurately, because an earlier revision overclaimed it:** today's engine **already** declines to keep the pin when the slot class changes (`restructure.js:182`) and already records the item as affected rather than losing it silently (`:160`). **The design changes the form of that outcome, not its existence** — a named placement with a state, the chance to say yes or no, and recovery. **The alternative is not a silent design**: ineligible items, removed stops and lost excursions are reported either way.
>
> **Nobody has measured how often this fires**, nor how often today's engine already drops a pin in the same situation. The implementation brief must measure both before the behaviour ships.

### What the packet settles, and what it does not

**Settled:** the correspondence rule (exact logical address, no proximity fallback); the allocation-versus-issuance protocol, with nothing minted before apply and a four-phase atomic commit; the lifecycle states and the terminal resolution of contested addresses; saved-trip compatibility with two client rules that keep new state from escaping under an old version; the payload bump to `door2-v8` with the envelope and engine unmoved; the three-stage F7/F8 sequence with content staged behind an isolation boundary covering both the graph and the activity shelf; and the F6 design delta.

**Not settled, and explicitly so:** Q8 is **not implemented** and its six acceptance cases are **not run**; all six Q10 conditions remain unmet; `TripSequence` stays provisional; wave-1 conditions (a), (b) and (d) are unknown and (c), (e), (f) unmet; and no eligibility rule is added or deferred feature activated.

### A finding from the live catalogue, 13 October

Read-only queries against Base44 while the packet was in review:

- **Wave-1 records confirmed live**, with their declared ranges: **34 Lima** `6a7e98494622807c9c3429bf` (single_base, 2–6 days); **38 New York City** `6a7e984900175cfc5fe2005a` (single_base, 3–9); **39 Huaraz and the Cordillera Blanca** `6a7e984900175cfc5fe20055` (single_base, 4–12). Record 39 declares `single_base` despite its region-like name, which partly eases D-C's "likeliest failure" concern.
- **The `Destination` schema contains no place reference of any kind** — no `placeId`, no `routeFamilyId`. D-C asks for each record's required Places "resolved from its own reference"; **there is no such field**, so the required-Place set must be authored and reviewed during migration, not derived. **This is a finding for the next revision of D-C**, not folded into the approved packet.
- **The two destination ids re-verified against the live catalogue**, as the roadmap required before use. One correction: the Tokyo record's stored name is **"Tokyo & Kyoto, Japan"**, id `6a7ced35c41497521b54e0bc`, `multi_stop`, 7–14 days.

Record: `base44-read-findings-deployment-identity-2026-10-13.md` in the Claude project.

## Next

1. **The Q8 implementation brief** is the next packet, now authorized by the owner's approval of the design. It must carry **D-A §11's seventeen acceptance cases** plus the identity-only stale-preview check, one declared writer, independent diff review, and owner-controlled push and publish. **Writing the brief authorizes no code.**
2. **The Base44-bot commit `3c11c52`** was independently reviewed with a **KEEP** verdict (owner-reported; the document is not in Claude's hands). It is **not in the live build**, so nothing is pending on it. It remains unmerged into any release record.
3. **Optional, each its own brief, review and hosted check:** pinning the two destination ids (both re-verified live on 13 October), and a decision on whether the first-stop-only saved-trip label is its own item.
4. **Separately authorizable, each on its own brief and owner go-ahead:** D-C §5's read-only assessment (its first input is now partly answered), the F6 delta's own review, and D-D's Stage 1 content preparation — whose brief must state the staging boundary for **both** the graph and the activity shelf.
5. **For the next revision of D-C:** the `Destination` schema carries no place reference, so the required-Place set is authored rather than derived.
6. Everything on the held list stays held.

## Where things live

Repo `github.com/asifiqbal251/travelup`, branch `main` · Base44 app `6a7ce8f29cef18f569162dc7` · public `wherenova.base44.app` · the Door 2 planner at `/plan`, **the public entry since 8 October** — no key, reached by all three "I know where I'm going" links, with `/find` as the fallback · Door 2 approvals, releases and briefs in the Codex outputs folder and the Claude project.
