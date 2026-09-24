import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { PILOT_DATA, buildSkeletonTrip, buildTripFromRoutePlan } from '../../src/lib/door2/planner.js';
import { selectRoutes } from '../../src/lib/door2/route.js';
import { scheduleRoute } from '../../src/lib/door2/schedule.js';
import { SKELETON_FIXTURES } from './fixtures/skeletonFixtures.js';

const DRAFTS = { reviewPolicy: 'allow_drafts' };
const PERU = { kind: 'country', id: 'PE' };

function spec(destination, totalDays, requiredPlaceIds = [], extra = {}) {
  return {
    originPlaceId: 'vancouver',
    destination,
    travelMonth: 10,
    totalDays,
    travellerType: 'couple',
    interests: [],
    pace: 'balanced',
    budget: 'mid',
    requiredPlaceIds,
    routeTemplateId: null,
    stops: [],
    choices: { pinned: [], rejected: [], placed: [] },
    ...extra
  };
}

const PC_KEYS = ['pc_lima_in', 'pc_cusco', 'pc_sacred_valley', 'pc_aguas', 'pc_olly_return', 'pc_cusco_return', 'pc_lima_out'];
/** [lima_in, cusco, sacred_valley, aguas, lima_out] → a peru_classic RoutePlan (pass-throughs at 0). */
function pcPlan([limaIn, cusco, sv, aguas, limaOut]) {
  const nights = { pc_lima_in: limaIn, pc_cusco: cusco, pc_sacred_valley: sv, pc_aguas: aguas, pc_olly_return: 0, pc_cusco_return: 0, pc_lima_out: limaOut };
  return { variantId: 'peru_classic', stops: PC_KEYS.map((key) => ({ key, nights: nights[key] })) };
}
const homeLeg = (trip) => trip.days.flatMap((d) => d.blocks).find((b) => b.id === 'tr:pc_lima_out>origin_home');

// ---------------------------------------------------------------------------
// Step 2: nightsOverride + buildTripFromRoutePlan

// Design §1.1: totalDays = minDays(8) + Σ(nights − min). Each row lands home on the predicted day.
const ALLOCATIONS = [
  [[2, 3, 0, 1, 1], 10],
  [[1, 4, 0, 1, 1], 10],
  [[3, 2, 0, 1, 1], 10],
  [[1, 3, 0, 2, 1], 10],
  [[1, 3, 1, 1, 1], 10],
  [[2, 2, 1, 1, 1], 10],
  [[3, 4, 1, 2, 1], 14]
];

test('R2.1: every §1.1 allocation lands home on the predicted day', () => {
  for (const [alloc, predicted] of ALLOCATIONS) {
    const trip = buildTripFromRoutePlan(spec(PERU, predicted), pcPlan(alloc), PILOT_DATA, DRAFTS);
    assert.notEqual(trip.ok, false, `${alloc}: ${JSON.stringify(trip)}`);
    assert.equal(trip.days.length, predicted);
    assert.equal(homeLeg(trip).transport.arriveDayNumber, predicted, `${alloc}`);
    const nights = Object.fromEntries(trip.spec.stops.map((s) => [s.id, s.nights]));
    assert.deepEqual(PC_KEYS.map((k) => nights[k]), [alloc[0], alloc[1], alloc[2], alloc[3], 0, 0, alloc[4]]);
  }
});

test('R2.2: the round-robin allocation through buildTripFromRoutePlan equals buildSkeletonTrip exactly', () => {
  for (let n = 8; n <= 14; n++) {
    const s = spec(PERU, n);
    const auto = buildSkeletonTrip(s, PILOT_DATA, DRAFTS);
    const plan = { variantId: 'peru_classic', stops: auto.spec.stops.map((x) => ({ key: x.id, nights: x.nights })) };
    assert.deepStrictEqual(buildTripFromRoutePlan(s, plan, PILOT_DATA, DRAFTS), auto, `${n} days`);
  }
  // The Huaraz variant, also reachable by its alias.
  const s = spec(PERU, 12, ['huaraz']);
  const auto = buildSkeletonTrip(s, PILOT_DATA, DRAFTS);
  const plan = { variantId: 'peru_classic_huaraz', stops: auto.spec.stops.map((x) => ({ key: x.id, nights: x.nights })) };
  assert.deepStrictEqual(buildTripFromRoutePlan(s, plan, PILOT_DATA, DRAFTS), auto);
});

