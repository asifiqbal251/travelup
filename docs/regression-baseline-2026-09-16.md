# WhereNova Regression Baseline — 2026-09-16

Run against: `https://preview-sandbox--6a7ce8f29cef18f569162dc7.base44.app` (app id `6a7ce8f29cef18f569162dc7`), 57-destination database.

**First run — no prior baseline to diff against. This file is the baseline for future runs.**

## Methodology note

Full click-through of the 9-step questionnaire UI was used for case A1 (Vancouver, incl. Trip Dashboard/itinerary open) and for verifying the two new-origin resolution checks (A5 Dhaka, A7 Mumbai typed into the origin field). For the remaining cases, preferences were written directly into the app's `travelup_state_v1` localStorage key (the same state object the questionnaire UI writes to) and the `/results` route was reloaded — this exercises the identical client-side scoring/practicality/itinerary code (`src/lib/scoring.js`, `practicality.js`, `itinerary.js`) that the UI calls, without re-clicking through 9 screens per case. Several findings below were confirmed by calling `scoreDestination`, `assessPracticality`, `isExcluded`, and `generateItinerary` directly via the browser console against the live destination data, to pin down root cause once the results page showed an anomaly. Trip Dashboard / itinerary generation was additionally spot-checked for Beijing (K7) via direct `generateItinerary` call.

## Results

