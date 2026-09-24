import { test } from 'node:test';
import assert from 'node:assert/strict';

import { loadDraftTrip, upgradeV5toV6 } from '../../src/lib/door2/draftStorage.js';
import { pinActivity, swapActivity } from '../../src/lib/door2/edit.js';
import { checkVariantsSchedulable, routePackage } from '../../src/lib/door2/families.js';
import { PILOT_DATA, buildFilledTrip, buildSkeletonTrip } from '../../src/lib/door2/planner.js';
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

// The pre-Route-Families Huaraz package (as in families.test.js), so a genuine v5 Huaraz draft can be made.
const MP = Object.freeze({ placeId: 'machu_picchu', connectionId: 'conn_agc_mp_shuttle', hoursOnSite: 4 });
const st = (id, placeId, minNights, maxNights, excursions = []) => ({ id, placeId, minNights, maxNights, excursions });
const OLD_HUARAZ = routePackage({
  id: 'peru_classic_huaraz',
  name: 'Peru classic with Huaraz',
  countryId: 'PE',
  stops: [
    st('ph_lima_in', 'lima', 1, 2),
    st('ph_huaraz', 'huaraz', 2, 4),
    st('ph_lima_mid', 'lima', 1, 1),
    st('ph_cusco', 'cusco', 2, 4),
    st('ph_sacred_valley', 'ollantaytambo', 0, 1),
    st('ph_aguas', 'aguas_calientes', 1, 2, [MP]),
    st('ph_olly_return', 'ollantaytambo', 0, 0),
    st('ph_cusco_return', 'cusco', 0, 0),
    st('ph_lima_out', 'lima', 1, 1)
  ]
});
const OLD_DATA = { places: PILOT_DATA.places, connections: PILOT_DATA.connections, routePackages: [OLD_HUARAZ] };

/** What a saved v5 draft looked like: no routePlan, schema door2-v5, history entries likewise. */
function toV5(trip) {
  const { routePlan, ...rest } = trip;
  return { ...rest, versions: { ...trip.versions, schema: 'door2-v5' }, history: (trip.history ?? []).map(toV5) };
}
const must = (r) => {
  assert.equal(r.ok, true, JSON.stringify(r));
  return r.trip;
};

test('D1: a v5 Peru-classic draft (with edit history) upgrades with blocks unchanged', () => {
  const s = spec(PERU, 10);
  let fresh = buildFilledTrip(s, PILOT_DATA, DRAFTS);
  fresh = must(swapActivity(fresh, 'op:pc_cusco:d1'));
  fresh = must(pinActivity(fresh, 'op:pc_cusco:d2'));
  const v5 = toV5(fresh);
  const up = upgradeV5toV6(v5);
  assert.equal(up.compatible, true, up.reason);
  assert.deepStrictEqual(up.trip, fresh);
  assert.deepStrictEqual(up.trip.days, v5.days, 'blocks untouched');
  assert.equal(up.trip.history.length, 2);
  assert.equal(up.trip.routePlan.nightsSource, 'auto');
});

test('D2: a v5 Huaraz draft upgrades with ph_* keys mapped to family keys', () => {
  const s = spec(PERU, 12, ['huaraz', 'machu_picchu']);
  let old = buildFilledTrip(s, OLD_DATA, DRAFTS);
  old = must(pinActivity(old, 'op:ph_huaraz:d1'));
  const v5 = toV5(old);
  assert.equal(v5.spec.routeTemplateId, 'peru_classic_huaraz');

  let fresh = buildFilledTrip(s, PILOT_DATA, DRAFTS);
  fresh = must(pinActivity(fresh, 'op:pc_huaraz:d1'));

  const up = upgradeV5toV6(v5);
  assert.equal(up.compatible, true, up.reason);
  assert.deepStrictEqual(up.trip, fresh);
  assert.equal(up.trip.id, 'door2:vancouver:PE:12:peru_classic+huaraz@after_lima_in');
  assert.ok(up.trip.days.flatMap((d) => d.blocks).some((b) => b.id === 'tr:pc_huaraz>pc_lima_hub'));
  assert.equal(JSON.stringify(up.trip).includes('ph_'), false, 'no old stop key left anywhere');
  const huaraz = up.trip.routePlan.stops.find((x) => x.key === 'pc_huaraz');
  assert.deepEqual([huaraz.role, huaraz.optionalId, huaraz.selectionSource], ['optional', 'huaraz', 'required']);
  assert.deepEqual(up.trip.routePlan.optionals, [{ optionalId: 'huaraz', positionId: 'after_lima_in', selectionSource: 'required' }]);
});

