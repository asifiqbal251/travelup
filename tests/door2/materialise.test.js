import { test } from 'node:test';
import assert from 'node:assert/strict';

import { materialiseTripSequence } from '../../src/lib/door2/materialise.js';
import { PILOT_DATA, buildFilledTrip, buildSkeletonTrip, buildTripFromRoutePlan, findRoutePackage, planSelection, resolveExcursions } from '../../src/lib/door2/planner.js';
import * as R from '../../src/lib/door2/restructure.js';
import { buildRouteResult } from '../../src/lib/door2/route.js';
import { PackageAuthoringError, scheduleRoute } from '../../src/lib/door2/schedule.js';
import { SCHEDULE_CONFIG } from '../../src/lib/door2/scheduleConfig.js';
import { checkTripSequence, tripSequenceFromPlan } from '../../src/lib/door2/tripSequence.js';

// F3b: stage 2 of the handoff. A TripSequence is materialised from the sequence,
// the graph and declared runtime configuration alone, and the result is compared
// with what the existing RoutePlan path schedules today.

const spec = (destination, totalDays, travelMonth, routeTemplateId = null) => ({
  originPlaceId: 'vancouver',
  destination,
  travelMonth,
  totalDays,
  travellerType: 'couple',
  interests: [],
  pace: 'balanced',
  budget: 'mid',
  requiredPlaceIds: [],
  routeTemplateId,
  stops: [],
  choices: { pinned: [], rejected: [], placed: [] }
});

const PE = { kind: 'country', id: 'PE' };
const CA = { kind: 'country', id: 'CA' };
const JP = { kind: 'country', id: 'JP' };

function build(destination, totalDays, travelMonth, routeTemplateId) {
  const trip = buildFilledTrip(spec(destination, totalDays, travelMonth, routeTemplateId), PILOT_DATA);
  assert.ok(trip.routePlan, `built ${routeTemplateId ?? destination.id}/${totalDays}: ${JSON.stringify(trip.detail ?? trip.state)}`);
  return trip;
}

function addExcursion(trip, stopKey, excursionId) {
  const result = R.previewAddExcursion(trip, stopKey, excursionId);
  assert.equal(result.ok, true, JSON.stringify(result).slice(0, 300));
  const applied = R.applyProposal(trip, result.proposals[0]);
  assert.equal(applied.ok, true);
  return applied.trip;
}

/** The brief's §3 cases. */
function cases() {
  const japan = build(JP, 14, 10, 'tokyo_city+kyoto@after_tokyo');
  const withNikko = addExcursion(japan, 'tokyo_base', 'nikko');
  return {
    'Peru 10d': build(PE, 10, 10, null),
    'Canada 12d + Ottawa': build(CA, 12, 6, 'ec_corridor#west_to_east+ottawa@corridor'),
    'Japan 14d + Kyoto': japan,
    'Tokyo-only 7d': build(JP, 7, 10, 'tokyo_city'),
    'Japan 14d + Kyoto, Nikko': withNikko,
    'Japan 14d + Kyoto, Nara': addExcursion(japan, 'kyo_base', 'nara'),
    'Japan 14d + Kyoto, Nikko and Nara': addExcursion(withNikko, 'kyo_base', 'nara'),
    'Japan 14d Tokyo, Kamakura then Nikko (menu order)': addExcursion(addExcursion(build(JP, 14, 10, 'tokyo_city'), 'tokyo_base', 'kamakura'), 'tokyo_base', 'nikko'),
    'Japan 14d Tokyo, stretched': build(JP, 14, 10, 'tokyo_city')
  };
}

const stage1 = (trip) => tripSequenceFromPlan(trip.spec, trip.routePlan, { id: 'seq-test' });

/**
 * The existing path's scheduleRoute call, as buildTripFromRoutePlan makes it (planner.js:351–390): the variant,
 * the selection resolved against its menu, the authored bounds, and the plan's nights as the override.
 * (withFixedRequirement only rewrites isRequired, which scheduleRoute never reads.)
 */
function existingRouteResult(trip, data = PILOT_DATA) {
  const pkg = findRoutePackage(data, trip.routePlan.variantId);
  const resolved = resolveExcursions(pkg, planSelection(trip.routePlan), trip.spec, data, { dropUnresolved: true });
  assert.equal(resolved.ok, true);
  return buildRouteResult(resolved.pkg, trip.spec, data).routeResult;
}
function existingSchedule(trip, data = PILOT_DATA) {
  const nightsOverride = Object.fromEntries(trip.routePlan.stops.map((s) => [s.key, s.nights]));
  const scheduled = scheduleRoute(existingRouteResult(trip, data), trip.spec, data, { nightsOverride });
  assert.equal(scheduled.ok, true);
  return scheduled.value;
}

