# TravelUp Regression Verification — Completion Report

**Date:** 2026-08-25
**App under test:** https://app.base44.com/apps/6a7ce8f29cef18f569162dc7/editor/preview (TravelUp), live preview commit `fc051e828e5cc0140f457ee3e97fc0d9daf3b050` ("Update Istanbul and Beijing itinerary settings and routes")
**Scope:** Verification only — no code changes, no Base44 build submitted.
**Method:** Local git commit check (`git pull` failed on SSH auth — no publickey access from this environment — but local `HEAD` was already at the expected `fc051e8`, confirmed via `git log -1`), plus fresh, isolated Playwright browser sessions against the live preview for Parts A–D. No `test-cases.md` file exists anywhere in this repo (`git ls-files` / `find` both return nothing); as in the prior investigation, the exact input profiles from `test-report-v2.md`'s "Post-Fix Retest" section were used as the authoritative baseline instead.

**Note on this session:** the previous verification pass was cut off by a connection error partway through Part D, Q3. Parts A (Kelowna/Napa & Sonoma) and D Q1/Q2 (Beijing Mutianyu-only, no duplicate filler) had already passed in that earlier pass and are carried forward here unchanged; everything else in this report (D Q3, Part B, Part C) was executed fresh in this session.

**Commit context:** `fc051e8` changed `base44/entities/Destination.jsonc` (+5 lines, adding a `signature` boolean field to day templates), `src/lib/itinerary.js` (`selectTemplates()` now guarantees signature-flagged templates before tag-overlap scoring fills the rest), `src/lib/regionalRoutes.js` (added a London→Dublin override, `oneWayHours: 2`), and `src/pages/About.jsx` / `src/pages/Landing.jsx` (destination count copy "18" → "54"). It did **not** touch `src/lib/scoring.js` or `src/lib/practicality.js`.

---

## Part A — Kelowna & Napa/Sonoma exact regression

*(Completed in the prior session pass; carried forward, not re-run.)*

| Case | Inputs | Expected | Result |
|---|---|---|---|
| Kelowna | Canada/Vancouver, Food+Nature+Relaxation, 4 days, Couple/Moderate, Both scope | ~95/100, Drive, ~4.5h | **PASS** — #1, 95/100, "Drive", "About 4.5 hours each way" |
| Napa and Sonoma | United States/San Francisco, same interests/budget/scope, 4 days | Top-3, ~88/100, Drive, ~1.5h | **PASS** — #3, 88/100, "Drive", "About 1.5 hours each way" (Kelowna #1/95, Victoria #2/88 ahead, identical to the pre-batch baseline pattern) |

Both destinations reproduce their established baseline exactly. No regression.

---

## Part B — All 54 destination images

Destination table confirmed at **54 records** (Istanbul & Cappadocia restored, 44 original + 10 new). Pulled every record's `name` + `image_url` directly from the Base44 Data table (scroll-and-collect over the virtualized grid), then fetched each of the 54 base image URLs directly (stripping the grid's `/v1/fill/...` thumbnail-transform suffix to test the actual stored `image_url` field).

**Result: 54/54 return HTTP 200, `content-type: image/png`.** No broken or missing images found. No destination flagged.

---

## Part C — Original 10-case core suite

Re-ran using `test-report-v2.md`'s Post-Fix Retest input profiles (Kelowna/Napa & Sonoma reused from Part A).

| # | Case | Expected | Result |
|---|---|---|---|
| 1 | Victoria | Ferry+ground, ~4h | **PASS** — #1, 92/100, "Ferry + ground transfer", "About 4 hours each way" |
| 2 | Whistler | Drive/shuttle, ~2h | **PASS** — #1, 95/100, "Drive or scheduled shuttle", "About 2 hours each way" |
| 3 | Tofino | Ferry+drive, ~6h | **PASS** — #1, 95/100, "Ferry + drive", "About 6 hours each way" |
| 4 | Kelowna | Drive, ~4.5h | **PASS** (Part A) |
| 5 | San Diego | Drive/train, ~2.5h | **PASS** — #1, 95/100, "Drive or train", "About 2.5 hours each way" |
| 6 | Las Vegas | Flight/drive, ~4.5h, peak in November | **PASS** — #1, 100/100, "Flight or drive", "About 4.5 hours each way", "Peak season in November" |
| 7 | Napa/Sonoma | Drive, ~1.5h | **PASS** (Part A) |
| 8 | Yosemite | Drive, ~4.5h | **PASS** — #2, 92/100, "Drive", "About 4.5 hours each way" (Whistler #1/95 ahead, matching baseline) |
| 9 | 14-day long-haul | 14 unique days, no "continued" labels | **PASS** — Tokyo & Kyoto #1, 93/100; itinerary confirmed exactly Days 1–14, no gaps/duplicates, no "continued" text anywhere |
| 10 | 3-day short domestic | Exactly 3 days, no repeats | **PASS** — Montréal and Québec City #1, 95/100 (Domestic-only scope); itinerary confirmed exactly Days 1–3, no repeats, no spurious extra day |

**10/10 pass.** No regressions found anywhere in the core suite.

---

## Part D — Quick confirmation (yes/no)

*(Q1/Q2 completed in the prior session pass; carried forward, not re-run. Q3 completed fresh in this session.)*

1. **Does Beijing's 7-day itinerary (Adventure not selected) schedule both Mutianyu and Badaling, or just Mutianyu?**
   → **Just Mutianyu.** Live itinerary (US/New York, 7 days, History and culture+Cities+Photography, Couple/Moderate): Day 3 Forbidden City & Tiananmen, **Day 4 Great Wall at Mutianyu**, Day 5 Temple of Heaven & hutongs. Badaling does not appear. Confirms the `signature`-flag fix in `selectTemplates()` is working as designed.

2. **Do Days 5–6 of that same itinerary show duplicate/near-identical "Flexible day" content?**
   → **No.** There is no "Flexible day" template in this itinerary at all — all 3 middle slots (Days 3–5) are filled by real, distinct templates (Forbidden City, Mutianyu, Temple of Heaven), so there was no opportunity for duplicate filler content to appear.

3. **Does Shanghai still silently disappear (no explanation shown) at 4 and 5 day trip lengths from a London origin?**
   → **Yes, confirmed still happening.** Live-tested UK/London, Cities+Food+Photography, Family/Comfortable, Both scope, no exclusions:
   - **4 days:** Shanghai absent from top-3 (Paris/Amsterdam/Brussels & Bruges shown). Excluded up to 9 competing destinations one round at a time (down to an 80/100 floor) — Shanghai never surfaced, and no on-screen message ever explains why it's missing.
   - **5 days:** Same result — top-3 was Istanbul & Cappadocia (92), New York City (90), Lisbon & Porto (87); Shanghai absent, no explanatory message.
   - **6 days (control, same inputs, no exclusions):** Shanghai appeared immediately at #3, 89/100, "Manageable" travel fit. This isolates the cause precisely to the trip-length eligibility gate identified in the original investigation (Issue 4, Effect 1) — it is **unchanged by this build**, since `scoring.js` was not touched in commit `fc051e8`. (Note: Shanghai's own `TRIP LENGTH` field now reads "6–7d", up from the "4–7d" seen in the original investigation — the destination's own advertised minimum was raised to match what the gate allows, but the underlying "silent disappearance with no message" UX gap itself was not addressed.)

---

## Overall verdict

**Step 2 not ready — see Part D, Q3 (Shanghai's silent disappearance at 4–5 day trip lengths from London remains unresolved; everything else — Parts A, B, C, and D Q1/Q2 — passes cleanly).**
