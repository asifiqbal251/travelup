# Build brief: Door 2 step 4, `fill.js` (activities on the skeleton)

**Date:** 22 Sep 2026
**Model / effort:** **Claude Opus, high effort, for the whole session.** Content selection is new logic whose mistakes look plausible: a repeated activity, a hike too soon at altitude, or a gap that gets padded. Those only show up when the output is checked carefully.
**Writer:** Claude Code is the single declared writer for this session (see `AGENTS.md`). Base44 and Codex stay read-only until you commit and report the hash.
**Builds on:** `4b7db18` (skeleton scheduler: route → schedule → validate, hidden harness at `/dev/door2?key=door2`). Rockstar live-tested that and approved the skeleton logic.
**What this adds:** the "fill" step. It puts one curated activity into each free-time (`open`) block of the skeleton, from a small per-place pilot content shelf. The calendar itself never changes.

---

## 0. Before you edit anything

1. `cd "$HOME/Documents/Codes and Simulation/travelup" && pwd`. The path must end in `/travelup`.
2. Run `/usr/bin/git fetch origin` then `/usr/bin/git status -sb`. `origin/main` should be `4b7db18` or later.
   - If the only newer remote commits are titled "Update base44 packages", run `/usr/bin/git pull --rebase`.
   - If you can't fetch over SSH, check `origin/main` over HTTPS the way you did last session.
   - If neither works, stop and ask Rockstar for the hash.
3. Confirm these exist:
   - `src/lib/door2/` (11 files, from `4b7db18`);
   - `docs/door2-fill/pilotContent.js`, written by Claude chat and untracked;
   - this brief at `docs/wherenova-door2-fill-brief.md`.

**Protected files: ZERO changes allowed.**

- `src/lib/scoring.js`, `practicality.js`, `itinerary.js`, `questionnaireFlow.js`, `multiDestItinerary.js`, `tripFit.js`, `storage.js`.
- `DoorB.jsx`, `TripDetail.jsx`, `TripProposal.jsx`.
- **New for this brief:** `src/lib/door2/schedule.js`, `route.js`, `pilotData.js`, `bufferRuleset.js`, `calendarConvention.js`, `scheduleConfig.js` and `failureStates.js`. Fill must not change the calendar. If you think it needs to, stop and report.

**Files you may create or change:**

| File | Action |
|---|---|
| `src/lib/door2/pilotContent.js` | **new: copy `docs/door2-fill/pilotContent.js` byte-for-byte.** Don't edit it. If you find a content error, report it; don't fix it silently. |
| `src/lib/door2/fill.js` | new |
| `src/lib/door2/validate.js` | **add** a new export `validateFilled`. Leave `validateSkeleton` exactly as it is. |
| `src/lib/door2/planner.js` | **add** a new export `buildFilledTrip`. `buildSkeletonTrip` stays exactly as it is. |
| `src/lib/door2/types.js` | additive typedef fields only (C5) |
| `src/pages/Door2Dev.jsx` | extend the harness (Part D) |
| `tests/door2/fill.test.js` | new |
| `docs/door2-fill/pilotContent.js`, this brief | commit both as they are |

All existing tests (31) must still pass unchanged. Don't edit `contracts.test.js` or `planner.test.js`.

---

## Part A: why this shape (context, don't re-litigate)

WhereNova's curated content is stored in **bundle-shaped** Base44 `Destination` records, such as "Cusco & Machu Picchu, Peru" and "Tokyo & Kyoto, Japan". The planner needs content attached to **individual places**. Claude chat checked the real records:

- "Cusco & Machu Picchu" is mostly Titicaca, Arequipa and Sacred Valley days. It has only one day about Cusco city itself.
- Ollantaytambo and Aguas Calientes have no standalone content.
- "Tokyo & Kyoto" has only 4 Tokyo-based days.

**Decision (Rockstar, 22 Sep 2026):**

- For the pilot, use a small, curated **per-place** content file with provenance back to its source bundle: `pilotContent.js`, 56 items.
- New content was written where none existed, so every Peru stop has real activities before fill is judged.
- **After the pilot is tested, the whole library moves to place-centric content ("Option B").** That is a separate project, not this brief.