test('D3: garbage v5 drafts return incompatible, never throw', () => {
  const good = toV5(buildFilledTrip(spec(PERU, 10), PILOT_DATA, DRAFTS));
  const cases = [
    null,
    {},
    { versions: { schema: 'door2-v5' } },
    { ...good, spec: null },
    { ...good, spec: { ...good.spec, routeTemplateId: 'atlantis_tour' } },
    { ...good, spec: { ...good.spec, stops: good.spec.stops.slice(1) } },
    { ...good, spec: { ...good.spec, stops: good.spec.stops.map((x) => (x.id === 'pc_cusco' ? { ...x, nights: 9 } : x)) } },
    { ...good, days: good.days.slice(1) },
    { ...good, days: good.days.map((d) => ({ ...d, blocks: 'nope' })) },
    { ...good, history: [{ versions: { schema: 'door2-v5' } }] }
  ];
  for (const c of cases) {
    const r = upgradeV5toV6(c);
    assert.equal(r.compatible, false, JSON.stringify(c)?.slice(0, 80));
    assert.match(r.reason, /can't be reopened here/);
  }
});

test('D4: fresh builds carry a routePlan consistent with spec.stops', () => {
  const variantRange = Object.fromEntries(
    checkVariantsSchedulable(PILOT_DATA.allRoutePackages, PILOT_DATA).map((r) => [r.variantId, [r.minDays, r.maxDays]])
  );
  for (const [k, s] of Object.entries(SKELETON_FIXTURES)) {
    const trip = buildSkeletonTrip(s, PILOT_DATA, DRAFTS);
    if (trip.ok === false) continue;
    const rp = trip.routePlan;
    assert.equal(trip.versions.schema, 'door2-v6', k);
    assert.equal(rp.variantId, trip.spec.routeTemplateId, k);
    assert.deepEqual(
      rp.stops.map((x) => [x.key, x.placeId, x.nights, x.isRequired]),
      trip.spec.stops.map((x) => [x.id, x.placeId, x.nights, x.isRequired]),
      k
    );
    assert.equal(rp.connectionIds.length, rp.stops.length + 1, k);
    assert.deepEqual([rp.minDays, rp.maxDays], variantRange[rp.variantId], k);
    assert.equal(rp.nightsSource, 'auto');
    for (const x of rp.stops) {
      assert.equal(x.role, x.maxNights === 0 ? 'pass_through' : x.optionalId ? 'optional' : 'core', `${k} ${x.key}`);
      assert.equal(x.selectionSource, x.isRequired ? 'required' : 'default', `${k} ${x.key}`);
    }
    assert.deepStrictEqual(JSON.parse(JSON.stringify(trip)), trip, `${k} JSON round-trip`);
  }
  const f2 = buildSkeletonTrip(SKELETON_FIXTURES.F2, PILOT_DATA, DRAFTS).routePlan;
  assert.deepEqual(
    { familyId: f2.familyId, variantId: f2.variantId, source: f2.source, minDays: f2.minDays, maxDays: f2.maxDays, optionals: f2.optionals },
    { familyId: 'peru_classic', variantId: 'peru_classic', source: 'authored', minDays: 8, maxDays: 14, optionals: [] }
  );
});

test('D5: loadDraftTrip upgrades v5 on read, returns v6 as saved, refuses other schemas', () => {
  const store = new Map();
  globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  try {
    const v6 = buildFilledTrip(spec(PERU, 10), PILOT_DATA, DRAFTS);
    const v5 = toV5(v6);
    store.set(
      'door2_drafts_v1',
      JSON.stringify([
        { id: 'a', label: 'old', savedAt: '2026-09-22T00:00:00Z', trip: v5 },
        { id: 'b', label: 'new', savedAt: '2026-09-23T00:00:00Z', trip: v6 },
        { id: 'c', label: 'ancient', savedAt: '2026-09-21T00:00:00Z', trip: { ...v6, versions: { ...v6.versions, schema: 'door2-v4' } } }
      ])
    );
    assert.deepStrictEqual(loadDraftTrip('a'), { compatible: true, trip: v6 });
    assert.deepStrictEqual(loadDraftTrip('b'), { compatible: true, trip: v6 });
    assert.equal(loadDraftTrip('c').compatible, false);
    assert.match(loadDraftTrip('c').reason, /door2-v4/);
    // Reading never rewrites the saved draft.
    assert.equal(JSON.parse(store.get('door2_drafts_v1'))[0].trip.versions.schema, 'door2-v5');
  } finally {
    delete globalThis.localStorage;
  }
});
