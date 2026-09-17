# ⚠️ MULTI-AGENT COORDINATION — READ BEFORE ANY EDIT

This project is worked on by multiple AI tools: **Claude Code** (local),
**Base44 Builder** (hosted, auto-syncs to GitHub), and **Codex/ChatGPT**.
All three can commit to this repository. Uncoordinated parallel edits have
already caused repeated merge conflicts and lost work. Follow this exactly.

## The rule

**One declared writer per session. Every other tool is read-only until the
writer commits, pushes, and reports the new commit hash.**

## If you are an AI agent starting work in this repo

Before making ANY change, do this, in order:

1. **State that you are the declared writer** for this session, and name the
   files/components you expect to touch.
2. **Run `git fetch origin` and `git status`** (or the local-checkout
   equivalent available to you). Confirm your checkout matches
   `origin/main`'s current HEAD before editing anything.
3. **If you cannot verify you're in sync with `origin/main`** (e.g. no
   network/SSH access from your environment) — **stop and say so explicitly**
   rather than proceeding on an unverified checkout. Ask the human to confirm
   the current hash before you continue. Do not assume "reported clean" means
   "actually current."
4. **Do not edit any file** that another declared writer might currently be
   touching. If uncertain, ask.

## Before finishing a session

1. Run lint AND a production build. Both must pass clean. (Lint alone is not
   sufficient — a missing export can pass lint and still break the build.)
2. Commit.
3. State clearly that you are handing off, and that the human needs to push
   (agents generally cannot push — this requires the human's SSH credentials).
4. After pushing, the new commit hash must be recorded before any other tool
   begins work.

## If you discover a push was rejected / the remote has diverged

**Do not blind-merge or blind-pull.** First:

```
git fetch origin
git log --oneline origin/main -5
```

Read the commit messages. If they touch files you were also editing, inspect
the actual diff before merging:

```
git --no-pager diff <last-shared-hash> origin/main -- <overlapping files>
```

Only merge once you understand what changed and why. If both sides
implemented the same fix differently, determine which version contains
functionality the other lacks — do not assume "cleaner" or "newer" means
"correct."

## Why this matters (context for any agent reading this)

Base44's builder can commit and push to `origin/main` autonomously and
silently — there is no notification when this happens. Some agent
environments (confirmed: Claude Code's sandbox) cannot reliably `git fetch`
due to SSH access limitations in that environment, meaning they can report a
"clean" working tree while actually being several commits behind. This
combination has caused two real conflicts in this project, one of which
would have silently reintroduced a shipped bug if merged without inspection.
Treat every session start as an opportunity for the remote to have moved
without your knowledge.

---

*(Original AGENTS.md content continues below)*
# AGENTS.md

## Project Context

This is a Base44 app repository. Treat it as user-owned application code, keep changes focused on the user's request, and preserve existing project conventions.

Start with `README.md` for local setup, environment variables, and publish workflow.

## Base44 References

- CLI overview: https://docs.base44.com/developers/references/cli/get-started/overview.md
- Agent skills: https://docs.base44.com/developers/backend/overview/skills.md

If your agent supports Agent Skills, install or update Base44 skills before Base44-specific work:

```bash
npx skills add base44/skills
```

## Key Files

- `src/`: frontend application source.
- `docs/PARKED.md`: scoped-but-not-done work — check before re-investigating.
- `src/api/base44Client.js`: frontend Base44 SDK client.
- `vite.config.js`: Vite config and Base44 Vite plugin setup.
- `.env.local`: local-only environment values; never commit secrets.

## Working Notes

- Use `base44 dev` as the default local development command when you need the local Base44 backend. It can run the backend and frontend together.
- When docs or code mention the frontend being started automatically, that usually means the Base44 project config includes `site.serveCommand`, for example `"serveCommand": "npm run dev"` in `base44/config.jsonc`.
- Use `npm run dev` only for frontend-only work against the hosted Base44 backend.
- Prefer the existing Base44 CLI workflow over adding new npm scripts for Base44-specific tasks.
- Reuse the existing SDK client and Vite plugin patterns before adding new Base44 integration paths.
- Run the relevant checks from `package.json` before finishing code changes.

# Scoring & practicality notes

Corrections to documentation-vs-implementation mismatches found during the
2026-08-29 MVP audit (`docs/MVP-AUDIT-2026-08-29.md`). No behaviour changed
for either item below — see `docs/wherenova-audit-fixes-brief.md` Part 4 for
the product decisions.

## `min_days`

`min_days` is a **soft scoring signal only** (up to 15 of 100 points via
trip-length fit in `scoring.js`), plus display use in
`discoveryCollections.js` and `storage.js`. It plays no role in
`isPractical()` / `minUsableDays()`. The actual gate preventing impractical
bookings is the travel-time tier system in `practicality.js`, entirely
independent of `min_days`.

**Decision (2026-08-29):** leave as a soft signal. Adding a second hard gate
would worsen the already-thin result counts. The travel-time gate already
covers the real safety case.

**⚠️ Superseded (2026-09-17):** `min_days` is now a **hard exclusion gate**.
`isMinDaysExcluded(dest, prefs)` in `scoring.js` filters out any destination
whose `min_days > prefs.travelDays` before scoring. Pipeline order:
`isExcluded` → `isPractical` → **`isMinDaysExcluded`** → `scoreWithPracticality`.
A `minDaysExcludedCount()` helper feeds a UI note in `Results.jsx`.
The L3/K8 regression cases now pass. S1 (Delhi 5d) and S2 (Delhi 4d) have
changed top-3 compositions accordingly — this is accepted expected behaviour.

## Known Scoring Gaps (permanent log)

These are confirmed gaps in scoring/UX logic with no fix planned yet. Each
entry becomes a permanent case in the regression suite to prevent unintended
future fixes from silently closing — or re-opening — the gap without review.

### Extreme-heat / extreme-conditions warning (logged 2026-09-17)

**Gap:** No warning is shown when a destination matches the user's climate
*category* (e.g. "Warm") but sits at an extreme within that category (e.g.
Dubai at 37°C in July). The climate-mismatch banner only fires when there are
no top-3 destinations with a matching label — it does not fire for
within-category extremes.

**Regression case:** Run `Dubai` for any origin with `travelMonth: 7`
(July) and `climate: ['Warm']`. Dubai should appear in results (it is
technically Warm), and **no banner should appear** — this is the correct
current behaviour. The gap is that there is also no contextual "extreme heat"
note anywhere in the result. This case is a permanent PASS under current
code; any future attempt to fix the gap must ensure this case still produces
results (it must not be suppressed by the fix).

**Intentionally not fixed now.** Adding a second within-category warning
carries real risk of false positives across the 57-destination catalogue.
Revisit when the recommender round adds per-destination contextual warnings.

---

## "No preference" (climate)

"No preference" on climate awards **full credit** to every destination
(`scoring.js:100-102`), not a skipped dimension. A genuinely unset field
(e.g. `budget: undefined`) instead awards **zero** via the `indexOf(-1)`
path. Both are rank-neutral, but they move absolute scores in opposite
directions (+10 vs +0).

**Decision (2026-08-29):** keep full credit. Ranking is unaffected either
way, and changing scoring maths carries real risk for a cosmetic gain.
Revisit during the recommender round if inflated absolute scores become a
problem.