const pick = ({ days, stops, homeArrival, usesDraftData }) => ({ days, stops, homeArrival, usesDraftData });

// ---------------------------------------------------------------------------
// §1: what a materialisation-only run reads. THE FINDING.

test('§1 measured: a materialisation run of scheduleRoute reads minNights and maxNights, never isRequired', () => {
  // Record every field the scheduler touches when it is handed authoritative nights (the override path,
  // which is all stage 2 runs). Allocation (round-robin) is never reached on this path.
  for (const [name, trip] of Object.entries(cases())) {
    const reads = { result: new Set(), stop: new Set(), spec: new Set() };
    const rec = (o, set) => new Proxy(o, { get: (t, k, r) => (typeof k === 'string' && set.add(k), Reflect.get(t, k, r)) });
    const rr = existingRouteResult(trip);
    const recorded = rec({ ...rr, stops: rr.stops.map((s) => rec(s, reads.stop)) }, reads.result);
    const nightsOverride = Object.fromEntries(trip.routePlan.stops.map((s) => [s.key, s.nights]));
    scheduleRoute(recorded, rec(trip.spec, reads.spec), PILOT_DATA, { nightsOverride });

    assert.deepEqual([...reads.stop].sort(), ['excursions', 'id', 'maxNights', 'minNights', 'placeId'], name);
    // routePackageId is read only to build error-message text (schedule.js:375).
    assert.deepEqual([...reads.result].sort(), ['connectionIds', 'routePackageId', 'stops', 'usesDraftData'], name);
    assert.deepEqual([...reads.spec].sort(), ['originPlaceId', 'totalDays'], name);
  }
});

test('§1: the DAYS do not depend on the authored bounds; minDays and the over-maximum warning do', () => {
  for (const [name, trip] of Object.entries(cases())) {
    const existing = existingSchedule(trip);
    const materialised = materialiseTripSequence(stage1(trip), PILOT_DATA);
    assert.deepEqual(materialised.value, pick(existing), `${name}: days, stops, home arrival and draft flag match exactly`);

    // What the existing path reports and stage 2 cannot: both come only from minNights/maxNights.
    assert.equal(existing.minDays, trip.routePlan.minDays, name);
    assert.equal('minDays' in materialised.value, false, name);
    assert.equal('warnings' in materialised.value, false, name);
  }
  // The case that makes it matter: Tokyo stretched to 12 nights against an authored maximum of 10.
  const stretched = build(JP, 14, 10, 'tokyo_city');
  assert.deepEqual(existingSchedule(stretched).warnings, ['nights_above_package_max']);
  assert.deepEqual(stretched.warnings, ['nights_above_package_max'], 'it reaches the Trip, where draftStorage.js:79 reads it');
  assert.equal(stretched.routePlan.minDays, 5, 'the variant minimum; the realised count is 14');
});

// ---------------------------------------------------------------------------
// §2.3: consumer independence that can fail

const trap = new Proxy({}, { get(_, k) { throw new Error(`stage 2 reached for routePackages.${String(k)}`); } });
const graphOnly = { places: PILOT_DATA.places, connections: PILOT_DATA.connections, routePackages: trap, routeFamilies: trap };

test('§2.3: stage 2 materialises every case with packages and families trapped', () => {
  for (const [name, trip] of Object.entries(cases())) {
    const seq = stage1(trip);
    const result = materialiseTripSequence(seq, graphOnly, { config: SCHEDULE_CONFIG });
    assert.deepEqual(result.value, materialiseTripSequence(seq, PILOT_DATA).value, name);
  }
});

test('§2.3: the trap fires: anything that looks a package up through it throws', () => {
  const trip = addExcursion(build(JP, 14, 10, 'tokyo_city'), 'tokyo_base', 'nikko');
  // Stage 1 legitimately needs the package to resolve a selection, so it reaches the trap.
  assert.throws(() => tripSequenceFromPlan(trip.spec, trip.routePlan, { id: 'x', data: graphOnly }), /stage 2 reached for routePackages\./);
  // And the existing RoutePlan path reaches it on every build, selection or not.
  const plain = build(PE, 10, 10, null);
  assert.throws(() => buildTripFromRoutePlan(plain.spec, plain.routePlan, graphOnly), /stage 2 reached for routePackages\./);
});