The engine reads **only** `pilotContent.js`. No Base44/SDK calls from `src/lib/door2/`; the folder still imports nothing from outside itself.

---

## Part B: the content file (already written; copy it)

`docs/door2-fill/pilotContent.js` exports `PILOT_CONTENT_VERSION = 'pilot-content-v1'` and `PILOT_CONTENT`, a frozen array of 56 items. The item shape is documented in its header:

- `id`, `placeId`, `title`;
- `slots` ⊆ `['full', 'half', 'evening', 'short']`;
- `intensity` ∈ `Light | Moderate | High | Highly active`;
- `interests[]`, `summary`;
- `morning`, `afternoon`, `evening` (present whenever `slots` includes `'full'`);
- `foodNote?`, `arrivalFriendly?`, `minDayAtStop?`;
- `source`: `{kind: 'extracted', bundleId, bundleName, templateTitle, edited?}` or `{kind: 'authored', note}`.

Items per place:

| Place | Items |
|---|---|
| new_york | 13 |
| lima | 13 |
| cusco | 7 |
| ollantaytambo | 3 |
| aguas_calientes | 3 |
| machu_picchu | 1 |
| huaraz | 10 |
| tokyo | 6 |

**Tokyo is deliberately thin.** A 10-day Tokyo trip must come out with visible gaps; that is the pilot's `content_insufficient` test case.

---

## Part C: the engine

### C1. `fill.js`: `fillTrip(trip, spec, content = PILOT_CONTENT)`

This is a **pure function.** It returns a new Trip, never mutates its input, uses no randomness and no `Date.now()`, and gives identical output for identical input.

1. **Order.** Walk `trip.days` in order, and each day's `blocks` in their existing order. Only blocks with `type === 'open'` are filled. That includes excursion site blocks such as `ex:pc_aguas:machu_picchu:site`, whose `placeId` is `machu_picchu`.

2. **Slot class** of an open block. Here `startHour` is `startTime` "HH:MM" as decimal hours.
   - `full` if `durationHours >= 8`;
   - else `evening` if `startHour >= 17`;
   - else `half` if `durationHours >= 3`;
   - else `short`.

   Accepted item slots per class:

   | Block class | Item slots accepted |
   |---|---|
   | full | full |
   | half | half |
   | evening | evening |
   | short | short, half |

3. **Stop context.**
   - `stopId = block.anchor.stopId`.
   - **Arrival day of a stop** = `transport.arriveDayNumber` of the inbound route leg. That's the travel block whose `id` starts with `tr:` and whose `anchor.stopId` is that stop; travel blocks anchor to their destination stop by the scheduler's convention. Take the minimum if there's more than one. `ex:` excursion legs don't count.
   - `dayOffset = day.dayNumber - arrivalDay`.
   - `isFirstAtStop` = this is the first open block encountered (in walk order) with that `anchor.stopId`, whatever its `placeId`.

4. **Eligible items:**
   - `item.placeId === block.placeId`;
   - not already used anywhere in this trip. **No item is ever used twice in one trip**, including across Lima's separate stays;
   - `item.slots` intersects the accepted slots;
   - `(item.minDayAtStop ?? 0) <= dayOffset`. This is altitude safety; for example, Humantay and Laguna 69 only come from the 3rd day at the stop.

5. **Score:**

   ```
   score = 2 × |item.interests ∩ spec.interests|
         + paceScore
         + (isFirstAtStop && item.arrivalFriendly ? 5 : 0)
   ```

   Pace is normalised case-insensitively:

   | Pace input | Treated as | paceScore |
   |---|---|---|
   | `relaxed` | relaxed | +1 for `Light`, −2 for `High` / `Highly active` |
   | `fast-paced`, `fast`, `packed` | fast | +1 for any intensity other than `Light` |
   | anything else (`balanced`, `moderate`, missing) | neutral | 0 |

   Pick the highest score. **Break ties by position in `PILOT_CONTENT`** (earlier wins).