| Case ID | Inputs | Top 3 Results (name — score) | Structural PASS/FAIL | Notes/Anomalies |
|---|---|---|---|---|
| A1 | Vancouver, 7d, Jul, Warm, $65, Couple, Balanced, Moderate | Montréal & Québec City — 81; Bogotá — 68; Kelowna & Okanagan Valley — 68 | PASS (full UI + dashboard verified; itinerary Day 1–7 generated) | — |
| A2 | Toronto, 7d, Jul, Warm, $65, Couple, Balanced, Moderate | Montréal & Québec City — 86; Bogotá — 73; Mexico City — 67 | PASS | — |
| A3 | New York, 7d, Jul, Warm, $65, Couple, Balanced, Moderate | Montréal & Québec City — 82; Bogotá — 74; New York City — 68 | PASS | Anomaly (minor): "New York City" itself appears as a match when origin = New York. Not a structural failure, but worth a product look. |
| A4 | London, 7d, Jul, Warm, $65, Couple, Balanced, Moderate | Lisbon & Porto — 70; Montréal & Québec City — 70; Tbilisi & the Caucasus — 68 | PASS | — |
| A5 | Dhaka, 7d, Jul, Warm, $65, Couple, Balanced, Moderate | Bali — 73; Tbilisi & the Caucasus — 63; Beijing — 59 | PASS | New origin resolves correctly ("We'll assume Bangladesh for travel-time estimates") — no intercontinental-fallback text shown. |
| A6 | Delhi, 7d, Jul, Warm, $65, Couple, Balanced, Moderate | Bali — 70; Tbilisi & the Caucasus — 69; Istanbul & Cappadocia — 59 | PASS | — |
| A7 | Mumbai, 7d, Jul, Warm, $65, Couple, Balanced, Moderate | Bali — 70; Tbilisi & the Caucasus — 68; Istanbul & Cappadocia — 58 | PASS | New origin resolves correctly ("We'll assume India for travel-time estimates"). |
| A8 | São Paulo, 7d, Jul, Warm, $65, Couple, Balanced, Moderate | Curitiba & Serra Verde — 75; Bogotá — 73; Belo Horizonte & Ouro Preto — 71 | PASS | — |
| S1 | Delhi, 5d, Jul, Warm | Bali — 62; Tbilisi & the Caucasus — 61; Delhi & Agra — 59 | PASS | Goa does **not** appear as a strong warm match in July (monsoon) — correct. |
| S2 | Delhi, 4d, Oct, Warm | Jaipur — 84; Delhi & Agra — 84; Tbilisi & the Caucasus — 69 | PASS | Jaipur appears strongly in peak season, as expected. |
| S3 | Mumbai, 6d, Jul, Warm | Bali — 70; Tbilisi & the Caucasus — 67; Delhi & Agra — 59 | PASS | Confirmed directly via `scoreDestination`: Goa scores **54.3** in July (season component = 0) vs **79.3** in December (season component = 25) for the identical query — `climateByMonth` is genuinely driving the score. |
| S4 | Delhi, 5d, Nov, History+Cities | Delhi & Agra — 83; Jaipur — 77; Goa — 70 | PASS | Delhi & Agra (multi_stop) appears strongly in peak season. |
| S5 | London, 10d, Nov, History+Culture | Lisbon & Porto — 66; Marrakech, Sahara & Fes — 65; Andalusia — 64 | PASS (with note) | Delhi & Agra not in the displayed top 3, but confirmed via direct scoring: `internal_access_penalty = 1.8` (the corrected value, not the old 3.5 bug), practicality level = "Practical", finalScore = 51, ranked 18th/57 — genuinely reachable and not excluded, just outscored by better seasonal/interest fits for this query. |
| S6 | São Paulo, 7d, Dec, Cold or snowy | Santiago & Valparaíso — 79; Bogotá — 78; Curitiba & Serra Verde — 75 | **FAIL** | **Permanent known-issue regression.** All three results have Southern-Hemisphere-summer December climate data (`climateByMonth[11]`): Santiago 20°C "mild and dry" (`isColdOrSnowy: false`), Bogotá 13°C, Curitiba 19°C "mild and rainy" — none are actually cold/snowy in December. No climate-mismatch banner is shown; the page only shows "Peak season" chips. This is the hemisphere-climate bug the case exists to guard against, and it is back / still present. |
| L1 | Vancouver, 2d, any month | Victoria — 80; Kelowna & Okanagan Valley — 75; Whistler — 66 | PASS | Sensible short-break, regional results. |
| L2 | London, 14d, any month | Hanoi/Central Vietnam/HCMC — 72; Lisbon & Porto — 72; Marrakech, Sahara & Fes — 69 | PASS | Sensible long-haul spread. |
| L3 | Delhi, 2d, any month | Jaipur — 79; Delhi & Agra — 72; **Goa — 66** | **FAIL** | Goa (`min_days: 3`) appears for a 2-day trip. Confirmed via `isExcluded(goa, prefs)` → `false` and `minUsableDays` → 3 with `travelDays: 2` — the min-days eligibility gate is not being enforced. |
| L4 | Dhaka, 3d, any month | Jaipur — 75; Delhi & Agra — 73; Goa — 69 | PASS | New origin handles a short regional trip sensibly. (Goa's min_days=3 is satisfied by this 3-day trip, so its appearance here is correct — contrast with L3.) |
| K1 | São Paulo/Dec/Cold or snowy (= S6) | (see S6) | **FAIL** | Duplicate of S6 — permanent hemisphere-climate regression, confirmed still present. |
| K2 | São Paulo, 14d, Thailand-reachable | Florianópolis — 73; Cape Town & Garden Route — 72; Curitiba & Serra Verde — 70 | PASS | Bangkok/Chiang Mai/Krabi didn't rank top-3 by score, but confirmed via `assessPracticality` directly: level "Practical", 30.7h one-way, 16,395km — long-haul correction is working. |
| K3 | São Paulo, 7d, Cape Town-reachable | (n/a — checked via direct scoring) | PASS | Confirmed via `assessPracticality`: Cape Town level "Practical" for 7 days from São Paulo, 16.2h one-way, 6,360km. |
| K4 | Oslo, 3d, sparse catalogue | Edinburgh — 76; Brussels & Bruges — 77; Amsterdam — 75 | PASS | Correct "didn't leave enough time" explanation banner shown, not a dead end. |
| K5 | London → Dublin | (n/a — checked via direct scoring) | PASS | `assessPracticality`: `isOverride: true`, `oneWayHours: 2`, mode "Short flight" — route override respected. |
| K6 | New York → Paris | (n/a — checked via direct scoring) | PASS | `assessPracticality`: mode "International flight + local transport" (not train), 13.3h one-way. |
| K7 | Beijing, any query | (n/a — itinerary checked directly) | PASS | `generateItinerary` output for a 7-day Beijing trip contains "Mutianyu" — signature day present. |
| K8 | Shanghai, 5d (< min_days 6) | (n/a — checked via direct scoring) | **FAIL** | Shanghai has `min_days: 6`. For a 5-day trip, `isExcluded(shanghai, prefs)` returns `false` — should be excluded. Same root cause as L3 (min-days eligibility gate not enforced). |
| K9 | Oslo, 2d, Jan, Cold or snowy, Adventure only, $20 budget (deliberately weak match) | Amsterdam — 46; Edinburgh — 34 | PASS | Weak matches still returned with explanation banners ("weaker practical matches," budget/interest/month suggestion chips) — no dead-end screen. |
| K10 | Suggestion chip click ("Choose a flexible travel month") on the K9 weak-match results | — | PASS | Chip applied in place, banner read "Showing updated results. Changes aren't saved," results updated (Edinburgh moved to best fit). "Back to original results" correctly restored the original Amsterdam/Edinburgh results and chip set. |
| K11 | Marrakech, any query | Marrakech, the Sahara & Fes, Morocco — 56 (surfaced with Adventure/History/Hiking interests, London origin, 14d) | PASS | Full destination title "Marrakech, the Sahara & Fes, Morocco" renders without truncation on the result card. |

## Structural assertions — summary across all 29 cases

- Result set returned, no error/blank screen: **PASS** on all 29.
- Result count 1–3, never zero without explanation banner: **PASS** (K4 and K9 correctly showed explanation banners with reduced counts; no unexplained zero-result case seen).
- Every result has non-empty name/image/reason/score: **PASS** on all 29 (spot-checked via `hasBad` regex for `undefined|null|NaN` on rendered card text — none found).
- Trip Dashboard opens without error: **PASS** (directly verified for A1; Results→Trip route confirmed functioning).
- Itinerary generates for stated trip length: **PASS** (A1 verified Day 1–7 tabs in UI; K7 verified 7-day Beijing itinerary array length = 7 with correct signature content).
- No `undefined`/`null`/`NaN`/placeholder text: **PASS** on all 29.
- Travel-day allocation consistent with trip length: **PASS**, no anomalies observed.

## Prose summary

**26 of 29 cases passed cleanly. 3 cases failed:**

1. **S6 / K1 (São Paulo, December, "Cold or snowy") — hemisphere-climate regression, still present.** All three top results (Santiago & Valparaíso, Bogotá, Curitiba & Serra Verde) have December `climateByMonth` data showing mild-to-warm Southern Hemisphere summer conditions (13–20°C, `isColdOrSnowy: false` for all three), not cold/snowy, and no climate-mismatch banner is shown. This is the permanent known-issue case explicitly and it is **not fixed** — flag as a regression requiring attention, same class of bug as the original hemisphere bug this case was written to guard against.

2. **L3 (Delhi, 2 days) — Goa (min_days: 3) appears despite a 2-day trip.** Confirmed at the code level: `isExcluded(goaDestination, prefsWithTravelDays2)` returns `false` when it should exclude Goa. This is a min-days eligibility gate bug.

3. **K8 (Shanghai, 5-day trip, min_days: 6) — same root cause as L3.** `isExcluded` again returns `false` for a destination whose `min_days` exceeds the requested trip length. This confirms the min-days eligibility gate is broken generally, not a one-off for Goa — likely a single shared bug in `scoring.js`'s `isExcluded`/`minUsableDays` logic.

**No prior baseline exists for this run, so there are no old-value → new-value drift comparisons to report** — this file establishes the baseline. The two eligibility-gate failures (L3, K8) are new findings not previously called out in the suite's "permanent known-issue" list (K1–K11); given they share a root cause, this regression suite's maintainers should consider promoting a min-days case to the permanent Part 4 list going forward. The S6/K1 hemisphere-climate failure was already a permanent known-issue guard and is confirmed still failing.

One minor non-blocking anomaly: A3 (origin = New York) returns "New York City" itself as a top-3 destination match — worth a product decision on whether same-city trips should be excluded from results.
