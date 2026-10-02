import { test } from 'node:test';
import assert from 'node:assert/strict';

import { loadDraftTrip } from '../../src/lib/door2/draftStorage.js';
import { checkVariantsSchedulable } from '../../src/lib/door2/families.js';
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

/** What a saved v5 draft looked like: no routePlan, schema door2-v5, history entries likewise. */
function toV5(trip) {
  const { routePlan, ...rest } = trip;
  return { ...rest, versions: { ...trip.versions, schema: 'door2-v5' }, history: (trip.history ?? []).map(toV5) };
}

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

// Was: "loadDraftTrip upgrades v5 on read", asserting loadDraftTrip('a') → {compatible: true, trip: v6}.
// Since the Stage B writer cutover, door2-v5 is refused on read by name and kept in storage.
// The v5 → v6 upgrader and its direct tests (D1–D3) were retired after e46906d; D3's
// never-throw guarantee lives on in D3′ below, on the live refusal path.
test('D5: loadDraftTrip refuses v5 by name (kept in storage), returns v6 as saved, refuses other schemas', () => {
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
    assert.deepStrictEqual(loadDraftTrip('a'), {
      compatible: false,
      reason: '"old" can\'t be reopened here — it was saved in an older trip format that this version no longer opens. The saved trip has not been deleted.'
    });
    assert.deepStrictEqual(loadDraftTrip('b'), { compatible: true, trip: v6 });
    assert.equal(loadDraftTrip('c').compatible, false);
    assert.match(loadDraftTrip('c').reason, /door2-v4/);
    // Reading never rewrites the saved draft.
    assert.equal(JSON.parse(store.get('door2_drafts_v1'))[0].trip.versions.schema, 'door2-v5');
  } finally {
    delete globalThis.localStorage;
  }
});

// Was D3, "garbage v5 drafts return incompatible, never throw", run against upgradeV5toV6.
// The upgrader is gone; the live risk is now loadDraftTrip throwing on a malformed entry.
test("D3′: malformed v5 and schema-less drafts are refused, never thrown on, and left byte-identical", () => {
  const store = new Map();
  globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  try {
    const v5 = toV5(buildFilledTrip(spec(PERU, 10), PILOT_DATA, DRAFTS));
    const savedAt = '2026-09-22T00:00:00Z';
    // (a) Identifiable as v5: each gets the named v5 refusal.
    const v5Cases = {
      bare: { versions: { schema: 'door2-v5' } },
      withHistory: { ...v5, history: [v5, { versions: { schema: 'door2-v5' } }] },
      odd: { ...v5, spec: null, days: 'nope', routePlan: 7, history: [null] }
    };
    // (b) No usable schema: refused on the generic path; the v5 wording is not required.
    const schemaless = { empty: {}, null: null, noVersions: { spec: v5.spec, days: v5.days } };
    store.set(
      'door2_drafts_v1',
      JSON.stringify([
        ...Object.entries(v5Cases).map(([k, trip]) => ({ id: `v5:${k}`, label: `v5 ${k}`, savedAt, trip })),
        ...Object.entries(schemaless).map(([k, trip]) => ({ id: `none:${k}`, label: `none ${k}`, savedAt, trip }))
      ])
    );
    const bytes = store.get('door2_drafts_v1');
    for (const k of Object.keys(v5Cases)) {
      assert.deepStrictEqual(loadDraftTrip(`v5:${k}`), {
        compatible: false,
        reason: `"v5 ${k}" can't be reopened here — it was saved in an older trip format that this version no longer opens. The saved trip has not been deleted.`
      });
      assert.equal(store.get('door2_drafts_v1'), bytes, k);
    }
    for (const k of Object.keys(schemaless)) {
      const r = loadDraftTrip(`none:${k}`);
      assert.equal(r.compatible, false, k);
      assert.equal(typeof r.reason, 'string', k);
      assert.equal(store.get('door2_drafts_v1'), bytes, k);
    }
  } finally {
    delete globalThis.localStorage;
  }
});
