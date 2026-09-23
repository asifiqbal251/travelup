# Build brief: Door 2 Step 3, skeleton scheduler (plus landing the Step 2 contracts)

**Date:** 22 Sep 2026
**Model / effort:** **Claude Opus, high effort.** Use it for the whole session. This is the riskiest logic in the Door 2 redesign: it is new, it reasons about feasibility, and it has to be right about time. Don't downgrade partway through.
**Writer:** Claude Code is the single declared writer for this session (see `AGENTS.md`). Base44 and Codex stay read-only until you commit and report the hash.
**Severity:** New feature (foundation). Nothing user-facing changes except one hidden dev page (Part D).

Design context, already decided (don't re-litigate): Door 2 is being rebuilt as one home-to-home calendar in the order **route → schedule → fill**. This brief builds **route + schedule + validate only**, which is the "skeleton". Activities (`fill.js`), editing and the real Door 2 UI come later.

---

## 0. Before you edit anything

1. `cd "$HOME/Documents/Codes and Simulation/travelup" && pwd`. The path must end in `/travelup`.
2. Run `/usr/bin/git fetch origin` then `/usr/bin/git status -sb`. Local `main` was last seen at `aa72d6a`. `origin/main` is expected at `2ea2fce` ("Update base44 packages") or later. If the only new remote commits are titled "Update base44 packages", run `/usr/bin/git pull --rebase`. **If you can't fetch, stop and ask Rockstar for the current `origin/main` hash.** Don't proceed on an unverified checkout.
3. Confirm `src/lib/door2/` **does not exist yet**. The Step 2 contracts were written up in a brief but were never committed to this repo. Part A of this brief lands them. If the folder does exist, stop and report what's in it.

**Protected files: ZERO changes allowed.** These are `src/lib/scoring.js`, `src/lib/practicality.js`, `src/lib/itinerary.js`, `src/lib/questionnaireFlow.js`, `src/lib/multiDestItinerary.js`, `src/lib/tripFit.js` and `src/lib/storage.js`. Also no changes to `DoorB.jsx`, `TripDetail.jsx`, `TripProposal.jsx` or any existing page. Travel Fit (Door 1) and the current Door 2 path must behave exactly as they do today.

**Files you may create or change:**

| File | Action |
|---|---|
| `src/lib/door2/types.js` | new (Part A) |
| `src/lib/door2/bufferRuleset.js` | new (Part A) |
| `src/lib/door2/placeIntegrity.js` | new (Part A) |
| `src/lib/door2/failureStates.js` | new (Part A) |
| `src/lib/door2/calendarConvention.js` | new (Part A) |
| `src/lib/door2/pilotData.js` | new (Part B) |
| `src/lib/door2/scheduleConfig.js` | new (Part C) |
| `src/lib/door2/route.js` | new (Part C) |
| `src/lib/door2/schedule.js` | new (Part C) |
| `src/lib/door2/validate.js` | new (Part C) |
| `src/lib/door2/planner.js` | new (Part C) |
| `src/pages/Door2Dev.jsx` | new (Part D) |
| `src/App.jsx` | **one import and one `<Route>` line only** (Part D) |
| `tests/door2/*.test.js` | new (Part E) |
| `package.json` | add one script only: `"test:door2": "node --test tests/door2/"` |
| this brief (`docs/wherenova-door2-scheduler-brief.md`) | commit it alongside the work |

If you find you need anything outside this table, **stop and report**. Don't expand scope.

Nothing in `src/lib/door2/` may import from outside `src/lib/door2/`. JSDoc `@typedef {import(...)}` references are the only exception.

---

## Part A: land the contracts (Step 2, never committed)

### A1. `types.js`: JSDoc typedefs only, ending in `export {};`

Write these typedefs with a short comment on each field. This is contracts v5 from the design docs, plus **additive** fields this scheduler needs (marked ➕).

- **Place**: `id`, `name`, `aliases: string[]`, `countryId`, `coordinates: {lat, lng}`, `visitKind: 'base'|'gateway'|'attraction'`, ➕ `utcOffsetHours: number`. The pilot uses fixed offsets and does not model DST (known ≤1h error, flagged). A Place never carries an airport; gateways live on the Connection.
- **ConnectionSegment**: `mode`, `inVehicleHours`, `typicalRangeHours?: {min, max}`.
- **Connection**: `id`, `fromPlaceId`, `toPlaceId`, `mode` (see the enum below), `inVehicleHours` (must equal the sum of `segments` when segments are present), `segments?`, `layoverHours?` (time *between* segments only), `typicalRangeHours?` (display only, never read by the engine), `gatewayId?` (e.g. `"NRT"`), `processingProfile?` (e.g. `"US_preclearance"`, never traveller-eligibility wording), `localTransferHours?: {origin, destination}`, `direction: 'bidirectional'|'oneway'`, `gatewayRequirements`, `assumptions`, `sources: string[]`, `reviewedBy: string|null`, `reviewedAt: string|null`, `version`.
  - Mode enum: `'flight_international'|'flight_domestic'|'train'|'road_private_transfer'|'coach_scheduled'|'local_shuttle'|'ferry'`.
- **BufferRuleset**: `id`, `modes: {[mode]: {preHours, postHours}}`, `localTransferDefault: {eachEndHours}`.
- ➕ **RoutePackageStop**: `id` (authored and stable, e.g. `"pc_cusco"`, never an array index), `placeId`, `minNights`, `maxNights`, `excursions: {placeId, connectionId, hoursOnSite}[]`.
  - `nights: 0` means pass-through: the traveller changes transport there and doesn't stay.
- **RoutePackage**: `id`, `name`, ➕ `countryId`, ➕ `stops: RoutePackageStop[]` (the ordered journey **including the return path**, e.g. back through Cusco and Lima; the origin is implicit at both ends), `placeIds: string[]` (derived: every stop and excursion place), `visitRules: {minNights, maxNights, extensions: string[]}` (kept for v5 compatibility, not read by the scheduler), `reviewed: boolean`, ➕ `preferredGatewayId?`.
- **RouteResult**: `source: 'authored'|'composed'`, `routePackageId`, `stops: {id, placeId, nights, minNights, maxNights, isRequired, excursions}[]`, `connectionIds: string[]` (one per leg: origin→first stop, stop→stop, last stop→origin), ➕ `usesDraftData: boolean`.
- **TripSpec** (as v5): `originPlaceId`, `travelMonth`, `startDate?`, `endDate?`, `totalDays`, `travellerType`, `interests`, `pace`, `budget`, `requiredPlaceIds`, `routeTemplateId`, `stops`, `choices`. Plus ➕ `destination: {kind: 'place'|'country', id: string}`. This is the traveller's "going to", which v5 had no field for.
- **TripSpecStop**, **TripSpecChoices**: as v5 (`id, placeId, placeSource, nights, isRequired` and `pinned/rejected/placed`).
- **FailureStateName**: the six names below. **FailureResult**: `{ok: false, state, message, options: FailureOption[], detail?}`. **FailureOption**: `{action, detail, ...extra}`.
- **Day**: `{id, dayNumber, blocks: Block[]}`.
- **Block**: as v5. Fields: `id`, `type: 'travel'|'activity'|'meal'|'rest'|'free'|'open'`, `anchor: {stopId, contentId}`, `placeId`, `startTime` ("HH:MM", local time at `placeId`, or at the departure place for travel), `durationHours`, `activity?`, `transport?`, `provenance`, `generationStatus`, `userEdited`, `locked`, `liveData?`.
- **BlockTransport**: `connectionId`, `mode`, `inVehicleHours`, `layoverHours?`, `bufferRulesetId`, `bufferRulesetVersion`, `computedUsableTimeLost`, `estimated`. Plus ➕ `fromPlaceId`, `toPlaceId`, `gatewayId?`, `overnight: boolean`, `arriveDayNumber`, `arriveTime`.
- **Provenance**: `{source: 'curated'|'generated'|'user'|'external', reviewed, confidence, generation?}`.
- **Trip**: `{id, status: 'draft'|'valid'|'conflict'|'incomplete', spec, days, versions: {engine, schema, content, routeData, bufferRuleset}, history}`.

### A2. `bufferRuleset.js`: exactly this, plus the reverse-direction helper

```js
/** @typedef {import('./types.js').BufferRuleset} BufferRuleset */
/** @typedef {import('./types.js').Connection} Connection */

// Three kinds of time, never merged:
//  - in-vehicle time (per segment)
//  - layover time (between segments)
//  - pre/post allowances (this ruleset, true origin/destination only)
// Buffer is combined with transport time ONLY here, at request time. It is
// never stored on a Connection row.

/** @type {BufferRuleset} */
export const DEFAULT_BUFFER_RULESET = {
  id: "buffer_ruleset_v2",
  modes: {
    flight_international: { preHours: 2.5, postHours: 1.0 },
    flight_domestic: { preHours: 1.5, postHours: 0.5 },
    train: { preHours: 0.5, postHours: 0.25 },
    road_private_transfer: { preHours: 0.1, postHours: 0.1 },
    coach_scheduled: { preHours: 0.25, postHours: 0.25 },
    local_shuttle: { preHours: 0.1, postHours: 0.1 },
    ferry: { preHours: 0.25, postHours: 0.25 }
  },
  localTransferDefault: { eachEndHours: 0.5 }
};
export const BUFFER_RULESET_VERSION = 2;

export function computeElapsedTravelHours(connection) {
  const segmentHours =
    connection.segments && connection.segments.length > 0
      ? connection.segments.reduce((sum, s) => sum + s.inVehicleHours, 0)
      : connection.inVehicleHours;
  return segmentHours + (connection.layoverHours ?? 0);
}

export function computeUsableTimeLost(connection, ruleset = DEFAULT_BUFFER_RULESET) {
  const modeRule = ruleset.modes[connection.mode];
  if (!modeRule) {
    throw new Error(`computeUsableTimeLost: no buffer rule for mode "${connection.mode}" in ruleset "${ruleset.id}"`);
  }
  const localOrigin = connection.localTransferHours?.origin ?? ruleset.localTransferDefault.eachEndHours;
  const localDestination = connection.localTransferHours?.destination ?? ruleset.localTransferDefault.eachEndHours;
  return computeElapsedTravelHours(connection) + modeRule.preHours + modeRule.postHours + localOrigin + localDestination;
}

/**
 * Returns the connection as seen travelling fromPlaceId -> toPlaceId.
 * For a bidirectional row used in reverse, it swaps from/to AND swaps
 * localTransferHours.origin/destination. Returns a new object and never
 * mutates the catalogue row. Returns null if the row doesn't serve this
 * direction.
 */
export function orientConnection(connection, fromPlaceId, toPlaceId) { /* implement */ }
```

### A3. `placeIntegrity.js`

It exports two functions:

- `assertConnectionPlacesResolve(connection, placesById)` throws if `fromPlaceId` or `toPlaceId` is not in `placesById`. `placesById` may be a `Map` or a plain object.
- `assertPlaceCanBeOvernightBase(place)` throws if `place.visitKind === 'attraction'`.

Both **throw**; neither ever returns false. Their error messages must name the offending id.

### A4. `failureStates.js`

```js
export const FAILURE_STATES = Object.freeze({
  DESTINATION_NOT_COVERED: 'destination_not_covered',
  ROUTE_NOT_SUPPORTED: 'route_not_supported',
  DURATION_TOO_SHORT: 'duration_too_short',
  REQUIRED_PLACE_CONFLICT: 'required_place_conflict',
  CONNECTION_UNREVIEWED: 'connection_unreviewed',
  CONTENT_INSUFFICIENT: 'content_insufficient'
});
```

It also exports:

- `DEFAULT_MESSAGES`: one plain-language sentence per state.
- `makeFailure(state, options, {message, detail} = {})` returns `{ok:false, state, message, options, detail}`. It **throws** on an unknown state, and on missing or empty `options`. Every failure offers at least one concrete way forward.
- `makeSuccess(value)` returns `{ok:true, value}`.

### A5. `calendarConvention.js`

Write the convention as a header comment and implement it:

- **Trip days are counted departure-day through home-arrival-day, inclusive.** "10 days" means Day 1 is the day the traveller leaves home and Day 10 is the day they arrive home.
- **Day numbers follow the local calendar date where the traveller is.** A block belongs to the day on which it starts, in local time at its place. For travel, that is the departure place.
  - Crossing the date line is therefore handled naturally. For example, Vancouver→Tokyo departs Day 1 and lands Day 2 local. Tokyo→Vancouver departs Day 7 and lands Day 7 Vancouver time.
- Engine time is an **absolute timeline**: hours since 00:00 on Day 1, in the origin's local time. `localHours(abs, place) = abs + (place.utcOffsetHours - origin.utcOffsetHours)`. `dayNumber = floor(localHours / 24) + 1`.
- `isOvernightBlock({startHourOfDay, durationHours})` returns true when the interval `(start, start + duration]` contains 02:00 of any day. That means hours 26, 50, and so on, plus 2 when start < 2. So `{23, 3}` returns true, and `{9, 15.75}` returns false.
  - The scheduler marks a travel block overnight if this is true **in either** the departure place's local clock **or** the arrival place's local clock. In plain words: the traveller is in transit at 2 a.m. somewhere, so they sleep on the plane or bus.
- `formatClock(hoursLocal)` returns "HH:MM", rounded to the nearest minute.

---

## Part B: `pilotData.js` (pilot fixtures, draft data)

Export `PILOT_PLACES` (keyed by id), `PILOT_CONNECTIONS` (array) and `PILOT_ROUTE_PACKAGES` (array), plus a `PILOT_DATA_VERSION = 'pilot-catalogue-v2'`. Every connection keeps `reviewedBy: null, reviewedAt: null`. **These are drafts, and the code must treat them as drafts** (see the review policy in Part C).

**Places** (`visitKind` is `base` unless noted):

| id | name | countryId | coordinates | utcOffsetHours |
|---|---|---|---|---|
| `vancouver` | Vancouver | CA | 49.28, -123.12 | -7 |
| `new_york` | New York | US | 40.71, -74.01 | -4 |
| `lima` | Lima | PE | -12.05, -77.04 | -5 |
| `cusco` | Cusco | PE | -13.53, -71.97 | -5 |
| `ollantaytambo` | Ollantaytambo | PE | -13.26, -72.26 | -5 |
| `aguas_calientes` | Aguas Calientes | PE | -13.15, -72.52 | -5 |
| `machu_picchu` | Machu Picchu (**attraction**) | PE | -13.16, -72.55 | -5 |
| `huaraz` | Huaraz | PE | -9.53, -77.53 | -5 |
| `tokyo` | Tokyo | JP | 35.68, 139.69 | 9 |
| `ljubljana` | Ljubljana (no package; uncovered-destination fixture) | SI | 46.05, 14.51 | 2 |

**Connections:** copy these 8 rows **exactly** from the pilot catalogue v2, including `sources`, `assumptions`, `typicalRangeHours`, `gatewayId`, `processingProfile`, `version: 2` and the null review fields:

| id | from→to | mode | inVehicleHours | segments / layover | localTransferHours (origin, destination) | other |
|---|---|---|---|---|---|---|
| `conn_yvr_nyc_air` | vancouver→new_york | flight_international | 5.4 | none | 0.5, 0.85 | `processingProfile: "US_preclearance"` |
| `conn_yvr_lim_air` | vancouver→lima | flight_international | 11.2 | segments 4.6 + 6.6, layover 1.5 | 0.5, 0.75 | range 10.9–13.5 |
| `conn_yvr_tokyo_air_nrt` | vancouver→tokyo | flight_international | 10.1 | none | 0.5, 1.25 | `gatewayId: "NRT"`, range 9.8–10.5 |
| `conn_lim_cuz_air` | lima→cusco | flight_domestic | 1.25 | none | 1.0, 0.75 | range 1.25–1.5 |
| `conn_cuz_olly_road` | cusco→ollantaytambo | road_private_transfer | 1.5 | none | 0.25, 0.1 | range 1.5–2.5 |
| `conn_olly_agc_train` | ollantaytambo→aguas_calientes | train | 1.75 | none | 0.25, 0.1 | range 1.75–2.0 |
| `conn_agc_mp_shuttle` | aguas_calientes→machu_picchu | local_shuttle | 0.45 | none | 0.1, 0.1 | range 0.4–0.5 |
| `conn_lim_huz_coach` | lima→huaraz | coach_scheduled | 8.0 | none | 0.25, 0.1 | range 7.5–8.5 |

All rows are `direction: 'bidirectional'`.

Data note to carry into the file header: with its own `localTransferHours`, Vancouver→Lima's usable time lost is **15.75h** (11.0 elapsed + 2.5 + 1.0 + 0.5 + 0.75). The docs' "15.5h" figure used the default 0.5/0.5 transfers. The code is right; the doc number is stale.

**Route packages** (stops in order; the origin is implicit at both ends):

| Package id | Country | Stops, as `stopId: placeId minNights–maxNights` |
|---|---|---|
| `nyc_city` | US | `nyc_base: new_york 2–10` |
| `tokyo_city` | JP | `tokyo_base: tokyo 3–10`. Set `preferredGatewayId: 'NRT'`. |
| `peru_classic` | PE | see list below |
| `peru_classic_huaraz` | PE | see list below |

`peru_classic` stops:

1. `pc_lima_in`: lima 1–3
2. `pc_cusco`: cusco 2–4 (the minimum is 2 nights for altitude acclimatisation; note it in `assumptions`)
3. `pc_sacred_valley`: ollantaytambo 0–1
4. `pc_aguas`: aguas_calientes 1–2, with excursion `{placeId: 'machu_picchu', connectionId: 'conn_agc_mp_shuttle', hoursOnSite: 4}`
5. `pc_olly_return`: ollantaytambo 0–0
6. `pc_cusco_return`: cusco 0–0
7. `pc_lima_out`: lima 1–1

`peru_classic_huaraz` stops:

1. `ph_lima_in`: lima 1–2
2. `ph_huaraz`: huaraz 2–4
3. `ph_lima_mid`: lima 1–1. **This is the hub backtrack.** There is deliberately no direct Huaraz↔Cusco connection.
4. `ph_cusco`: cusco 2–4
5. `ph_sacred_valley`: ollantaytambo 0–1
6. `ph_aguas`: aguas_calientes 1–2, with the same Machu Picchu excursion
7. `ph_olly_return`: ollantaytambo 0–0
8. `ph_cusco_return`: cusco 0–0
9. `ph_lima_out`: lima 1–1

All packages are `reviewed: false`.

---

## Part C: the engine

### C1. `scheduleConfig.js`

```js
export const SCHEDULE_CONFIG = Object.freeze({
  dayStartHour: 9,             // legs from a base depart at this local time; full days open 09–21
  dayEndHour: 21,
  latestDepartureHour: 17,     // a pass-through connection may start only if local hour <= this
  groundLatestArrivalHour: 23, // a non-flight leg must arrive by this local hour, same local date
  longHaulThresholdHours: 8,   // computeUsableTimeLost >= this counts as long-haul
  longHaulArrivalMaxOpenHours: 4,
  minOpenBlockHours: 1.5
});
export const ENGINE_VERSION = 'door2-skeleton-0.1';
```

These are planning assumptions, not facts. Put that sentence in the header.

### C2. `route.js`

`selectRoutes(spec, data, options)`:

- `data` is `{places, connections, routePackages}`.
- `options.reviewPolicy` is `'strict' | 'allow_drafts'` and **defaults to `'strict'`**.
- It returns `makeSuccess(RouteResult[])` (candidates, best first) or a `FailureResult`.

It works in this order:

1. **Resolve the origin.** An unknown `originPlaceId` gives `route_not_supported` (detail `origin_unknown`).
2. **Resolve the destination** independently of coverage. If a `place` destination is not in `places`, return `destination_not_covered` (detail `place_unknown`). A known place or country with no package covering it (for example `ljubljana`) is also `destination_not_covered`. Options: `{action:'capture_interest'}` and, if another package exists in the same country, `{action:'alternate_route', routePackageId}`.
3. **Find candidates.** These are packages that match the destination (the package's `placeIds` include the place, or the package's `countryId` equals the country) **and** contain every place in `requiredPlaceIds` (stops or excursions).
   - If none contain all the required places, but each required place is covered by *some* package, return `route_not_supported`. Its options list the packages that cover subsets.
4. **Rank the candidates:**
   - (a) fewest places the traveller didn't ask for;
   - (b) then fewest stops;
   - (c) then package id, alphabetically.

   This must be deterministic.
5. **Build a RouteResult for each candidate.**
   - Legs are origin→stop1, stop1→stop2, …, lastStop→origin. Look up each leg with `orientConnection`. If a package has `preferredGatewayId`, prefer the matching row.
   - Call `assertConnectionPlacesResolve` on every connection used, including excursion connections.
   - An **unknown placeId in a package stop** or a connection that references an unknown place **throws**. That is a data-integrity bug, not a traveller outcome.
   - A **missing connection** for a leg gives `connection_unreviewed` with detail `{reason:'missing', from, to}`. Options: `{action:'alternate_route', ...}` if another candidate exists, else `{action:'check_back_later', detail:'We don't have verified transport for this leg yet'}`.
6. **Apply the review policy.**
   - Under `strict`, any used connection with `reviewedAt == null` gives `connection_unreviewed` with detail `{reason:'unreviewed', connectionIds:[...]}`.
   - Under `allow_drafts`, continue, set `usesDraftData: true`, and the engine will stamp `provenance.reviewed = false` on every travel block.

   **Every current pilot row is a draft, so strict mode must fail today. That is correct, and there's a test for it.**

### C3. `schedule.js`

`scheduleRoute(routeResult, spec, data, {config, bufferRuleset})` works in two phases.

**Phase 1: `simulate(nightsByStopId)`** walks the journey on the absolute timeline (see the A5 convention).

- The cursor starts at Day 1, `dayStartHour`, origin local time.
- For each leg:
  - `usable = computeUsableTimeLost(orientedConnection)`.
  - **Departure time.**
    - Leaving the origin, or leaving a stop that had nights ≥1: depart at `dayStartHour` local, on the day after the last night.
    - Leaving a pass-through stop (nights 0): depart immediately at arrival. **But** if the local hour there is > `latestDepartureHour`, **throw a package-authoring error** (`pass_through_requires_overnight`).
    - **Never insert an unplanned night silently.** The planner surfaces the error as `route_not_supported` with that detail.
  - A **non-flight** leg arriving after `groundLatestArrivalHour`, or on a later local date than it departed, gets the same package-authoring error.
  - Emit one `travel` block on the departure-local day.
    - `transport.overnight` follows the A5 rule.
    - Set `arriveDayNumber` and `arriveTime`.
    - `computedUsableTimeLost` is the computed value. Never store the inputs pre-combined anywhere else.
- **At a stop with nights ≥1:**
  - Call `assertPlaceCanBeOvernightBase(place)`.
  - **Excursions** are placed at the earliest moment in the arrival day or later days where `outbound usable + hoursOnSite + return usable` fits before `dayEndHour`. Each one emits three blocks:
    - `travel` out;
    - `open` with `placeId` = the attraction (for example `machu_picchu`) and `anchor.stopId` = the base stop;
    - `travel` back.

    The attraction is **never** an overnight location. If no day at the base fits the excursion, that's a package-authoring error.
  - **Open blocks** fill the remaining 09–21 gaps at the base, each ≥ `minOpenBlockHours`. Drop smaller gaps.
    - On the arrival day, the open window starts at max(arrival, 09:00).
    - If the arriving leg was long-haul, cap the arrival day's total open time at `longHaulArrivalMaxOpenHours`.
    - Full days between arrival and departure get a full 09–21 window, less any excursion.
    - There's no open time on a departure morning before the leg.
- **At a pass-through stop:** no open blocks, no nights.
- The journey ends when the final leg arrives at the origin. `homeArrival = {dayNumber, time}` in origin local time.

**Phase 2: fit to `spec.totalDays` (N).**

1. Simulate with every stop at `minNights`. This gives the minimum trip length, `minDays` = the home-arrival day number. Adding one night at any stop shifts everything after it by exactly 24h, so trip length rises by exactly 1 per extra night.
2. If `minDays > N`, return a failure (the planner decides which state; see C5). The failure carries `{minDays, extraDaysNeeded: minDays - N}`.
3. If `minDays < N`, distribute `N - minDays` extra nights **round-robin in route order**, one per pass, over stops where `nights < maxNights` (pass-through stops with max 0 never get nights).
   - If nights are still left after every stop is at max, keep going round-robin over stops with `maxNights ≥ 1`, ignoring max, and add the warning `nights_above_package_max`.
   - **Never pad with fake content. Never shorten the trip.**
4. Re-simulate with the final nights. The home arrival **must** land on Day N. Assert it; if not, throw (it's an engine bug).
5. Emit a `Day` for every dayNumber 1..N: `id: 'day:<n>'`, blocks sorted by start.
   - A day with no blocks (only possible inside a very long transit) gets one zero-hour `rest` block with `note: 'in_transit'`.

**Block ids are deterministic** (identical input gives identical ids):

- travel: `tr:<fromStopId|origin_out>><toStopId|origin_home>`
- excursion: `ex:<stopId>:<placeId>:out|site|back`
- open: `op:<stopId>:d<offsetFromArrivalDay>`

Put a code comment saying that reconciling ids across edits is the editing brief's job. These ids only need to be unique and reproducible now.

**Every block** has `provenance: {source:'curated', reviewed: <connection reviewed? false for drafts>, confidence: 'medium'}`, `generationStatus: 'ok'`, `userEdited: false` and `locked: false`.

It returns `makeSuccess({days, stops: [{stopId, placeId, nights, arrivalDay, departureDay}], homeArrival, minDays, warnings, usesDraftData})`.

### C4. `validate.js`

`validateSkeleton(result, routeResult, spec, data, {reviewPolicy})` is an **independent re-check** of schedule's output. Don't reuse schedule's internals to prove schedule right.

**Engine-bug invariants.** Violating any of these **throws**, because it's our bug and not a traveller state:

- exactly N days, numbered 1..N;
- home arrival is on Day N;
- blocks within a day don't overlap;
- every night k→k+1 (k = 1..N-1) has an overnight location: either a stop with nights covering it, or a travel block with `overnight: true` in progress;
- no night is at an `attraction` place;
- every stop with nights ≥1 appears;
- every required place appears, as a stop with nights ≥1 or as an excursion `open` block;
- there's no `open` block before a departing travel block on the same day at the same place;
- no `open` block is shorter than `minOpenBlockHours`;
- open time on a long-haul arrival day is ≤ the cap.

**Traveller-facing results:**

- Strict policy with draft connections gives `connection_unreviewed`.
- Otherwise it returns `makeSuccess({status: usesDraftData ? 'draft' : 'valid', contentStatus: 'not_filled', warnings})`.
- `content_insufficient` is **not produced in this step**, because `fill.js` doesn't exist yet. Say so in a comment.

### C5. `planner.js`: the one entry point the harness and tests call

`buildSkeletonTrip(spec, data = PILOT_DATA, options = {})` returns a `Trip` or a `FailureResult`.

1. `selectRoutes`. Pass through any failure.
2. Take the best candidate and `scheduleRoute` it.
3. **If it's too short:**
   - With **2 or more required places**: return `required_place_conflict`. Options:
     - `{action:'extend', days: k, detail:'+k days'}`;
     - for each required place `r`: if dropping `r` from `requiredPlaceIds` gives a candidate whose `minDays ≤ N`, add `{action:'remove_place', placeId: r, routePackageId}`.
   - **Otherwise**: return `duration_too_short`. Options: `extend +k`, plus `{action:'alternate_route', routePackageId}` for any other candidate with `minDays ≤ N`.
4. A package-authoring error (pass-through overnight, excursion doesn't fit) becomes `route_not_supported` with its detail.
5. `validateSkeleton`. Return any failure.
6. **Assemble the Trip:**
   - `id: 'door2:<originPlaceId>:<destination.id>:<totalDays>:<routePackageId>'`;
   - `status` from validate;
   - `spec` with `stops` filled from the route (TripSpecStop ids = package stop ids, `placeSource: 'recommendation'`) and `routeTemplateId` set;
   - `days`;
   - `versions: {engine: ENGINE_VERSION, schema: 'door2-v5', content: 'none', routeData: PILOT_DATA_VERSION, bufferRuleset: 'buffer_ruleset_v2@2'}`;
   - `history: []`.

There's no randomness and no `Date.now()` anywhere, so identical input gives an identical Trip.

---

## Part D: hidden dev harness for real-browser testing

`src/pages/Door2Dev.jsx`, routed at `/dev/door2` in `App.jsx`. Put it **outside** `TravelUpLayout`, next to `/find`. Add the import and the one `<Route>` line only.

- **Gate:** if the URL doesn't contain `?key=door2`, render the existing `PageNotFound`. It must not be linked from anywhere.
- **Controls:**
  - a fixture dropdown (F1–F9 below, pre-filling the spec);
  - editable total days;
  - a required-places multiselect (from `PILOT_PLACES`);
  - a review-policy toggle (default **allow_drafts** in the harness only, with a bright amber banner: "DRAFT DATA — pilot connections are unreviewed. Not for real travellers.").
- **Output:**
  - either the failure (state, message, each option), or the trip;
  - a trip summary line ("10-day trip · home arrival Day 10 22:45 · nights: Lima 2, Cusco 3, …");
  - one card per day listing blocks in time order (`HH:MM`, type, place, duration, and for travel: mode, from→to, arrive time, an overnight tag and "draft" tag);
  - a "Copy JSON" button.
- **Styling:** plain Tailwind with the existing light tokens. No design work. This page is a test instrument, not product UI.

---

## Part E: tests (`tests/door2/*.test.js`, `node:test` plus `node:assert/strict`)

Run them with `npm run test:door2`.

These expected values were **derived independently in chat** by prototyping these exact rules. If your output disagrees, **don't edit the expectation to match**. Work out which side is wrong and report it.

| # | Spec (origin Vancouver) | Expected |
|---|---|---|
| F1 | NYC, 7 days | Trip. Nights: new_york 6. D1 travel 09:00, arrives D1 22:15 NY time, not overnight, no open block on D1. D7 departs 09:00 NY, home D7 16:15. |
| F2 | Peru (country), 10 days | `peru_classic`. Nights: lima_in 2, cusco 3, sacred_valley 1, aguas 1, lima_out 1, others 0. See the F2 detail below. |
| F3 | Peru, 5 days | `duration_too_short`, `minDays` 7, options include `extend` with `days: 2`. |
| F4 | Peru, 12 days, required `[huaraz, machu_picchu]` | `peru_classic_huaraz`. Nights: lima_in 2, huaraz 3, lima_mid 1, cusco 2, sacred_valley 0, aguas 1, lima_out 1. See the F4 detail below. |
| F5 | Peru, 9 days, required `[huaraz, machu_picchu]` | `required_place_conflict`, `minDays` 10. Options: `extend` with `days: 1`, **and** `remove_place huaraz` (→ `peru_classic` fits). **No** `remove_place machu_picchu` option (no package keeps Huaraz without MP). |
| F6 | Tokyo (place), 7 days | Trip. Uses `conn_yvr_tokyo_air_nrt`. Nights: tokyo 5. D1 departs, arrives D2 16:21 Tokyo time, **overnight**. D7 departs 09:00 Tokyo, home D7 08:21, **overnight**. |
| F7 | F2 with `reviewPolicy: 'strict'` | `connection_unreviewed`, `detail.reason` 'unreviewed', lists the draft connection ids. |
| F8a | Test-only package with a direct `huaraz→cusco` leg | `connection_unreviewed`, `detail.reason` 'missing'. |
| F8b | Test-only package with stop placeId `atlantis` | **Throws** (data integrity). |
| F8c | Test-only package with `machu_picchu` as a stop with nights 1 | **Throws** (`assertPlaceCanBeOvernightBase`). |
| F8d | Test-only package: pass-through lima after huaraz (ph_lima_mid 0–0) | `route_not_supported`, detail `pass_through_requires_overnight`. |
| F9 | Ljubljana (place), 7 days | `destination_not_covered`. |
| F10 | F2 run twice, and JSON round-trip | `deepStrictEqual` both times (determinism: reopen shows the same plan). |
| F11 | All successful fixtures | Every C4 invariant holds. Run `validateSkeleton` explicitly in the test too. |

**F2 detail (Peru, 10 days):**

- D1 YVR→LIM departs 09:00, arrives **D2 02:45** Lima, overnight. D2 open ≤4h.
- D4 LIM→CUZ 09:00→14:00.
- D7 CUZ→Ollantaytambo arrives 11:03.
- D8 Ollantaytambo→Aguas arrives 11:51. Machu Picchu excursion D8 **11:51–17:33**.
- D9: Aguas→Ollantaytambo→Cusco→Lima, chaining through the pass-throughs, arrives Lima 18:54.
- D10 LIM→YVR departs 09:00, home **D10 22:45**, **not** overnight.

**F4 detail (Peru + Huaraz, 12 days):**

- D4 LIM→Huaraz coach arrives 17:51.
- D7 Huaraz→LIM coach arrives 17:51. **Lima appears twice (the hub backtrack).**
- D8 LIM→CUZ.
- D10 Machu Picchu excursion 13:54–19:36.
- Home D12 22:45.

Also include a unit test for `computeUsableTimeLost(conn_yvr_lim_air) === 15.75`, and one for `orientConnection` reversing localTransferHours (lima→vancouver gives origin 0.75, destination 0.5).

---

## Part F: finish and verify (paste actual output for each)

1. `git diff --stat`. Only files from the §0 table. PASS/FAIL.
2. Protected files show zero changes: `git diff --stat -- <each protected file>` is empty. PASS/FAIL.
3. `npm run test:door2`. All pass. Paste the summary. PASS/FAIL.
4. `npm run lint && npm run build`. Both clean. PASS/FAIL.
5. **Local browser check.** Run `npm run dev` and open `/dev/door2?key=door2`.
   - Run F1, F2, F4, F5 and F6. Screenshot F2 and F4.
   - Confirm `/dev/door2` without the key shows the 404 page.
   - Confirm `/` and `/find` still work as before: start Door 2 and build a trip with the old flow once.
   - PASS/FAIL.
6. **Print the F2 and F4 skeletons as plain text** in your report, one line per block. Rockstar reviews these by eye ("does this look like a real trip?").
7. Commit (don't push):

```
Door 2 skeleton scheduler: contracts, pilot data, route/schedule/validate, dev harness

Lands the Step 2 contracts (never previously committed) and builds Step 3:
route -> schedule -> validate producing a home-to-home day skeleton with no
activities. Pilot: Vancouver -> NYC / Peru / Peru+Huaraz / Tokyo; Ljubljana
uncovered. All connection data is DRAFT (unreviewed): strict review policy
correctly refuses it; the hidden /dev/door2 harness uses allow_drafts with a
visible warning. No protected file, Door 1, or legacy Door 2 path touched.
```

8. Report back with: the commit hash, the checklist results, the F2 and F4 skeleton text, any expectation you believe is wrong (with reasoning), and **anything you had to decide that this brief didn't specify**. Then hand off: Rockstar pushes, **rebuilds on Base44**, and tests `/dev/door2?key=door2` on the live site.

---

## Explicitly out of scope

- `fill.js` / activities.
- Editing.
- Saving trips to storage.
- The real Door 2 UI.
- Opening hours, including Machu Picchu entry slots and train timetables.
- Real flight schedules.
- DST.
- Pace settings.
- Reviewing the data itself. That's a separate task: every pilot connection must be upgraded to primary sources and marked `reviewedBy`/`reviewedAt` before any real traveller sees this engine. Until then, production must run `strict`.
