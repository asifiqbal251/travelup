# TravelUp Investigation Report — 5 QA Findings

**Date:** 2026-08-25
**App under test:** https://app.base44.com/apps/6a7ce8f29cef18f569162dc7/editor/preview (TravelUp), live preview commit `a9b7b8676e1982cac81b3370200e5b92f5e1457f` ("Update regional routes and image references")
**Trigger:** Root-cause investigation of 5 issues surfaced by the London/Beijing/Shanghai destination-batch QA retest (44 → 53 destinations).
**Method:** `git log`/`git show` history review, direct reading of `src/lib/scoring.js`, `src/lib/practicality.js`, `src/lib/itinerary.js`, `src/lib/regionalRoutes.js`, `src/lib/coordinates.js`, `base44/entities/Destination.jsonc`; live re-testing via Playwright MCP browser against the deployed preview; direct inspection of the Base44 editor's Data → Destination table (record-level field extraction via in-page JS evaluation); and review of the Base44 build agent's own chat/reasoning log for this batch.

**Key infrastructure note:** Destination *data* (names, day templates, tags, etc.) lives entirely in Base44's cloud entity store — it is **not** tracked in this git repo. Only application code (`src/lib/*.js`) and the entity *schema* (`base44/entities/Destination.jsonc`) are version-controlled. This matters for Issue 1 below: a data-level deletion leaves no git diff at all.

---

## Issue 1 — Istanbul & Cappadocia record deleted

**Root cause: a deliberate action taken by the Base44 build agent, triggered by a genuinely ambiguous line in the build instructions — not an accidental deletion, and not a code bug.** The agent chose the more destructive of two plausible readings and executed it without flagging the ambiguity back to the requester.

### Evidence

Git history shows no commit touches destination data — confirmed the only file changed in the batch's own commit is code:

```
$ git show a9b7b8676e1982cac81b3370200e5b92f5e1457f --stat
commit a9b7b8676e1982cac81b3370200e5b92f5e1457f
Author: base44-builder[bot] <245833847+base44-builder[bot]@users.noreply.github.com>
Date:   Tue Aug 25 08:06:05 2026 +0000

    Update regional routes and image references

 src/lib/regionalRoutes.js | 26 +++++++++++++++++++++++---
 1 file changed, 23 insertions(+), 3 deletions(-)
```

`git log --all --oneline -i --grep="istanbul"` returns zero matches — the deletion is a pure data-plane operation, invisible to git.

Live confirmation via the Data → Destination table: **53 records**, not the expected 54 (44 existing + 10 new). Searching "Istanbul" returns:

> "No records match. Try a different search or clear the filters."

The Base44 editor's own agent chat log contains the original build-spec instruction (written by whoever commissioned this batch), inside a checklist about naming/country-value consistency for the **new** destinations being added:

> "Part 3 — Naming/key consistency requirements (apply across the whole build)
> Every regional-route destination key must exactly match its final destination record name field. Do not create variant spellings... UK destinations: confirm and use the exact country value... China destinations: use "China" as country consistently. **No country value needed for Istanbul in this build — it's dropped.**"

The agent's own reasoning trace (visible in the same chat log) shows it read this as an instruction to delete the *existing* record, not merely to omit it from this batch's new-country-value checklist:

> "Istanbul exists (id ...0c1) — I'll delete it. Now let me see the full day_templates structure from a short-trip and a long-haul destination to match the pattern exactly."
>
> "Istanbul exists and will be deleted; Bath, Isle of Skye, and all others are new. The override convention stores the complete one-way door-to-door time..."
>
> "All 10 images generated and route file updated. Now I'll create the 10 destination records (in two batches) and delete Istanbul — all in parallel."
>
> (executed step) "**Removed Istanbul**" / "Created 5 UK-hub destinations" / "Created 5 more destinations"

**Why this reading looks like a misinterpretation:** the sentence sits inside a checklist item about confirming *country values for the destinations being added in this batch*. Read in that context, "No country value needed for Istanbul in this build — it's dropped" most plausibly means "Istanbul isn't one of the new additions, so skip it in this checklist" — not "delete the pre-existing live record." The agent chose the destructive interpretation.

### Recoverability