6. **Filled block.** Keep the **same `id`, `startTime`, `durationHours`, `placeId` and position**. Identity must survive for future editing. Set:
   - `type: 'activity'`;
   - `anchor: {...anchor, contentId: item.id}`;
   - `activity: {templateId: item.id, title, slot, summary, intensity, interests, foodNote?, morning?, afternoon?, evening?}`. Include morning, afternoon and evening **only when slot is `full`**;
   - `provenance: {source: 'curated', reviewed: false, confidence: item.source.kind === 'extracted' ? 'high' : 'medium', content: item.source}`.

7. **No eligible item: a gap.** Never repeat, never pad, never borrow another place's content. The block **stays `type: 'open'`** with `generationStatus: 'unavailable'` and `gap: {reason: 'no_eligible_content', slot}`.

8. **Trip-level result.**
   - `contentGaps: [{blockId, dayNumber, placeId, slot}]`, which is empty if none.
   - If there are any gaps: `status: 'incomplete'`, and `'content_insufficient'` is appended to `warnings`.
   - Otherwise status is unchanged from the skeleton (`'draft'` on draft data, `'valid'` when everything is reviewed).
   - `versions.content = PILOT_CONTENT_VERSION`.
   - The Trip `id` is unchanged.

Export `classifySlot(block)` and `normalisePace(pace)` too, so tests can pin them.

### C2. `validate.js`: new export `validateFilled(filledTrip, skeletonTrip, spec, content)`

This is an **independent** re-check. Don't import `fill.js` internals. Violations **throw**, because they are engine bugs.

- **Calendar untouched:**
  - same day count;
  - each day has the same block ids, in the same order, with the same `startTime`, `durationHours` and `placeId` as the skeleton;
  - every non-`open` skeleton block is deep-equal to its filled counterpart.
- Every skeleton `open` block is now either an `activity` block or a gap (`open` + `generationStatus: 'unavailable'` + `gap`).
- **No `contentId` appears twice.** Every activity's item exists in `content`, and `item.placeId === block.placeId`.
- Every activity's item slots accept the block's slot class (recompute the class independently).
- `minDayAtStop` is respected (recompute arrival days independently from the travel blocks).
- `contentGaps` exactly matches the gap blocks.
- `status` is `'incomplete'` if and only if there are gaps.

It returns `makeSuccess({warnings})`.

### C3. `planner.js`: new export `buildFilledTrip(spec, data = PILOT_DATA, options = {})`

1. `skeleton = buildSkeletonTrip(spec, data, options)`. If it's a FailureResult, **return it unchanged** (same object shape as the skeleton failure).
2. `filled = fillTrip(skeleton, spec, options.content ?? PILOT_CONTENT)`.
3. `validateFilled(filled, skeleton, spec, content)`.
4. Return `filled`.

### C4. Things fill must never do

- Change the calendar.
- Reorder blocks.
- Change travel, rest or excursion travel blocks.
- Fill a `rest` block.
- Pull content for a different place.
- Reuse an item.
- Mark pilot content as reviewed.
- Call Base44.

### C5. `types.js` (additive only)