test('§2.3: stage 2 reads nothing on the data but places and connections', () => {
  const strict = new Proxy(
    { places: PILOT_DATA.places, connections: PILOT_DATA.connections },
    { get(t, k) { if (k === 'places' || k === 'connections') return t[k]; throw new Error(`stage 2 read data.${String(k)}`); } }
  );
  for (const [name, trip] of Object.entries(cases())) assert.ok(materialiseTripSequence(stage1(trip), strict).ok, name);
  assert.throws(() => buildSkeletonTrip(spec(PE, 10, 10), strict), /stage 2 read data\.routePackages/, 'this proxy fires too');
});

test('§2.2: stage 2 reads only contract fields of the sequence, and never totalDays', () => {
  // Every TripSequence field but totalDays (derived; never an input). Anything else, a smuggled routePlan,
  // variantId or authored bound included, throws.
  const allowed = {
    seq: ['schemaVersion', 'id', 'source', 'origin', 'travelMonth', 'entries', 'returnConnectionId', 'evidence'],
    origin: ['placeId'],
    entry: ['placeId', 'stopKey', 'nights', 'role', 'selectedExcursionIds', 'excursions', 'inboundConnectionId'],
    excursion: ['placeId', 'connectionId', 'hoursOnSite', 'source', 'excursionId']
  };
  const guard = (o, kind) =>
    new Proxy(o, {
      get(t, k) {
        if (typeof k === 'string' && !allowed[kind].includes(k)) throw new Error(`stage 2 read ${kind}.${k}`);
        return t[k];
      }
    });
  for (const [name, trip] of Object.entries(cases())) {
    const seq = { ...stage1(trip), totalDays: 999, routePlan: trip.routePlan };
    const guarded = guard(
      {
        ...seq,
        origin: guard(seq.origin, 'origin'),
        entries: seq.entries.map((e) => guard({ ...e, minNights: 0, maxNights: 99, excursions: e.excursions.map((x) => guard(x, 'excursion')) }, 'entry'))
      },
      'seq'
    );
    assert.deepEqual(materialiseTripSequence(guarded, PILOT_DATA).value, materialiseTripSequence(stage1(trip), PILOT_DATA).value, name);
  }
  // The guard is live: reading a smuggled field throws.
  const seq = guard({ ...stage1(build(PE, 10, 10, null)), routePlan: {} }, 'seq');
  assert.throws(() => seq.routePlan, /stage 2 read seq\.routePlan/);
  assert.throws(() => seq.totalDays, /stage 2 read seq\.totalDays/);
});

test('§2.2: stage 2 accepts only declared runtime configuration', () => {
  const seq = stage1(build(PE, 10, 10, null));
  assert.throws(() => materialiseTripSequence(seq, PILOT_DATA, { routePlan: {} }), /undeclared option\(s\) routePlan/);
  assert.throws(() => materialiseTripSequence(seq, PILOT_DATA, { nightsOverride: {} }), /undeclared option\(s\) nightsOverride/);
  assert.throws(() => materialiseTripSequence(seq, PILOT_DATA, { routePackageId: 'peru_classic' }), /undeclared option\(s\) routePackageId/);
});

// ---------------------------------------------------------------------------
// §3: the materialised schedule matches the existing path, stopKeys unchanged

test('§3: every case materialises to the days the existing RoutePlan path builds today', () => {
  for (const [name, trip] of Object.entries(cases())) {
    const seq = stage1(trip);
    const { value } = materialiseTripSequence(seq, PILOT_DATA);
    const rebuilt = buildTripFromRoutePlan(trip.spec, trip.routePlan, PILOT_DATA);
    assert.deepEqual(value.days, rebuilt.days, name);
    assert.equal(value.days.length, trip.days.length, `${name}: the realised day count`);
    assert.equal(value.homeArrival.dayNumber, trip.days.length, name);

    // stopKeys: the sequence, the stop summary and every block anchor use the plan's keys unchanged.
    const keys = trip.routePlan.stops.map((s) => s.key);
    assert.deepEqual(seq.entries.map((e) => e.stopKey), keys, name);
    assert.deepEqual(value.stops.map((s) => s.stopId), keys, name);
    assert.deepEqual(value.stops.map((s) => s.nights), trip.routePlan.stops.map((s) => s.nights), name);
    const anchors = new Set(value.days.flatMap((d) => d.blocks).map((b) => b.anchor.stopId).filter((k) => k != null && !k.startsWith('origin')));
    for (const k of anchors) assert.ok(keys.includes(k), `${name}: block anchored at ${k}`);
  }
});

