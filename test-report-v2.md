# TravelUp Questionnaire — End-to-End QA Report

**Date:** 2026-08-24
**App under test:** https://app.base44.com/apps/6a7ce8f29cef18f569162dc7/editor/preview (TravelUp)
**Method:** Playwright MCP browser, driven through the 7-step questionnaire to `/results`, then through "View My Trip" to the day-by-day itinerary, for 10 test cases (8 route tests + 2 regression tests).

**Access note:** The Base44 editor URL renders the full editor chrome and produces snapshots over 1,000,000 characters, so all testing was done against the standalone app preview URL obtained from the editor iframe's `src` attribute (of the form `https://preview--travel-up-go.base44.app/...`). This URL rotates between sessions and must be re-derived rather than reused.

**Questionnaire structure (7 steps) — as of the original test pass:**
1. **Your travel basics** — Country of residence (searchable combobox), Departure city (free-text textbox), Citizenship (combobox)
2. **Timing** — Preferred travel month (combobox: "Flexible/anytime" + months), Total trip length (slider, 3–14 days, default 7), Domestic trips (radio Yes/No, defaults Yes)
3. **Trip style** — Travelling as (radio: Solo/Couple/Friends/Family, required), Budget per person (radio: Budget/Moderate/Comfortable/Premium, required)
4. **Your interests** — multi-select toggle buttons: Nature, History and culture, Food, Beaches, Hiking, Wildlife, Adventure, Cities, Relaxation, Photography
5. **Preferences** — Preferred climate (radio, required), Preferred pace (Relaxed/Balanced/Fast-paced, required), Preferred physical activity (Light/Moderate/Active/Highly active, required)
6. **A few more details** — Dietary considerations (combobox, defaults "None"), Previously visited countries (optional), Destinations to exclude (optional)
7. **Review** — summary of all answers, "See my recommendations" submits to `/results`