- **ContentItem** typedef (per the Part B shape).
- On **BlockActivity**: `slot`, `summary`.
- On **Block**: optional `gap: {reason, slot}`.
- On **Provenance**: optional `content` (the item's `source`).
- On **Trip**: `contentGaps`.

---

## Part D: harness (`/dev/door2?key=door2`)

It's still a test instrument: plain styling, no design work. It gets deleted when the real Door 2 screen ships.

**Add these controls:**

- "Fill activities" toggle, on by default. On calls `buildFilledTrip`; off calls `buildSkeletonTrip`.
- Pace select: Relaxed / Balanced / Fast-paced.
- Interests multiselect: Cities, Food, History and culture, Photography, Nature, Hiking, Adventure, Beaches, Relaxation, Wildlife.
- Fixture presets for G5 (Tokyo 10 days), G7 (Peru 10 days, Hiking) and G10 (Tokyo 7 days, Relaxed).

**How to render:**

- **Activity blocks:**
  - title (bold) + slot + intensity;
  - summary;
  - morning / afternoon / evening lines when the slot is full;
  - foodNote;
  - a small source tag: "from *Lima*" for extracted items, "pilot-written" for authored ones.
- **Gap blocks:** amber "No curated activity left for this slot yet", plus the slot.
- **Trip summary:**
  - status (incomplete in amber);
  - gap count;
  - `versions.content`.
- **Extend the draft banner:** "Pilot activities are unreviewed. Tokyo intentionally runs out after about 6 days."

---

## Part E: tests (`tests/door2/fill.test.js`)

All tests use `reviewPolicy: 'allow_drafts'`, `travelMonth: 10`, `travellerType: 'couple'` and `budget: 'mid'`. Unless a row says otherwise, `pace` is `'balanced'` and `interests` is `[]`. This is the same spec helper as `planner.test.js`.

These expectations were **derived independently in chat** by running these exact rules against the real `4b7db18` scheduler output and `pilotContent.js`. If yours differ, **don't edit the expectation to match.** Work out which side is wrong and report it.

Each row lists the day, the local start time, then the chosen item id, or GAP.

| # | Spec | Expected |
|---|---|---|
| G1 | NYC, 7 days | D2 `nyc_midtown` · D3 `nyc_central_park_museums` · D4 `nyc_lower_manhattan` · D5 `nyc_statue_brooklyn` · D6 `nyc_brooklyn_neighbourhoods`. 0 gaps, status `draft`. |
| G2 | Peru, 10 days | see the G2 detail below. 0 gaps. |
| G3 | Peru, 12 days, required `[huaraz, machu_picchu]` | see the G3 detail below. 0 gaps. |
| G4 | Tokyo, 7 days | D2 16:21 half `tyo_shinjuku` · D3 `tyo_asakusa` · D4 `tyo_meiji_shibuya` · D5 `tyo_nikko` · D6 `tyo_ueno_yanaka`. 0 gaps. |
| G5 | Tokyo, 10 days | D2–D6 as G4, then D7 `tyo_tsukiji_ginza`. **D8 and D9 are GAP** (`op:tokyo_base:d6`, `op:tokyo_base:d7`). `status: 'incomplete'`, `warnings` includes `content_insufficient`, `contentGaps.length === 2`, and the gap blocks are `type: 'open'` + `generationStatus: 'unavailable'`. |
| G6 | Peru, 14 days | see the G6 detail below. 0 gaps. |
| G7 | Peru, 10 days, interests `['Hiking']` | D5 `cusco_pisac` · D6 `cusco_humantay`. Humantay first becomes eligible at dayOffset 2. The rest is as G2. |
| G8 | Peru, 10 days, interests `['Adventure']` | D3 `lima_lunahuana`. D6 `cusco_humantay`. |
| G9 | Peru, 16 days, required `[huaraz, machu_picchu]`, interests `['Hiking']` | D5 `huz_wilcacocha` (offset 1) · D6 `huz_laguna69` (offset 2, never earlier). |
| G10 | Tokyo, 7 days, pace `relaxed` | `tyo_shinjuku`, `tyo_ueno_yanaka`, `tyo_tsukiji_ginza`, `tyo_asakusa`, `tyo_meiji_shibuya`. **No Nikko.** With pace `Fast-paced`, the result is identical to G4. |
| G11 | Peru, 5 days | `buildFilledTrip` returns a FailureResult `deepStrictEqual` to `buildSkeletonTrip`'s (`duration_too_short`). |
| G12 | G2, G3, G6 | Calendar untouched: for every day, block ids/order/startTime/durationHours/placeId are equal to the skeleton's. Non-open blocks are deep-equal. |
| G13 | G2 twice, plus a JSON round-trip | `deepStrictEqual` (determinism; reopen shows the same plan). |
| G14 | `PILOT_CONTENT` integrity | ids are unique; every `placeId` is in `PILOT_PLACES`; slots and intensity values are valid; full-slot items have morning/afternoon/evening; every item has a summary and a source; the version is `pilot-content-v1`. |
| G15 | Slot classification | `{12h, 09:00}` gives full · `{7.99h, 09:00}` half · `{3.15h, 17:51}` evening · `{2.1h, 18:54}` evening · `{2.5h, 10:00}` short · `{8h, 18:00}` full. `normalisePace('Relaxed')` gives relaxed, and `'Fast-paced'` gives fast. |
| G16 | `validateFilled` catches tampering | Each of these must throw: (a) the same item used on two blocks; (b) an activity whose item is for another place; (c) `cusco_humantay` placed at dayOffset 1; (d) a changed `startTime` on a travel block; (e) status `draft` while a gap exists. |

**G2 detail (Peru, 10 days):**

- D2 09:00 half `lima_miraflores`
- D3 full `lima_historic_centre`
- D4 14:00 half `cusco_acclimatise`
- D5 full `cusco_market_san_blas`
- D6 full `cusco_sacsayhuaman`
- D7 14:45 half **`mp_citadel`** (on `ex:pc_aguas:machu_picchu:site`)
- D8 18:54 evening `lima_magic_water`

**G3 detail (Peru + Huaraz + Machu Picchu, 12 days):**

- D2 `lima_miraflores`
- D3 `lima_historic_centre`
- D4 17:51 evening `huz_first_evening`
- D5 `huz_acclimatise`
- D6 17:51 evening `lima_magic_water`
- D7 `cusco_acclimatise`
- D8 `cusco_market_san_blas`
- D9 `mp_citadel`
- D10 18:54 evening `lima_ceviche_evening`

Lima's three stays use four different items.

**G6 detail (Peru, 14 days):**

- D2 `lima_miraflores`
- D3 `lima_historic_centre`
- D4 `lima_barranco`
- D5 14:00 `cusco_acclimatise`
- D6 `cusco_market_san_blas`
- D7 `cusco_sacsayhuaman`
- D8 `cusco_pisac`
- D9 11:03 full `olly_fortress_town`
- D10 12:42 `mp_citadel`
- D10 17:33 evening `agc_hot_springs`
- D11 full `agc_mandor`
- D12 18:54 evening `lima_magic_water`

---

## Part F: finish and verify (paste actual output for each)

1. `git diff --stat`. Only files from the §0 table. PASS/FAIL.
2. Protected files show zero changes. Include the newly protected scheduler files. PASS/FAIL.
3. `cmp docs/door2-fill/pilotContent.js src/lib/door2/pilotContent.js` shows no difference. PASS/FAIL.
4. `npm run test:door2`. All old tests (31) plus the new ones pass. Paste the summary. PASS/FAIL.
5. `npm run lint && npm run build`. Both clean. PASS/FAIL.
6. **Local browser check** on `/dev/door2?key=door2`:
   - Run G2, G3, G5 and G10.
   - Screenshot G2 and G5.
   - Confirm the fill toggle off shows the old skeleton.
   - Confirm `/find` still builds a trip the old way.
   - PASS/FAIL.
7. **Print G2 and G5 as plain text** in your report, one line per block, with titles. Rockstar will judge them by eye.
8. Commit (don't push):

```
Door 2 fill step: per-place pilot content and activity filling

Adds fill.js, which puts one curated activity into each free-time block of
the skeleton without touching the calendar: slot-sized, no repeats per trip,
interest- and pace-aware, altitude-safe (minDayAtStop), and honest about
gaps (status 'incomplete' + content_insufficient, never padding). Content
comes from a temporary per-place pilot shelf (pilotContent.js, 56 items,
with provenance back to the Base44 bundles it came from) pending the
planned move to place-centric content. No protected or scheduler file
touched.
```

9. Report back with:
   - the commit hash;
   - the checklist results;
   - the G2 and G5 text;
   - any expectation you believe is wrong, with your reasoning;
   - anything you had to decide that this brief didn't specify.

   Then hand off: Rockstar pushes, **manually rebuilds on Base44** (a push alone doesn't go live), and tests on the live site.

---

## Explicitly out of scope

- Swapping, pinning or undoing activities; `spec.choices` is ignored for now. That's the next brief, "bounded edits".
- The real Door 2 screen.
- Migrating the content library to place-centric content (Option B, after the pilot).
- Seasonality, opening hours, Machu Picchu ticket slots, and meals as separate blocks.
- Weather.
- AI-generated content.
- Reviewing the connection data or the content. Both stay `reviewed: false`, and production still requires `strict`.
