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
