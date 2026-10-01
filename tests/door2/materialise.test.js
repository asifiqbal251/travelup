import { test } from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_BUFFER_RULESET } from '../../src/lib/door2/bufferRuleset.js';
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
//
// F3b.1 scoping, binding on every test here:
// - Parity is TIMED-SKELETON parity: days, stops, homeArrival and usesDraftData.
//   minDays and warnings are EXCLUDED from every comparison. It is not full output
//   parity, and each parity assertion says so where it is made.
// - The boundary demonstrated is SCHEDULING. Nothing here tests fill or edit.
// - minDays and nights_above_package_max are planning outputs. Carrying them into
//   an assembled trip is F4's design; no test here shows that handoff.

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

/** The timed skeleton: the four fields timed-skeleton parity compares. minDays and warnings are deliberately left out. */
const timedSkeleton = ({ days, stops, homeArrival, usesDraftData }) => ({ days, stops, homeArrival, usesDraftData });

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

test('§1: timed-skeleton parity (minDays and warnings EXCLUDED): the days do not depend on the authored bounds; minDays and the over-maximum warning do', () => {
  for (const [name, trip] of Object.entries(cases())) {
    const existing = existingSchedule(trip);
    const materialised = materialiseTripSequence(stage1(trip), PILOT_DATA);
    // TIMED-SKELETON PARITY ONLY: minDays and warnings are stripped from `existing` before comparing. Not full output parity.
    assert.deepEqual(materialised.value, timedSkeleton(existing), `${name}: timed-skeleton parity (days, stops, home arrival, draft flag); minDays and warnings excluded`);

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
// Consumer independence that can fail (F3b §2.3; the proxy is F3b.1 §2.6)

// F3b.1 §2.6: a TOP-LEVEL allowlist, not a nested trap. The whole `data` object is the proxy, and it permits
// exactly two keys. Any other name (routePackages, allRoutePackages, routeFamilies, a future `packages`, anything
// spelled differently) throws, as does asking whether a key exists or enumerating the keys: stage 2 may not even
// discover what else is there. The real data is passed in full behind the proxy, so a forbidden key that WOULD
// have resolved is still refused.
const GRAPH_KEYS = new Set(['places', 'connections']);
function graphOnly(data = PILOT_DATA) {
  const refuse = (what) => {
    throw new Error(`stage 2 ${what}`);
  };
  return new Proxy(data, {
    get: (t, k, r) => (GRAPH_KEYS.has(k) ? Reflect.get(t, k, r) : refuse(`read data.${String(k)}`)),
    has: (t, k) => (GRAPH_KEYS.has(k) ? Reflect.has(t, k) : refuse(`probed data.${String(k)}`)),
    getOwnPropertyDescriptor: (t, k) => (GRAPH_KEYS.has(k) ? Reflect.getOwnPropertyDescriptor(t, k) : refuse(`probed data.${String(k)}`)),
    ownKeys: () => refuse('enumerated data')
  });
}

test('§2.6: stage 2 materialises every case through the top-level allowlist (places and connections only)', () => {
  for (const [name, trip] of Object.entries(cases())) {
    const seq = stage1(trip);
    const result = materialiseTripSequence(seq, graphOnly(), { config: SCHEDULE_CONFIG });
    assert.deepEqual(result.value, materialiseTripSequence(seq, PILOT_DATA).value, name);
  }
});

test('§2.6: the allowlist fires on every forbidden access, whatever the key is called', () => {
  const data = graphOnly();
  assert.ok(data.places && data.connections, 'the two graph keys pass');
  // PILOT_DATA really has routePackages and allRoutePackages: the proxy refuses keys that exist, not only missing ones.
  assert.ok(PILOT_DATA.routePackages && PILOT_DATA.allRoutePackages);
  for (const key of ['routePackages', 'allRoutePackages', 'routeFamilies', 'packages', 'destinations', 'version']) {
    assert.throws(() => data[key], new RegExp(`stage 2 read data\\.${key}$`), key);
  }
  assert.throws(() => 'routePackages' in data, /stage 2 probed data\.routePackages/);
  assert.throws(() => Object.keys(data), /stage 2 enumerated data/);
  assert.throws(() => ({ ...data }), /stage 2 enumerated data/);

  // Live callers that DO reach for packages hit it: stage 1 resolving a selection (legitimately; the producer may
  // read the package), and the existing RoutePlan and skeleton paths on every build.
  const trip = addExcursion(build(JP, 14, 10, 'tokyo_city'), 'tokyo_base', 'nikko');
  assert.throws(() => tripSequenceFromPlan(trip.spec, trip.routePlan, { id: 'x', data: graphOnly() }), /stage 2 read data\.(allR|r)outePackages/);
  const plain = build(PE, 10, 10, null);
  assert.throws(() => buildTripFromRoutePlan(plain.spec, plain.routePlan, graphOnly()), /stage 2 read data\.(allR|r)outePackages/);
  assert.throws(() => buildSkeletonTrip(spec(PE, 10, 10), graphOnly()), /stage 2 read data\./);
});

test('§2.2: stage 2 reads only contract fields of the sequence, and totalDays is never an input', () => {
  // Every TripSequence field. Anything else, a smuggled routePlan, variantId or authored bound included, throws.
  // F3b.1: totalDays is now READ, by the boundary validator (checkTripSequence shape-checks it, §2.5), so a
  // read guard can no longer be the proof that it is not an input. The proof is behavioural, as design §Q2 asks
  // for the adapter: the materialised result is identical with totalDays absent, 1 or 999.
  const allowed = {
    seq: ['schemaVersion', 'id', 'source', 'origin', 'travelMonth', 'totalDays', 'entries', 'returnConnectionId', 'evidence'],
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
    const plain = materialiseTripSequence(stage1(trip), PILOT_DATA).value;
    assert.deepEqual(materialiseTripSequence(guarded, PILOT_DATA).value, plain, name);
    // totalDays is never an input: absent, 1 and 999 materialise identically; only days.length is the realised count.
    for (const totalDays of [1, 999]) assert.deepEqual(materialiseTripSequence({ ...stage1(trip), totalDays }, PILOT_DATA).value, plain, `${name}: totalDays ${totalDays}`);
    assert.equal(plain.days.length, trip.days.length, name);
  }
  // The guard is live: reading a smuggled field throws.
  const seq = guard({ ...stage1(build(PE, 10, 10, null)), routePlan: {} }, 'seq');
  assert.throws(() => seq.routePlan, /stage 2 read seq\.routePlan/);
  assert.throws(() => seq.minDays, /stage 2 read seq\.minDays/);
  // Its one use in stage 2 is the validator's shape check: a malformed totalDays is refused, a well-formed one ignored.
  assert.throws(() => materialiseTripSequence({ ...stage1(build(PE, 10, 10, null)), totalDays: 0 }, PILOT_DATA), /invalid sequence: totalDays 0 is not a day count/);
});

test('§2.2: stage 2 accepts only declared runtime configuration', () => {
  const seq = stage1(build(PE, 10, 10, null));
  assert.throws(() => materialiseTripSequence(seq, PILOT_DATA, { routePlan: {} }), /undeclared option\(s\) routePlan/);
  assert.throws(() => materialiseTripSequence(seq, PILOT_DATA, { nightsOverride: {} }), /undeclared option\(s\) nightsOverride/);
  assert.throws(() => materialiseTripSequence(seq, PILOT_DATA, { routePackageId: 'peru_classic' }), /undeclared option\(s\) routePackageId/);
  // F3b.1 §2.6: runtime configuration is exactly the timing config and the buffer ruleset. No widening.
  assert.ok(materialiseTripSequence(seq, PILOT_DATA, { config: SCHEDULE_CONFIG, bufferRuleset: DEFAULT_BUFFER_RULESET }).ok);
  for (const key of ['reviewPolicy', 'data', 'minNights', 'maxNights']) {
    assert.throws(() => materialiseTripSequence(seq, PILOT_DATA, { [key]: undefined }), new RegExp(`undeclared option\\(s\\) ${key}`), key);
  }
});

// ---------------------------------------------------------------------------
// F3b.1 §2.1: the synthetic bounds are a private scheduler input and never leave the module

/** Every key, at any depth. */
function deepKeys(value, out = new Set()) {
  if (Array.isArray(value)) value.forEach((v) => deepKeys(v, out));
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) (out.add(k), deepKeys(v, out));
  return out;
}

test('§2.1: synthetic minNights/maxNights are unreachable from outside routeResultFromSequence', async () => {
  // Not exported: the module's only export is the materialiser.
  const M = await import('../../src/lib/door2/materialise.js');
  assert.deepEqual(Object.keys(M), ['materialiseTripSequence']);
  // Not returned: no bound, and no scheduler output that describes one, appears anywhere in the result.
  for (const [name, trip] of Object.entries(cases())) {
    const keys = deepKeys(materialiseTripSequence(stage1(trip), PILOT_DATA));
    for (const k of ['minNights', 'maxNights', 'minDays', 'warnings']) assert.equal(keys.has(k), false, `${name}: result carries ${k}`);
  }
  // Not leaked through the scheduler's typed error either.
  const seq = structuredClone(stage1(build(PE, 10, 10, null)));
  seq.entries.find((e) => e.stopKey === 'pc_aguas').excursions[0].hoursOnSite = 30;
  assert.throws(
    () => materialiseTripSequence(seq, PILOT_DATA),
    (err) => err instanceof PackageAuthoringError && ['minNights', 'maxNights', 'minDays'].every((k) => !deepKeys(err.detail).has(k)) && !/Nights|minDays/.test(err.message)
  );
});

// ---------------------------------------------------------------------------
// §3: the materialised schedule matches the existing path, stopKeys unchanged

test('§3: timed-skeleton parity (days; minDays and warnings EXCLUDED): every case materialises to the days the existing RoutePlan path builds today', () => {
  for (const [name, trip] of Object.entries(cases())) {
    const seq = stage1(trip);
    const { value } = materialiseTripSequence(seq, PILOT_DATA);
    const rebuilt = buildTripFromRoutePlan(trip.spec, trip.routePlan, PILOT_DATA);
    // TIMED-SKELETON PARITY ONLY: the days. rebuilt.warnings and rebuilt.routePlan.minDays are not compared.
    assert.deepEqual(value.days, rebuilt.days, `${name}: timed-skeleton parity (days); minDays and warnings excluded`);
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

test('§3: timed-skeleton parity (days; minDays and warnings EXCLUDED): the initial plans also match a fresh skeleton build (route -> schedule)', () => {
  for (const [destination, days, month, template] of [[PE, 10, 10, null], [CA, 12, 6, 'ec_corridor#west_to_east+ottawa@corridor'], [JP, 14, 10, 'tokyo_city+kyoto@after_tokyo'], [JP, 7, 10, 'tokyo_city'], [JP, 14, 10, 'tokyo_city']]) {
    const skeleton = buildSkeletonTrip(spec(destination, days, month, template), PILOT_DATA);
    // TIMED-SKELETON PARITY ONLY: the days. skeleton.warnings and skeleton.routePlan.minDays are not compared.
    assert.deepEqual(materialiseTripSequence(stage1(skeleton), PILOT_DATA).value.days, skeleton.days, `${template ?? destination.id}: timed-skeleton parity (days); minDays and warnings excluded`);
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
  // TIMED-SKELETON PARITY ONLY: minDays and warnings excluded from the comparison.
  assert.deepEqual(materialised.value, timedSkeleton(existing), 'timed-skeleton parity; minDays and warnings excluded');
  assert.ok(materialised.value.days.flatMap((d) => d.blocks).some((b) => b.type === 'open' && b.provenance.reviewed === false), 'and it reaches block provenance');
});

test('§2.5: the materialiser validates its input: an invalid sequence is refused with the checker\'s problems, before scheduling', () => {
  const peru = () => structuredClone(stage1(build(PE, 10, 10, null)));
  const mutations = {
    'repeated stopKey': (s) => (s.entries[2].stopKey = s.entries[1].stopKey),
    'missing stopKey': (s) => delete s.entries[2].stopKey,
    'return leg that cannot reach home': (s) => (s.returnConnectionId = 'conn_lim_cuz_air'),
    'unknown place': (s) => (s.entries[0].placeId = 'atlantis'),
    'zero nights with an excursion requirement': (s) => Object.assign(s.entries.find((e) => e.stopKey === 'pc_aguas'), { nights: 0, role: 'passthrough' }),
    'wrong role': (s) => (s.entries[0].role = 'hub'),
    'fractional nights': (s) => (s.entries[0].nights = 1.5),
    'wrong schema version': (s) => (s.schemaVersion = 1)
  };
  for (const [name, mutate] of Object.entries(mutations)) {
    const seq = peru();
    mutate(seq);
    const problems = checkTripSequence(seq, { data: PILOT_DATA });
    assert.ok(problems.length > 0, `${name}: the checker sees it`);
    // Refused with exactly the checker's problems, as a plain Error: it never reaches the scheduler.
    assert.throws(
      () => materialiseTripSequence(seq, graphOnly()),
      (err) => !(err instanceof PackageAuthoringError) && err.message === `materialise: invalid sequence: ${problems.join('; ')}`,
      name
    );
  }
  // Graph-level problems are caught too, which the cheap structural check alone would pass.
  const swapped = peru();
  swapped.returnConnectionId = 'conn_lim_cuz_air';
  assert.deepEqual(checkTripSequence(swapped), []);
  assert.throws(() => materialiseTripSequence(swapped, PILOT_DATA), /invalid sequence: returnConnectionId "conn_lim_cuz_air" does not serve lima -> vancouver/);
});

test('a VALID sequence whose allocation the timing cannot honour is the scheduler\'s typed authoring error, unchanged', () => {
  const seq = structuredClone(stage1(build(PE, 10, 10, null)));
  seq.entries.find((e) => e.stopKey === 'pc_aguas').excursions[0].hoursOnSite = 30;
  assert.deepEqual(checkTripSequence(seq, { data: PILOT_DATA }), [], 'it passes validation');
  assert.throws(() => materialiseTripSequence(seq, PILOT_DATA), (err) => err instanceof PackageAuthoringError && err.reason === 'excursion_does_not_fit');
});