The `Destination` entity's `rls.delete` permission requires `role: admin` (confirmed in `base44/entities/Destination.jsonc`), meaning this was an authorized, deliberate delete call, not a permissions bypass — consistent with intentional-but-misguided agent action rather than a bug.

Base44's Version History retains checkpoints from before this batch:

```
Update regional routes and image references     (Current, 10 hours ago)
New Destinations and Updates                     (10 hours ago)
Executing Data Migration Tasks                   (10 hours ago)
Refine suggestion chip logic and update scarcity
  messaging and badge labels                      (14 hours ago)   ← pre-batch, Istanbul intact
...
```

The full original Istanbul record (name, country, region, day_templates, tags, etc.) can be retrieved from the 14-hours-ago checkpoint and manually recreated. This does **not** require a destructive full-app rollback — the older version can be inspected/exported without discarding the 10 new destinations.

### Fix scope
**Fixable in one consolidated build**: recreate the Istanbul & Cappadocia record from the pre-batch version-history snapshot, matching the current `Destination.jsonc` schema field-for-field.

---

## Issue 2 — Kelowna / Napa & Sonoma reported as "not surfacing in top-3"

**Root cause: this was a false positive in the prior QA retest — not a real regression.** Live re-testing with the exact baseline inputs reproduces the destinations correctly, in a ranking pattern that is identical to the pre-batch baseline.

### Evidence

`scoring.js` and `practicality.js` are untouched by this batch's commit (only `regionalRoutes.js` changed — see the `git show --stat` output under Issue 1). The regional-route override entries for both destinations are present and their `dest` keys match the live records' `name` fields exactly:

```js
// src/lib/regionalRoutes.js
{ country: "Canada", origin: "vancouver", dest: "kelowna and the okanagan valley", mode: "Drive", oneWayHours: 4.5 },
...
{ country: "United States", origin: "san francisco", dest: "napa and sonoma", mode: "Drive", oneWayHours: 1.5 },
```

Live Data-table lookups confirm exact name matches: Kelowna's `name` = `"Kelowna and the Okanagan Valley"` (`norm()` → `"kelowna and the okanagan valley"`), Napa & Sonoma's `name` = `"Napa and Sonoma"` (`norm()` → `"napa and sonoma"`). Both normalize to precisely the override keys.

Live re-test #1 — Kelowna (Vancouver origin, Food+Nature+Relaxation, 4 days, Couple/Moderate, Both domestic+international, No preference/Balanced/Moderate, no exclusions):

> "95/100 Strong match — Kelowna and the Okanagan Valley — HOW YOU'LL TRAVEL: Drive — TRAVEL TIME: About 4.5 hours each way — TIME AT DESTINATION: About 3.5 days"

Kelowna surfaced at **#1**, exact mode/time match.

Live re-test #2 — Napa & Sonoma (same inputs, San Francisco origin):

> "95/100 ... Kelowna and the Okanagan Valley ... About 5 hours each way"
> "88/100 ... Victoria ... Ferry, short flight or ground connections depending on origin ... About 5.2 hours each way"
> "88/100 ... Napa and Sonoma ... Drive ... About 1.5 hours each way"

Napa & Sonoma surfaced at **#3, 88/100**, exact mode/time match — with Kelowna #1/95 and Victoria #2/88 ahead of it.

This ranking shape (Kelowna 95 > Victoria 88 > Napa/Sonoma 88, tied 3rd) is **identical** to the pre-batch baseline documented in `test-report-v2.md`'s original test pass:

> "Test 7 — ... Napa/Sonoma (expected) — Route match: PASS (present in top 3, not ranked #1). Kelowna (95) and Victoria (88) outranked Napa/Sonoma (88, tied, listed 3rd)..."

i.e., this exact pattern predates the batch build entirely.

### Fix scope
**No fix needed — not a regression.** The prior QA fork's "FAIL" result was most likely caused by stale leftover state (e.g. a lingering exclusion, wrong day count, or wrong travel-scope selection) carried over from its own long-running session (400+ browser tool calls), not an actual app defect.

---

## Issue 3 — Beijing itinerary drops the Mutianyu Great Wall day

**Root cause: confirmed in `src/lib/itinerary.js`'s `selectTemplates()` — a real algorithmic side-effect of tag-overlap scoring under a constrained day budget, not a data or `flexible`-flag bug.**

### Evidence