test('§3: the initial plans also match a fresh skeleton build (route -> schedule)', () => {
  for (const [destination, days, month, template] of [[PE, 10, 10, null], [CA, 12, 6, 'ec_corridor#west_to_east+ottawa@corridor'], [JP, 14, 10, 'tokyo_city+kyoto@after_tokyo'], [JP, 7, 10, 'tokyo_city'], [JP, 14, 10, 'tokyo_city']]) {
    const skeleton = buildSkeletonTrip(spec(destination, days, month, template), PILOT_DATA);
    assert.deepEqual(materialiseTripSequence(stage1(skeleton), PILOT_DATA).value.days, skeleton.days, template ?? destination.id);
  }
});

test('§3 Peru: Machu Picchu fixed, the repeated train, three zero-night stops and the return leg', () => {
  const seq = stage1(build(PE, 10, 10, null));
  const blocks = materialiseTripSequence(seq, PILOT_DATA).value.days.flatMap((d) => d.blocks);
  const legs = blocks.filter((b) => b.id.startsWith('tr:'));
  assert.equal(legs.length, 8);
  assert.deepEqual(legs.filter((b) => b.transport.connectionId === 'conn_olly_agc_train').map((b) => b.id), ['tr:pc_sacred_valley>pc_aguas', 'tr:pc_aguas>pc_olly_return']);
  assert.equal(legs.at(-1).id, 'tr:pc_lima_out>origin_home');
  assert.equal(legs.at(-1).transport.connectionId, seq.returnConnectionId);
  const site = blocks.find((b) => b.id === 'ex:pc_aguas:machu_picchu:site');
  assert.equal(site.durationHours, 4);
  for (const key of ['pc_sacred_valley', 'pc_olly_return', 'pc_cusco_return']) {
    assert.equal(seq.entries.find((e) => e.stopKey === key).nights, 0);
    assert.equal(blocks.some((b) => b.type === 'open' && b.anchor.stopId === key), false, `${key} is passed through`);
  }
});

test('§3 stretched: Tokyo keeps its 12 nights against an authored maximum of 10', () => {
  const trip = build(JP, 14, 10, 'tokyo_city');
  assert.equal(trip.routePlan.stops[0].maxNights, 10);
  const { value } = materialiseTripSequence(stage1(trip), PILOT_DATA);
  assert.equal(value.stops[0].nights, 12);
  assert.equal(value.days.length, 14);
});

// ---------------------------------------------------------------------------
// Reconstruction details

test('usesDraftData is derived from the graph, excursion connections included, as route.js does', () => {
  // Withdraw review from the Machu Picchu shuttle (an excursion connection, not a leg).
  const draft = { ...PILOT_DATA, connections: PILOT_DATA.connections.map((c) => (c.id === 'conn_agc_mp_shuttle' ? { ...c, reviewedAt: null } : c)) };
  const trip = build(PE, 10, 10, null);
  const existing = existingSchedule(trip, draft);
  assert.equal(existing.usesDraftData, true, 'the existing path flags it');
  const materialised = materialiseTripSequence(stage1(trip), { places: draft.places, connections: draft.connections });
  assert.equal(materialised.value.usesDraftData, true);
  assert.deepEqual(materialised.value, pick(existing));
  assert.ok(materialised.value.days.flatMap((d) => d.blocks).some((b) => b.type === 'open' && b.provenance.reviewed === false), 'and it reaches block provenance');
});

test('a malformed sequence is refused, not silently mis-scheduled', () => {
  const seq = () => structuredClone(stage1(build(PE, 10, 10, null)));
  const dup = seq();
  dup.entries[2].stopKey = dup.entries[1].stopKey;
  assert.throws(() => materialiseTripSequence(dup, PILOT_DATA), /stopKey "pc_cusco" is missing or repeated/);
  const swapped = seq();
  swapped.returnConnectionId = 'conn_lim_cuz_air';
  assert.throws(() => materialiseTripSequence(swapped, PILOT_DATA), /does not serve lima -> vancouver/);
  // An allocation the timing cannot honour is the scheduler's typed authoring error, unchanged.
  const tooShort = seq();
  tooShort.entries.find((e) => e.stopKey === 'pc_aguas').nights = 0;
  tooShort.entries.find((e) => e.stopKey === 'pc_aguas').role = 'passthrough';
  assert.ok(checkTripSequence(tooShort).length > 0, 'the checker catches it first');
  assert.throws(() => materialiseTripSequence(tooShort, PILOT_DATA), PackageAuthoringError);
});