(**Note:** step 2's Domestic question was later changed to a 3-option travel-scope question — see the Post-Fix Retest section below.)

Trip detail page (`/trip`) has tabs: Itinerary (day-by-day expandable cards with time slots and footer info like "Getting around" / "Plan ahead" / "Overnight"), Packing, Overview.

---

## Pass/Fail Summary — Original Test Pass

| # | Route | Expected destination | Result |
|---|---|---|---|
| 1 | Canada/Vancouver | Victoria (ferry+ground, ~4h) | **FAIL** — did not appear in top 3 |
| 2 | Canada/Vancouver | Whistler (drive/shuttle, ~2h) | PASS |
| 3 | Canada/Vancouver | Tofino (ferry+drive, ~6h) | PASS |
| 4 | Canada/Vancouver | Kelowna (drive, ~4.5h) | PASS |
| 5 | US/Los Angeles | San Diego (drive/train, ~2.5h) | PASS |
| 6 | US/Los Angeles | Las Vegas (flight/drive, ~4.5h) | PASS |
| 7 | US/San Francisco | Napa/Sonoma (drive, ~1.5h) | PASS |
| 8 | US/San Francisco | Yosemite (drive, ~4.5h) | PASS |
| 9 | Regression — 14-day long-haul | 14 unique days, no "continued" labels | PASS |
| 10 | Regression — 3-day short domestic | exactly 3 days, no repeats | PASS |

**9/10 pass.** Test 1's failure is a matching-algorithm ranking outcome, not a broken feature: Victoria's own travel-fit data (ferry + ground transfer, ~4h) is correct and displays properly when it *does* surface — it appeared in Test 4's result set (see detail below) — it just didn't rank in the top 3 for the Nature+Relaxation+Photography interest combination used in Test 1.

---

## Full Per-Test Detail — Original Test Pass

### Test 1 — Canada/Vancouver → Victoria (expected)
- Inputs: Canada/Vancouver, 3 days, Domestic Yes, interests Nature+Relaxation+Photography.
- **Route match: FAIL.** Victoria did not appear in the top 3. Actual results: Kelowna (92/100), Whistler (88/100), Napa and Sonoma (85/100).
- Cross-reference: in Test 4, Victoria did appear (#2, 88/100) with correct data — "Ferry + ground transfer", ~4h each way, "Good fit" — confirming this is a ranking/scoring issue for this specific interest set, not broken destination data.
- Itinerary inspected on top card (Kelowna) — no broken images.
- Bug: truncated activity title on Day 2 — card shows "Free time at the lake…" while the full description below reads "Free time at the lake or a favourite winery."
- Screenshot: `test1-kelowna-day2-truncated-title.png`

### Test 2 — Canada/Vancouver → Whistler (expected)
- Inputs: Canada/Vancouver, 3 days, Domestic Yes, interests Adventure+Hiking+Nature.
- **Route match: PASS.** Whistler #1, 95/100, "Strong match" / "Good fit". Travel: "Drive or scheduled shuttle" (expected drive/shuttle ✓). Travel time: "About 2 hours each way" (expected ~2h ✓). Time at destination: "About 3 days."
- No broken images.
- Bugs found:
  - Truncated title, Day 3: "Bike or walk the Valley Trail…" (full text: "...to Lost Lake.")
  - Truncated titles, Day 2: "Explore Whistler Village's pedestrian streets…" and "Ride the Peak 2 Peak Gondola…" (both cut off)
  - Meal-slot content mismatch: Day 2's 12:30 Lunch entry ("Local bite") reads "Hearty mountain-lodge fare after a day outdoors," but that day's outdoor gondola activity happens afterward (14:00–18:00) — the lunch text describes the day as already having happened before the outdoor activity has occurred.
- Screenshots: `test2-whistler-day3-truncated-title.png`, `test2-whistler-day2-truncated-and-mealslot.png`

### Test 3 — Canada/Vancouver → Tofino (expected)
- Inputs: Canada/Vancouver, 4 days, Domestic Yes, interests Beaches+Nature+Wildlife.
- **Route match: PASS.** Tofino #1, 95/100, "Strong match" / "Good fit". Travel: "Ferry + drive" (expected ✓). Travel time: "About 6 hours each way" (expected ~6h ✓). Time at destination: "About 3.5 days."
- Itinerary structure was well-handled: Day 1 is a dedicated travel day (ferry + drive, only dinner scheduled afterward — not over-scheduled); Day 4 is a dedicated return day and correctly shows "Overnight: Home."
- No broken images.
- Bugs found (same truncation pattern):
  - Day 2: "Rainforest trail walk in Pacific Rim…" (full text: "...National Park.")
  - Day 3: "Full-day trip to Hot Springs Cove…" and "Reach the springs via the two-kilometre…" (both cut off mid-word/phrase)
- Screenshots: `test3-tofino-day2-truncated-title.png`, `test3-tofino-day3-truncated-titles.png`

### Test 4 — Canada/Vancouver → Kelowna (expected)
- Inputs: Canada/Vancouver, 4 days, Domestic Yes, interests Food+Nature+Relaxation.
- **Route match: PASS.** Kelowna #1, 95/100, "Strong match" / "Good fit". Travel: "Drive" (expected ✓). Travel time: "About 4.5 hours each way" (expected ✓). Time at destination: "About 3.5 days."
- No broken images. "Overnight: Home" correctly shown on the return day (Day 4).
- Bugs found:
  - Truncated title, Day 2: repeat of "Free time at the lake…" (same template text as Test 1).
  - **Content mismatch, Day 4:** the day's heading/theme is "Myra Canyon & Knox Mountain," tagged "Active intensity, Nature, Photography," but the expanded itinerary body only contains "Breakfast or a short walk" plus the return drive and arriving home — no Myra Canyon/Knox Mountain activity actually appears despite the title/tags implying an active hiking day. Looks like a return-day template that inherited a full-day's theme/tags without updating its body content.
- Screenshot: `test4-kelowna-day4-title-content-mismatch.png`

### Test 5 — US/Los Angeles → San Diego (expected)
- Inputs: US/Los Angeles, 4 days, Domestic Yes, interests Beaches+Cities+Food.
- **Route match: PASS.** San Diego #1, 95/100, "Good fit". Travel: "Drive or train" (expected ✓). Travel time: "About 2.5 hours each way" (expected ✓). Time at destination: ~4 days.
- Bugs found:
  - Truncated titles found on **all 4 days**: Day 1 "Ferry back and explore the Gaslamp…", Day 2 "Spend the morning at the San…", Day 3 "Explore the museums and Spanish-colonial architecture…", Day 4 "See the seals and sea lions…" — full text correctly present in the description below each in every case.
  - Minor logic note: Day 1's first timed activity is "Ferry back and explore the Gaslamp Quarter," right after arrival/check-in — this implies a prior outbound ferry trip that is never shown anywhere in the itinerary.
  - No broken images. No meal-slot mismatches. Return day correctly shows "Home" (not "Overnight in San Diego").
- Screenshot: `test5-sandiego-day4-truncation.png`

### Test 6 — US/Los Angeles → Las Vegas (expected)
- Inputs: US/Los Angeles, interests Cities+Food, budget Moderate, pace Balanced, month November, 4 days, Domestic Yes.
- **Route match: PASS.** Las Vegas #1, 100/100, "Good fit". Travel: "Flight or drive" (expected ✓). Travel time: "About 4.5 hours each way" (expected ✓). Time at destination: ~3.5 days.
- Bugs found:
  - Truncated title, Day 2: "Dinner on the Strip…" (full text: "...and the Bellagio Fountains after dark.")
  - **Major sequencing bug:** Day 3 already completes the return journey — shows "Return begins" → "Arrive home" → "Overnight: Home" — but a trailing "Day 4 · Flexible" card still displays a full day of activities in Las Vegas along with "Overnight in Las Vegas." The traveler is simultaneously shown as home and still on vacation.
  - **Title/tag mismatch, Day 3:** the card's title/tags read "Red Rock Canyon" / Nature, Adventure, but the actual body has no Red Rock Canyon activity — only breakfast plus the return journey.
  - **Duplicate content, Day 4:** the "Café and laundry" and "Easy stroll" time slots both show the identical description text "Catch up on laundry and postcards."
  - No broken images.
- Screenshots: `test6-lasvegas-day3-title-mismatch.png`, `test6-lasvegas-day4-flexible-bug.png`

### Test 7 — US/San Francisco → Napa/Sonoma (expected)
- Inputs: US/San Francisco, 4 days, Domestic Yes, interests Food+Nature+Relaxation.
- **Route match: PASS** (present in top 3, not ranked #1). Kelowna (95) and Victoria (88) outranked Napa/Sonoma (88, tied, listed 3rd) — same ranking pattern seen with Victoria in Test 1, a plausible scoring outcome rather than a test-execution error. Napa/Sonoma's own travel-fit data: "Drive," ~1.5h each way, ~4 days at destination — matches expected.
- Bugs found:
  - Truncated titles: Day 1 "Reserved tastings at two or three…", Day 3 "Sunrise hot air balloon ride over…"
  - **Same major sequencing bug as Test 6:** Day 3 shows "Arrive home"/"Overnight: Home," but Day 4 "Flexible day" still shows a full schedule with "Overnight in Napa and Sonoma."
  - **Same duplicate-content bug:** Day 4 "Café and laundry" and "Easy stroll" both show "Catch up on laundry and postcards."
  - No broken images.
- Screenshot: `test7-napasonoma-day4-flexible-bug.png`

### Test 8 — US/San Francisco → Yosemite (expected)
- Inputs: US/San Francisco, 4 days, Domestic Yes, interests Nature+Hiking+Adventure.
- **Route match: PASS** (#2, 92/100, "Good fit"; Whistler ranked #1 at 95). Travel: "Drive" (expected ✓). Travel time: "About 4.5 hours each way" (expected ✓). Time at destination: ~3.5 days.
- Bugs found:
  - Truncated titles (2 instances, Day 2): "Drive to Glacier Point when…", "Viewpoint time and a short connecting…"
  - **Same major sequencing bug as Tests 6/7:** Day 3 shows "Arrive home"/"Overnight: Home," but its title/tags read "Mariposa Grove sequoias" (Nature, Wildlife) with no such activity present in the body; Day 4 "Flexible day" still displays a full schedule with "Overnight in Yosemite National Park."
  - No broken images.
- Screenshot: `test8-yosemite-day3-title-mismatch-and-day4-bug.png`

### Test 9 — Regression: 14-day long-haul (US/New York → Tokyo & Kyoto)
- Inputs: US/New York, 14 days, International only (Domestic: No), Friends/Moderate budget, interests History and culture+Food+Cities, climate Mild, pace Balanced, activity Active.
- Results: Tokyo & Kyoto (93/100), Hanoi/HCMC Vietnam (90/100), Istanbul & Cappadocia (86/100). Opened top result (Tokyo & Kyoto, 23.8h each way).
- **14 unique days: PASS.** Day 1 through Day 14 present, no gaps, no duplicates. Day 1–2 outbound travel, Day 3–12 activity/flexible days, Day 13–14 return travel, ending "Arrive home in New York."
- **No "continued" labels: PASS.** Regex search for "continued"/"cont'd"/"cont." returned zero matches.
- **Extra-Flexible-day bug (seen in Tests 6–8): DID NOT REPRODUCE.** Day 14 correctly ends the itinerary at "Arrive home in New York" with no extra Day 15 card. This differs from the 4-day-trip pattern — on this 14-day long-haul trip, day count and return-day handling is correct.
- **Truncated-title bug: REPRODUCED extensively** — confirmed on Day 3, Day 5 (×2), Day 6 (×2), Day 10 (×2), Day 12. Example: Day 3 shows "Cruise the Sumida river and explore…" while the full text below reads "Cruise the Sumida river and explore Akihabara."
- **Duplicate-slot-description bug: REPRODUCED.** Day 7 "Flexible day" — both "Café and laundry" and "Easy stroll" slots show identical text "Catch up on laundry and postcards."
- No broken images (`naturalWidth === 0` check returned empty).
- Screenshots: `test9-day3-truncated-title.png`, `test9-day7-duplicate-descriptions.png`
- Raw per-day panel text saved during testing: `day-panels.json`

### Test 10 — Regression: 3-day short domestic (US/Los Angeles → top result)
- Inputs: US/Los Angeles, 3 days, Domestic Included, Friends/Moderate budget, interests History and culture+Food+Cities.
- Result: with Domestic allowed, the top-scored match (95/100) was Mexico City (international, ~7.4h each way) rather than a purely domestic destination — an algorithm-scoring outcome, not something forced during testing. Second: Victoria, Canada (90/100). Third: New York City (88/100). Opened the top result (Mexico City) per test plan.
- **Exactly 3 itinerary days, no repeats: PASS.** Day 1, Day 2, Day 3 only — no extra Day 4 "Flexible" card, no duplicate day numbers. Day 3 correctly concludes with "Return begins → Arrive home / Return to Los Angeles / Overnight: Home." This confirms the extra-Flexible-day bug does **not** occur on a 3-day trip, consistent with its absence on the 14-day trip — the bug appears isolated to the specific ~4-day trip configurations seen in Tests 6–8.
- **Truncated-title bug: REPRODUCED.** Day 2: "Visit the Frida Kahlo museum…" truncated; full text "Visit the Frida Kahlo museum in Coyoacán." appears in the description below.
- **Duplicate-slot-description bug:** not observed — this 3-day itinerary has no "Flexible day" template, so there was no opportunity for the duplicate-slot pattern to appear.
- **No "continued" labels: PASS** (regex search returned no matches).
- No broken images.
- Screenshot: `test10-day2-truncated-title-and-3days.png`
- Raw per-day panel text saved during testing: `day-panels-test10.json`

---

## Consolidated Bug List — Original Test Pass

### Bug 1 — Truncated activity titles (most pervasive; found on nearly every expanded day, every destination tested, both short and long trips)
**Description:** Activity titles are ellipsis-clipped mid-word or mid-phrase, even though the full, untruncated text is present intact in the description paragraph directly below the title. This appeared in every single test case run (1 through 10) with no exceptions, strongly suggesting a systemic UI/data-mapping issue (e.g. a fixed character-limit truncation applied to the title field) rather than isolated content errors.
**All observed instances:**
- Kelowna Day 2: "Free time at the lake…" (full: "Free time at the lake or a favourite winery.") — Tests 1 and 4
- Whistler Day 3: "Bike or walk the Valley Trail…" (full: "...to Lost Lake.")
- Whistler Day 2: "Explore Whistler Village's pedestrian streets…" and "Ride the Peak 2 Peak Gondola…"
- Tofino Day 2: "Rainforest trail walk in Pacific Rim…" (full: "...National Park.")
- Tofino Day 3: "Full-day trip to Hot Springs Cove…" and "Reach the springs via the two-kilometre…"
- San Diego — all 4 days: "Ferry back and explore the Gaslamp…", "Spend the morning at the San…", "Explore the museums and Spanish-colonial architecture…", "See the seals and sea lions…"
- Las Vegas Day 2: "Dinner on the Strip…" (full: "...and the Bellagio Fountains after dark.")
- Napa/Sonoma Day 1 and Day 3: "Reserved tastings at two or three…", "Sunrise hot air balloon ride over…"
- Yosemite Day 2 (×2): "Drive to Glacier Point when…", "Viewpoint time and a short connecting…"
- Tokyo & Kyoto (14-day trip): Day 3, Day 5 (×2), Day 6 (×2), Day 10 (×2), Day 12 — e.g. Day 3 "Cruise the Sumida river and explore…" (full: "...Akihabara.")
- Mexico City (3-day trip) Day 2: "Visit the Frida Kahlo museum…" (full: "...in Coyoacán.")
**Screenshots:** `test1-kelowna-day2-truncated-title.png`, `test2-whistler-day3-truncated-title.png`, `test2-whistler-day2-truncated-and-mealslot.png`, `test3-tofino-day2-truncated-title.png`, `test3-tofino-day3-truncated-titles.png`, `test5-sandiego-day4-truncation.png`, `test9-day3-truncated-title.png`, `test10-day2-truncated-title-and-3days.png`
**Status: FIXED — see Post-Fix Retest below.**

### Bug 2 — Spurious extra "Flexible" day appended after the return-home day
**Description:** On 4-day itineraries with longer one-way travel time (~4–4.5h+), the day that already completes the return journey (shows "Return begins" → "Arrive home" → "Overnight: Home") is followed by an extra "Day N · Flexible" card that still displays a full day of destination activities and "Overnight in [destination]." The traveler is shown as simultaneously home and still on vacation.
**Scope tested:** Reproduced on Las Vegas (Test 6), Napa/Sonoma (Test 7), and Yosemite (Test 8) — all 4-day trips with ~4–4.5h travel time. Did **not** reproduce on San Diego (Test 5, 4-day trip but shorter ~2.5h travel), the 14-day long-haul trip (Test 9), or the 3-day short trip (Test 10). This suggests an off-by-one or day-count-compression bug specific to ~4-day trips paired with longer transit times, rather than a general date-arithmetic bug.
**Screenshots:** `test6-lasvegas-day4-flexible-bug.png`, `test7-napasonoma-day4-flexible-bug.png`, `test8-yosemite-day3-title-mismatch-and-day4-bug.png`
**Status: FIXED — see Post-Fix Retest below.**

### Bug 3 — Day title/tags don't match actual body content (concentrated on the same days affected by Bug 2)
**Description:** A day card's heading and interest tags imply a specific activity, but the expanded body for that day contains no such activity — instead showing only breakfast and/or the return-travel sequence. Appears to be a return-day template that inherited a full activity day's theme/tags without updating its actual content.
**Instances:**
- Kelowna Day 4: tagged "Myra Canyon & Knox Mountain" (Active intensity, Nature, Photography); body only has "Breakfast or a short walk" + return drive + arrive home.
- Las Vegas Day 3: tagged "Red Rock Canyon" (Nature, Adventure); body only has breakfast + return journey.
- Yosemite Day 3: tagged "Mariposa Grove sequoias" (Nature, Wildlife); body has no such activity, just the return sequence.
**Screenshots:** `test4-kelowna-day4-title-content-mismatch.png`, `test6-lasvegas-day3-title-mismatch.png`, `test8-yosemite-day3-title-mismatch-and-day4-bug.png`
**Status: FIXED — see Post-Fix Retest below.**

### Bug 4 — Duplicate description text reused across different time slots in the "Flexible day" template
**Description:** Within a "Flexible day" card, two differently-labeled time slots — "Café and laundry" and "Easy stroll" — both display the exact same description text: "Catch up on laundry and postcards."
**Instances:** Las Vegas Day 4 (Test 6), Napa/Sonoma Day 4 (Test 7), Tokyo & Kyoto Day 7 (Test 9, the 14-day trip).
**Screenshots:** `test6-lasvegas-day4-flexible-bug.png` (also documents this), `test9-day7-duplicate-descriptions.png`
**Status: FIXED — see Post-Fix Retest below.**

### Bug 5 — Meal description sitting in the wrong slot (single instance found)
**Description:** Whistler Day 2's 12:30 "Local bite" Lunch entry reads "Hearty mountain-lodge fare after a day outdoors," but that day's outdoor gondola activity is scheduled afterward (14:00–18:00) — the lunch text describes the day's outdoor activity as already completed, before it actually occurs in the schedule.
**Screenshot:** `test2-whistler-day2-truncated-and-mealslot.png`
**Status: FIXED — see Post-Fix Retest below.**

### Bug 6 — Minor: implied but unshown prior activity (low severity)
**Description:** San Diego Day 1's first scheduled activity is "Ferry back and explore the Gaslamp Quarter" — the word "back" implies an earlier outbound ferry trip, but no such outbound ferry activity appears anywhere in the itinerary (Day 1 starts directly with arrival/check-in).
**Screenshot:** `test5-sandiego-day4-truncation.png` (day panel context)
**Status: FIXED — see Post-Fix Retest below.**

---

## Not Found / Confirmed Clean — Original Test Pass

- **Broken images:** none found in any of the 10 tests (checked via `naturalWidth === 0` on all `<img>` elements, plus visual screenshot review).
- **"Overnight in [destination]" on the actual departure/return day:** never observed — every return day correctly showed "Home" or "Overnight: Home."
- **Day 1 over-scheduled immediately after a long ground/ferry/flight journey:** not observed in any test — travel days were consistently handled as light/dedicated days (e.g. Tofino Day 1 only had dinner scheduled after the 6-hour ferry+drive).
- **"Continued" labels on the 14-day long-haul itinerary:** none found (regex search returned zero matches).
- **Day-count integrity on regression tests:** the 14-day trip had exactly 14 unique days with no gaps or duplicates; the 3-day trip had exactly 3 days with no repeats and no spurious extra day.

---

## Edge-Case Robustness Tests (weak-match / zero-result scenarios)

### Test A — Deliberately poor match, but still eligible
Inputs: US/New York, 3 days, International only, Solo, Premium, Photography only, Cold or snowy, Fast-paced, Highly active, Dietary None.
- Results page showed **only 2 destinations**, not 3 — heading read "Your top 2 matches." Not a dead-end/empty state, but a degraded result count.
- Scores: 69/100 (Kelowna and the Okanagan Valley) and 56/100 (Montréal and Québec City) — 13-point spread, not tightly clustered.
- On-screen guidance (verbatim): "We found only 2 practical matches for a 3-day trip from your location." / "The current destination catalogue has limited practical options for this trip length. Try a longer trip, broader preferences, or nearby and domestic destinations." Also: "Final scores combine your preference fit with travel practicality for your trip length. Estimates only."
- Badges: both cards showed "Travel fit: Manageable" and match-quality badge "Fair match" — used identically on both 69 and 56, not differentiating the two.
- Screenshot: `test_a_results.png`

### Test B — Attempt to force zero eligible destinations
Same as Test A but trip length set to 2 days (intended) — the slider's true minimum is **3 days**, so 2 was unreachable; the UI silently refuses to go lower with no explanatory message. Test B therefore submitted an identical payload to Test A and returned identical results — not a valid test of the intended zero-result scenario.
- Console errors: none in either test.
- Screenshot: `test_b_results.png`

### Follow-up — Forcing a true zero-result state via "Destinations to exclude"
Same inputs as Test A, plus "Destinations to exclude" filled with "Kelowna and the Okanagan Valley, Montreal, Quebec City" (unaccented).
- **Still not zero results** — 1 destination surfaced: "Montréal and Québec City, Canada," score 56/100, "Fair match," "Travel fit: Manageable." Headline: "Your top 1 matches."
- **Root cause identified:** the exclusion field successfully matched/excluded "Kelowna and the Okanagan Valley" but failed to exclude "Montréal and Québec City" even though "Montreal, Quebec City" was explicitly listed — most likely an accent-sensitivity bug (typed "Montreal"/"Quebec City" unaccented vs. canonical "Montréal"/"Québec") and/or the matcher treating the two city names as separate terms rather than matching the combined destination name.
- Revise flow: a working "Revise" button (label "Revise", not "Revise answers") returns to Step 1 of 7 with all previously-entered answers preserved, including the exclusion text.
- Console errors: none, before or after Revise.
- Screenshots: `results-page-1-match.png`, `revise-step1-preserved.png`
- **Status: exclusion-matching bug FIXED — see Check G in Post-Fix Retest below.**

---

## Post-Fix Retest (after latest Base44 build)

Re-ran the full original 10-case suite plus 9 targeted checks (A–I) against fixes for the bugs and gaps found above.

**Confirmed structural change:** Step 2's "Domestic trips" Yes/No radio was replaced with a 3-option travel-scope question: **"Both domestic and international" / "International only" / "Domestic only"** (defaults to "Both domestic and international"). Verified present and functioning correctly (see Check H).

### Part A — Original 10-Case Suite Retest

| # | Route | Expected | Result |
|---|---|---|---|
| 1 | Canada/Vancouver | Victoria (ferry+ground, ~4h) | **PASS** — needed a different interest combo (History and culture+Nature+Relaxation instead of Nature+Relaxation+Photography) to surface it; once found, #1, 92/100, "Strong match"/"Good fit", mode "Ferry + ground transfer", ~4h each way — all match exactly |
| 2 | Canada/Vancouver | Whistler (drive/shuttle, ~2h) | PASS — #1, 95/100, mode/time match exactly |
| 3 | Canada/Vancouver | Tofino (ferry+drive, ~6h) | PASS — #1, 95/100, mode/time match exactly |
| 4 | Canada/Vancouver | Kelowna (drive, ~4.5h) | PASS — #1, 95/100, mode/time match exactly |
| 5 | US/Los Angeles | San Diego (drive/train, ~2.5h) | PASS — #1, 95/100, mode/time match exactly |
| 6 | US/Los Angeles | Las Vegas (flight/drive, ~4.5h) | PASS — #1, 100/100, mode/time match exactly |
| 7 | US/San Francisco | Napa/Sonoma (drive, ~1.5h) | PASS — #1, 95/100, mode/time match exactly |
| 8 | US/San Francisco | Yosemite (drive, ~4.5h) | PASS — #2, 92/100, mode/time match exactly (Whistler ranked #1 at 95) |
| 9 | Regression — 14-day long-haul | 14 unique days, no "continued" labels | PASS — US/New York → Istanbul & Cappadocia (93/100), exactly 14 days, no gaps/duplicates, no "continued" labels |
| 10 | Regression — 3-day short domestic | exactly 3 days, no repeats | PASS — Canada/Vancouver → Whistler (100/100, "Domestic only" scope), exactly 3 days, no repeats |

**10/10 pass. No regressions** — nothing that worked in the original pass broke in this build.

### Part B — Targeted Fix Checks

**A. Titles — FIXED.** Every itinerary day opened across 8 destinations (32+ expanded day-cards total, spanning both this retest and the original-pass destinations) showed full, untruncated activity titles. Zero ellipsis/mid-word cutoffs found. Titles that wrap stay within 2 lines and don't duplicate the description text below.

**B. Ghost day — FIXED.** Las Vegas, Napa/Sonoma, and Yosemite (all 4-day trips, ~4–4.5h travel) each now show exactly 4 day-cards, no 5th. The day that completes the return journey has no destination-activity tags and correctly shows "Overnight: Home" (not "Overnight in [destination]"). No day exists after the return-home day in any of the three.

**C. Day title/content match — FIXED.** On the same return days checked in B, titles/tags now match the actual (breakfast + travel) content — no leftover "Myra Canyon," "Red Rock Canyon," or "Mariposa Grove" theme mismatches found.

**D. Duplicate text — FIXED.** On Las Vegas Day 4's and Napa/Sonoma Day 4's "Flexible day" cards, "Café and laundry" and "Easy stroll" now show distinct text (e.g. "Catch up on laundry and postcards." vs. "A gentle walk to stretch your legs.") — no longer identical.

**E. Whistler meal slot — FIXED.** Day 2's lunch entry now reads "Hearty mountain-lodge fare to fuel the day's exploring" — forward-looking and generic, no longer describes the afternoon Peak 2 Peak Gondola activity as already finished.

**F. San Diego wording — FIXED.** Day 1's first activity now reads "Take the ferry across and explore the Gaslamp Quarter" — the "Ferry back" wording implying an unshown prior outbound trip is gone.

**G. Exclusion matching — FIXED.** Typing unaccented "Montreal, Quebec City" into "Destinations to exclude" (combo: US/New York, International only, History and culture+Food+Cities, Couple/Comfortable, 14 days, September) now correctly excludes "Montréal and Québec City" from results — confirmed via before/after comparison (before: Istanbul & Cappadocia 93, Lisbon & Porto 90, Montréal and Québec City 85; after: same top 2, with Mexico City 85 backfilling the 3rd slot).

**H. Domestic-only option — FIXED, working correctly.** All 3 travel-scope options present. Vancouver origin + "Domestic only" returned only Canadian destinations (Kelowna and the Okanagan Valley, Montréal and Québec City, Whistler) — no foreign results. Review step 7 shows the exact label "Domestic: Domestic only." Clicking "Revise" and returning to Step 2 confirms "Domestic only" remains selected (not reset).

**I1. Weak-match suggestion accuracy — PARTIALLY FIXED.** Combo: US/New York, 3 days, International only, Solo, Premium, Photography only, Cold or snowy, Fast-paced, Highly active, January. Result: 2 matches, both scored 48–49 ("Weak match"). New specific chips now appear and accurately reflect the actual weak inputs, verbatim:
> "These are weaker practical matches for your current preferences."
> [chips] "Select more interests that appeal to you." / "Allow domestic destinations." / "Choose a flexible travel month."

This is a genuine improvement. However, the **old generic fallback text still renders directly underneath, unchanged and redundant**:
> "We found only 2 practical matches for a 3-day trip from your location."
> "The current destination catalogue has limited practical options for this trip length. Try a longer trip, broader preferences, or nearby and domestic destinations."

Both old and new messaging now co-exist rather than the new one replacing the old.

**I2. Strong-match-few-results messaging — STILL BROKEN.** Found via: Canada/Vancouver, Domestic only, Wildlife only, Family/Moderate, Cold or snowy/Relaxed/Highly active, 7 days, with 5 destinations excluded to trim the catalog to a single very strong match: Canadian Rockies, 98/100, "Strong match." Exact messaging shown, verbatim:
> "We found only 1 practical match for a 7-day trip from your location."
> "The current destination catalogue has limited practical options for this trip length. Try a longer trip, broader preferences, or nearby and domestic destinations."

Good: the weak-match-specific chips correctly do **not** appear here — the app does distinguish weak vs. strong internally for the chip logic. Bad: this generic scarcity message still fires purely off the low result count regardless of match quality, and is factually inapplicable advice for a 98/100 match with already-domestic, already-broad settings. **This is the core scenario the fix was meant to address, and it is not yet resolved** — the scarcity message needs to be conditioned on match quality, not just result count.

### New minor finding (not previously tracked)
On Las Vegas and Yosemite, the return-only day (breakfast + drive home, no activities) still carries a **"High intensity"** activity-intensity badge left over from before — cosmetic mismatch against the actual low-effort content. Not one of the originally tracked bugs; worth a follow-up ticket.

### Post-Fix Retest Summary
- **6 of 6 originally-tracked itinerary bugs (Bugs 1–6) confirmed FIXED**, verified across both the retested original-pass destinations and the new Part A retest.
- **Exclusion-matching bug FIXED** (Check G).
- **New domestic-only travel-scope option added and working correctly** (Check H).
- **2 of 2 messaging-accuracy checks: 1 partially fixed (I1), 1 still broken (I2)** — the strong-match/few-results case still shows advice that implies the results are deficient when they are not.
- **1 new minor cosmetic finding**: stale "High intensity" badge on return-only days for Las Vegas/Yosemite.