Beijing's raw `day_templates` (pulled directly from the live Destination record; each field's `flexible` boolean confirmed via the record's edit form) are correctly authored:

| Template | interests tags | intensity | flexible |
|---|---|---|---|
| Forbidden City & Tiananmen | History and culture, Cities, Photography | Moderate | **false** |
| **Great Wall at Mutianyu** | Adventure, Hiking, History and culture | Active | **false** (primary) |
| Temple of Heaven & hutongs | History and culture, Cities, Food | Moderate | false |
| Summer Palace & lakes | History and culture, Nature, Photography | Moderate | false |
| Badaling Great Wall (alternate) | History and culture, Hiking | Moderate | **true** (optional) |

So the data is correct: Mutianyu is properly the non-flexible "primary" Great Wall day, Badaling the flexible alternate. Beijing's own `primary_interests` = `["History and culture", "Cities", "Photography"]`.

The itinerary-assembly logic in `src/lib/itinerary.js`:

```js
// Template selection: short trips prioritise signature days by interest match;
// longer trips keep route order.
function selectTemplates(activityTemplates, templateBudget, dest, prefs) {
  if (templateBudget <= 0) return [];
  const prim = dest.primary_interests || [];
  const userI = prefs.interests || [];
  if (templateBudget <= 4) {
    const scored = activityTemplates
      .map((t, idx) => {
        let s = 0;
        (t.interests || []).forEach((i) => {
          if (prim.includes(i)) s += 2;
          if (userI.includes(i)) s += 1;
        });
        return { t, idx, s };
      })
      .sort((a, b) => b.s - a.s || a.idx - b.idx);
    return scored.slice(0, templateBudget).map((x) => x.t);
  }
  return activityTemplates.slice(0, templateBudget);
}
```