test('R2.3: an invalid allocation throws (below min, above max, wrong sum, missing or unknown stop)', () => {
  const s10 = spec(PERU, 10);
  const [best] = selectRoutes(s10, PILOT_DATA, DRAFTS).value;
  const override = (alloc) => Object.fromEntries(pcPlan(alloc).stops.map((x) => [x.key, x.nights]));
  // Sanity: a valid override schedules.
  assert.equal(scheduleRoute(best, s10, PILOT_DATA, { nightsOverride: override([2, 3, 0, 1, 1]) }).ok, true);
  assert.throws(() => scheduleRoute(best, s10, PILOT_DATA, { nightsOverride: override([3, 1, 0, 1, 1]) }), /pc_cusco.*outside 2–4/);
  assert.throws(() => scheduleRoute(best, s10, PILOT_DATA, { nightsOverride: override([1, 2, 0, 3, 1]) }), /pc_aguas.*outside 1–2/);
  assert.throws(() => scheduleRoute(best, spec(PERU, 11), PILOT_DATA, { nightsOverride: override([2, 3, 0, 1, 1]) }), /expected totalDays 11/);
  const missing = override([2, 3, 0, 1, 1]);
  delete missing.pc_lima_out;
  assert.throws(() => scheduleRoute(best, s10, PILOT_DATA, { nightsOverride: missing }), /pc_lima_out/);
  assert.throws(() => scheduleRoute(best, s10, PILOT_DATA, { nightsOverride: { ...override([2, 3, 0, 1, 1]), pc_nowhere: 0 } }), /unknown stop/);
  // Through the planner: the same checks throw (engine bug), never a traveller failure.
  assert.throws(() => buildTripFromRoutePlan(s10, pcPlan([1, 1, 0, 1, 1]), PILOT_DATA, DRAFTS), /outside/);
  assert.throws(() => buildTripFromRoutePlan(s10, { variantId: 'nope', stops: [] }, PILOT_DATA, DRAFTS), /unknown variant/);
  assert.throws(
    () => buildTripFromRoutePlan(s10, { variantId: 'peru_classic', stops: [{ key: 'pc_cusco', nights: 3 }] }, PILOT_DATA, DRAFTS),
    /do not match/
  );
});

test('R2.4: buildTripFromRoutePlan builds a held variant (engine only) and applies review policy', () => {
  const held = {
    variantId: 'peru_classic+huaraz@after_machu_picchu',
    stops: ['pc_lima_in', 'pc_cusco', 'pc_sacred_valley', 'pc_aguas', 'pc_olly_return', 'pc_cusco_return', 'pc_lima_out', 'pc_huaraz', 'pc_lima_hub'].map(
      (key) => ({ key, nights: { pc_lima_in: 1, pc_cusco: 2, pc_aguas: 1, pc_lima_out: 1, pc_huaraz: 2, pc_lima_hub: 1 }[key] ?? 0 })
    )
  };
  const trip = buildTripFromRoutePlan(spec(PERU, 11), held, PILOT_DATA);
  assert.notEqual(trip.ok, false, JSON.stringify(trip));
  assert.equal(trip.status, 'valid');
  const oneDraft = { ...PILOT_DATA, connections: PILOT_DATA.connections.map((c) => (c.id === 'conn_lim_cuz_air' ? { ...c, reviewedAt: null } : c)) };
  const refused = buildTripFromRoutePlan(spec(PERU, 10), pcPlan([2, 3, 0, 1, 1]), oneDraft);
  assert.equal(refused.state, 'connection_unreviewed');
  assert.deepEqual(refused.detail.connectionIds, ['conn_lim_cuz_air']);
});

test('R2.5 regression: buildSkeletonTrip output is byte-identical to the pre-step-2 snapshot for every fixture', () => {
  const snapshot = JSON.parse(readFileSync(new URL('./fixtures/skeleton-pre-step2.json', import.meta.url), 'utf8'));
  let checked = 0;
  for (const [k, s] of Object.entries(SKELETON_FIXTURES)) {
    for (const policy of ['allow_drafts', 'strict']) {
      const r = buildSkeletonTrip(s, PILOT_DATA, { reviewPolicy: policy });
      const hash = createHash('sha256').update(JSON.stringify(r)).digest('hex');
      assert.equal(hash, snapshot[`${k}:${policy}`], `${k}:${policy}`);
      checked += 1;
    }
  }
  assert.equal(checked, Object.keys(snapshot).length);
});