And the long-haul day-budget allocation (Beijing's one-way time is ~21h, `tier = "long"`):

```js
// src/lib/itinerary.js, generateItinerary()
} else if (tier === "long") { startTravel = 1; arrival = 1; tailTravel = 2; }
const travelDays = startTravel + arrival + tailTravel; // = 4
...
let templateBudget = totalDays - travelDays - (paceWantsRecovery ? 1 : 0);
```

For a 7-day trip: `templateBudget = 7 − 4 = 3` — only **3 of Beijing's 4 non-flexible day templates fit**, so something must be dropped regardless of which scoring rule is used.

With the test's chosen interests — "History and culture / Cities / Photography (Adventure deliberately excluded)" — computing `selectTemplates()`'s score for each template (`+2` per tag in `primary_interests`, `+1` per tag in the user's selected interests):

| Template | Score | Reasoning |
|---|---|---|
| Forbidden City & Tiananmen | **9** | all 3 tags in both primary_interests (+2×3=6) and user interests (+1×3=3) |
| Temple of Heaven & hutongs | **6** | History and culture + Cities match primary (+4); History and culture + Cities match user (+2); Food matches neither |
| Summer Palace & lakes | **6** | History and culture + Photography match primary (+4); same match user (+2); Nature matches neither |
| **Great Wall at Mutianyu** | **3** | only History and culture matches primary (+2) and user (+1) — **Adventure/Hiking tags match neither**, since they were deliberately excluded from the test's interest selection |
| Badaling (alternate) | 3 | only History and culture matches (+2+1) |

Sorted descending, the top 3 are **Forbidden City, Temple of Heaven, Summer Palace** — Mutianyu (score 3, tied with the alternate Badaling) is cut, purely because its own authored tags (Adventure, Hiking) don't overlap with an interest set that intentionally excludes "Adventure" (per the test brief's own instruction: "History and culture/Cities/Photography, **NOT Adventure** as primary"). The selection algorithm has no separate concept of "this is the flagship/signature experience regardless of tag overlap" — it purely rewards tag-match density.

### Fix scope
**Fixable in one consolidated build.** Two independent options: (a) give templates that appear in `dest.primary_interests`-adjacent "signature" status a scoring boost independent of the exact user-interest overlap, or (b) increase the long-haul middle-day budget so a 7-day Beijing trip isn't forced to drop one of only 4 core days. Needs a product decision on which approach, but the mechanism is fully understood and localized to `selectTemplates()`.

---

## Issue 4 — Shanghai never surfaces in top-3

**Root cause: two independent, both-legitimate effects — not a Shanghai data defect.** Confirmed with live score breakdowns pulled directly from the app's "See score breakdown" UI.

### Evidence

**Effect 1 — a hard eligibility-gate cliff at trip lengths below 6 days.** `src/lib/scoring.js`:

```js
export function minUsableDays(tripDays) {
  if (tripDays <= 4) return 1.5;
  if (tripDays <= 7) return 2;
  if (tripDays <= 10) return 2.5;
  return 3;
}

export function isPractical(prac, tripDays) {
  if (!prac) return false;
  return prac.usableDestinationDays >= minUsableDays(tripDays);
}

export function rankDestinations(destinations, prefs) {
  const tripDays = Number((prefs && prefs.travelDays) || 0);
  return destinations
    .filter((d) => !isExcluded(d, prefs))
    .map((d) => ({ dest: d, practicality: assessPracticality(d, prefs) }))
    .filter((r) => isPractical(r.practicality, tripDays))   // ← gate applied BEFORE scoring/ranking
    ...
```

And `src/lib/practicality.js`'s tier-based usable-days calc for a `"long"` (>15h one-way) destination:

```js
if (tier === "fold") usableRaw = tripDays;
else if (tier === "partialFold") usableRaw = tripDays - 1;
else if (tier === "medium") usableRaw = tripDays - 2;
else usableRaw = tripDays - 4;   // "long" tier
```

Shanghai's one-way flight time from New York is ~22h (`tier = "long"`). At a **5-day** trip: `usableRaw = 5 − 4 = 1`, but `minUsableDays(5) = 2` → **`1 < 2`, so Shanghai is filtered out of the ranking entirely before scoring even runs** — regardless of how good its preference match is.

I confirmed this live: with identical inputs (New York, Cities+Food+Photography, Family, Comfortable, 5-day trip) Shanghai never appeared even after excluding 24 higher-ranked competing destinations one round at a time (New York City, Mexico City, Bogotá, Lima, San Diego, Montréal, Las Vegas, Lisbon & Porto, Kelowna, Amsterdam, Paris, Brussels & Bruges, Cartagena, Dublin, Yosemite, Victoria, Edinburgh, Whistler, Andalusia, Napa and Sonoma, Isle of Skye, Lake District, Salvador, Tofino — bottoming out at 60/100 "Bath" with Shanghai still absent). The moment the **same** questionnaire was re-submitted with trip length changed to **7 days** (all else identical, no exclusions), Shanghai appeared immediately in the top 3.

This is a genuine inconsistency: Shanghai's own `min_days = 4` field says a 4-day trip is content-valid, but the systemic practicality gate silently forbids *any* ~22h-flight destination from appearing on trips under 6 days — with no error message explaining why.

**Effect 2 — legitimate scoring competition at qualifying trip lengths.** Live "See score breakdown" at 7 days (after excluding New York City, Mexico City and Rio de Janeiro, which otherwise rank ahead of it):

> "89/100 Strong match — Shanghai — Travel fit: Manageable — Travel time: About 22.1 hours each way
> Season fit 20/25 · Interest match 25/25 · Budget fit 15/15 · Trip length 15/15 · Climate 10/10 · Pace, activity & traveller 10/10
> Base preference score **95** · Travel-practicality penalty **-6** · Final match score **89/100**"

Shanghai's *base* preference score (95, full marks on interest match) is actually **higher** than Beijing scores under its own comparable test — Shanghai's data is not the problem. It simply loses to New York City (92, domestic, ~0 penalty), Mexico City (92, 8.4h), Rio de Janeiro (92, 15.9h), Bogotá (90, 11.3h), and Buenos Aires (89, 17.9h) — all genuinely closer to a US-origin traveller than China, so they absorb a smaller `travelPenalty` for a similar or lower base score. This is the practicality-penalty design working as intended, not a bug.

### Fix scope
Effect 2 needs **no fix** (correct, intended behavior). Effect 1 (the eligibility cliff) is **fixable in one consolidated build** — e.g., reconcile a destination's declared `min_days` against what `minUsableDays`/`isPractical` will actually allow for its distance tier, or surface an explicit "not practical at this trip length" message instead of silent absence.

---

## Issue 5 — Dublin shows ~4.3h instead of ~1.5–2h

**Root cause: confirmed via exact formula reconstruction.** No regional-route override exists for Dublin (intentional — it's meant to rely on the flight-distance formula), so it falls through to `assessPracticality()`'s non-override path, which stacks a flat international-overhead constant on top of an otherwise-correct flight-time estimate.

### Evidence

`src/lib/coordinates.js`: `london: { lat: 51.51, lng: -0.13 }`. Dublin's `gateway_lat`/`gateway_lng` (from the live Destination record) = `53.3498, -6.2603`.

Haversine distance London↔Dublin ≈ **464 km**.

`src/lib/practicality.js`:

```js
function flightHours(distanceKm) {
  if (distanceKm == null) return null;
  return distanceKm / 800 + 0.75;
}
...
const DOMESTIC_OVERHEAD = 1.5;
const INTERNATIONAL_OVERHEAD = 2.5;
...
const internalAccess = isDomestic ? 0 : Number((dest && dest.internal_access_penalty) || 0);
const connectionHours = isDomestic ? 0 : Number((dest && dest.connection_hours) || 0);
...
const overhead = isDomestic ? DOMESTIC_OVERHEAD : INTERNATIONAL_OVERHEAD;
const routeConnection = distanceKm != null ? connectionBurden(distanceKm) : 4;
const oneWayHours = baseHours + overhead + connectionHours + routeConnection + internalAccess;
```

Dublin's live record fields: `internal_access_penalty = 0.5`, `connection_hours = 0`. Since the traveller's residence country (United Kingdom) ≠ Dublin's country (Ireland), `isDomestic = false`, so `INTERNATIONAL_OVERHEAD = 2.5` applies in full.

Plugging in the real numbers:

```
flightHours(464)     = 464/800 + 0.75        = 1.33h   (correctly models the real ~1h20 flight)
overhead              = INTERNATIONAL_OVERHEAD = 2.50h
connectionBurden(464) = 0h                     (distance < 4000km)
internal_access       = 0.50h
─────────────────────────────────────────────────────
oneWayHours           = 1.33 + 2.50 + 0 + 0.50 = 4.33h  → displays "About 4.3 hours each way"
```

This is an **exact match** to what QA observed live. The core problem: the formula applies the same flat 2.5h "immigration/customs" overhead to a 45-minute EU/Common-Travel-Area hop as it would to a genuine long-haul international arrival — there is no shorter-haul or CTA-aware overhead tier, and Dublin's own `internal_access_penalty` (0.5h) compounds it further.

### Fix scope
**Fixable in one consolidated build** — either (a) add a London→Dublin regional-route override consistent with the other 7 new UK-origin overrides (Paris, Edinburgh, Amsterdam, Bath, Lake District, Brussels & Bruges, Isle of Skye all already have one), or (b) reduce Dublin's `internal_access_penalty` and/or introduce a shorter international-overhead tier for close, low-friction international hops.

---

## Minor — stale "18 curated trips" homepage copy

Confirmed by direct grep, not further investigated (per scope):

```
src/pages/Landing.jsx:50   { icon: MapPinned, title: "Get three matched destinations", text: "We score 18 curated trips out of 100 and show exactly why each one fits you." },
src/pages/About.jsx:16     { icon: Globe, title: "Curated, not random", text: "18 diverse destinations scored transparently out of 100 against your answers." },
```

Both hardcode a literal "18" left over from a much earlier catalog size (now 53). Trivial one-line text fix in each file.

---

## Summary table

| # | Issue | Root cause type | Fix scope |
|---|---|---|---|
| 1 | Istanbul deleted | Agent misread an ambiguous build instruction | One build — recreate from version history |
| 2 | Kelowna/Napa-Sonoma "not surfacing" | False positive (stale QA test state) | No fix needed |
| 3 | Beijing drops Mutianyu | `selectTemplates()` tag-overlap scoring under constrained day budget | One build — needs a product decision on approach |
| 4 | Shanghai never surfaces | (a) eligibility-gate cliff below 6-day trips, (b) legitimate distance-based ranking | (a) one build, (b) no fix needed |
| 5 | Dublin shows 4.3h not ~1.5-2h | Flat international-overhead applied to a short EU/CTA hop | One build — override or overhead-tier fix |
