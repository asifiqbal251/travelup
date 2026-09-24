import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  FamilyAuthoringError,
  MAX_VARIANTS_PER_FAMILY,
  checkVariantsSchedulable,
  compileFamilies,
  routePackage
} from '../../src/lib/door2/families.js';
import { PILOT_ROUTE_FAMILIES, PILOT_ROUTE_PACKAGES, PILOT_ROUTE_PACKAGES_ALL } from '../../src/lib/door2/pilotData.js';
import { PILOT_DATA, buildFilledTrip } from '../../src/lib/door2/planner.js';
import { selectRoutes } from '../../src/lib/door2/route.js';

// ---------------------------------------------------------------------------
// Snapshot of the hand-written packages as they were before Route Families
// (pilotData.js at the Step 0 checkpoint). Kept here as the identity oracle.

const MP = Object.freeze({ placeId: 'machu_picchu', connectionId: 'conn_agc_mp_shuttle', hoursOnSite: 4 });
const CUSCO_ACCLIMATISATION =
  'Cusco minimum is 2 nights for altitude acclimatisation (3,400 m) before the Sacred Valley and Machu Picchu.';
const st = (id, placeId, minNights, maxNights, excursions = []) => ({ id, placeId, minNights, maxNights, excursions });

const OLD_PACKAGES = [
  routePackage({ id: 'nyc_city', name: 'New York City', countryId: 'US', stops: [st('nyc_base', 'new_york', 2, 10)] }),
  routePackage({ id: 'tokyo_city', name: 'Tokyo', countryId: 'JP', preferredGatewayId: 'NRT', stops: [st('tokyo_base', 'tokyo', 3, 10)] }),
  routePackage({
    id: 'peru_classic',
    name: 'Peru classic: Lima, Cusco, Sacred Valley, Machu Picchu',
    countryId: 'PE',
    assumptions: [CUSCO_ACCLIMATISATION],
    stops: [
      st('pc_lima_in', 'lima', 1, 3),
      st('pc_cusco', 'cusco', 2, 4),
      st('pc_sacred_valley', 'ollantaytambo', 0, 1),
      st('pc_aguas', 'aguas_calientes', 1, 2, [MP]),
      st('pc_olly_return', 'ollantaytambo', 0, 0),
      st('pc_cusco_return', 'cusco', 0, 0),
      st('pc_lima_out', 'lima', 1, 1)
    ]
  }),
  routePackage({
    id: 'peru_classic_huaraz',
    name: 'Peru classic with Huaraz',
    countryId: 'PE',
    assumptions: [
      CUSCO_ACCLIMATISATION,
      'Huaraz to Cusco backtracks through the Lima hub: there is deliberately no direct Huaraz-Cusco connection.'
    ],
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
  })
];
const OLD_DATA = { places: PILOT_DATA.places, connections: PILOT_DATA.connections, routePackages: OLD_PACKAGES };
const NEW_FIELDS = ['familyId', 'variantId', 'optionals', 'aliases', 'held'];
const withoutNewFields = (pkg) => Object.fromEntries(Object.entries(pkg).filter(([k]) => !NEW_FIELDS.includes(k)));

const HUARAZ_VARIANT = 'peru_classic+huaraz@after_lima_in';
const HELD_VARIANT = 'peru_classic+huaraz@after_machu_picchu';

/** Old Huaraz output → new identity: trip id / routeTemplateId, and ph_* stop keys → pc_*. */
function mapOldHuaraz(trip) {
  const json = JSON.stringify(trip)
    .replaceAll('peru_classic_huaraz', HUARAZ_VARIANT)
    .replaceAll('ph_lima_mid', 'pc_lima_hub')
    .replace(/(?<![a-z0-9])ph_/g, 'pc_');
  return JSON.parse(json);
}

const DRAFTS = { reviewPolicy: 'allow_drafts' };
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
const PERU = { kind: 'country', id: 'PE' };

// ---------------------------------------------------------------------------

test('RF1: pilot families compile to 4 served packages, 5 with includePending', () => {
  assert.deepEqual(PILOT_ROUTE_PACKAGES.map((p) => p.id), ['nyc_city', 'tokyo_city', 'peru_classic', HUARAZ_VARIANT]);
  assert.deepEqual(compileFamilies(PILOT_ROUTE_FAMILIES).map((p) => p.id), PILOT_ROUTE_PACKAGES.map((p) => p.id));
  const all = compileFamilies(PILOT_ROUTE_FAMILIES, { includePending: true });
  assert.deepEqual(all.map((p) => p.id), ['nyc_city', 'tokyo_city', 'peru_classic', HUARAZ_VARIANT, HELD_VARIANT]);
  assert.deepEqual(all, PILOT_ROUTE_PACKAGES_ALL);
  assert.deepEqual(all.map((p) => p.held), [false, false, false, false, true]);
  const held = all.find((p) => p.id === HELD_VARIANT);
  assert.equal(held.name, 'Peru classic, then Huaraz');
  assert.deepEqual(held.stops.map((s) => s.id).slice(-3), ['pc_lima_out', 'pc_huaraz', 'pc_lima_hub']);
  assert.ok(held.assumptions.some((a) => a.startsWith('Pending altitude/connection review')));
});

test('RF2: backbone identity — compiled packages equal the old hand-written ones apart from new fields', () => {
  for (const id of ['nyc_city', 'tokyo_city', 'peru_classic']) {
    const compiled = PILOT_ROUTE_PACKAGES.find((p) => p.id === id);
    const old = OLD_PACKAGES.find((p) => p.id === id);
    assert.deepStrictEqual(withoutNewFields(compiled), old, id);
    assert.equal(compiled.familyId, id);
    assert.equal(compiled.variantId, id);
    assert.deepEqual(compiled.optionals, []);
    assert.deepEqual(compiled.aliases, []);
  }
});

test('RF3: Huaraz variant package equals the old one after the key rename', () => {
  const compiled = PILOT_ROUTE_PACKAGES.find((p) => p.id === HUARAZ_VARIANT);
  const old = OLD_PACKAGES.find((p) => p.id === 'peru_classic_huaraz');
  assert.deepStrictEqual(withoutNewFields(compiled), { ...mapOldHuaraz(old), id: HUARAZ_VARIANT });
  assert.deepEqual(compiled.aliases, ['peru_classic_huaraz']);
  assert.deepEqual(compiled.optionals, [{ optionalId: 'huaraz', positionId: 'after_lima_in', stopKeys: ['pc_huaraz', 'pc_lima_hub'] }]);
});

test('RF4: backbone trips are byte-identical to the old packages (every length, every city/country)', () => {
  const cases = [
    [PERU, 8, 14],
    [{ kind: 'place', id: 'new_york' }, 3, 11],
    [{ kind: 'place', id: 'tokyo' }, 5, 12]
  ];
  for (const [destination, from, to] of cases) {
    for (let n = from; n <= to; n++) {
      const s = spec(destination, n);
      const before = JSON.stringify(buildFilledTrip(s, OLD_DATA, DRAFTS));
      const after = JSON.stringify(buildFilledTrip(s, PILOT_DATA, DRAFTS));
      assert.equal(after, before, `${destination.id} ${n} days`);
    }
  }
});

// Step 3 note: trip.routePlan carries family metadata (familyId, optionals, stop roles) that the
// old hand-written package can't have, so routePlan is compared separately in draftUpgrade.test.js.
const withoutRoutePlan = (t) => {
  if (t.ok === false) return t;
  const { routePlan, ...rest } = t;
  return rest;
};

test('RF5: Huaraz variant identity — every length 11..18 equals the old output after mapping keys', () => {
  for (const required of [['huaraz'], ['huaraz', 'machu_picchu']]) {
    for (let n = 11; n <= 18; n++) {
      const s = spec(PERU, n, required);
      const before = withoutRoutePlan(mapOldHuaraz(buildFilledTrip(s, OLD_DATA, DRAFTS)));
      const after = buildFilledTrip(s, PILOT_DATA, DRAFTS);
      assert.deepStrictEqual(withoutRoutePlan(after), before, `${required.join('+')} ${n} days`);
      assert.equal(after.routePlan.variantId, HUARAZ_VARIANT);
      assert.deepEqual(after.routePlan.stops.map((x) => [x.key, x.nights]), after.spec.stops.map((x) => [x.id, x.nights]));
    }
  }
  // Below its minimum, both refuse the same way (except the package id).
  const s = spec(PERU, 10, ['huaraz']);
  assert.deepStrictEqual(buildFilledTrip(s, PILOT_DATA, DRAFTS), mapOldHuaraz(buildFilledTrip(s, OLD_DATA, DRAFTS)));
});

test('RF6: routeTemplateId "peru_classic_huaraz" (alias) still selects the Huaraz variant', () => {
  const r = selectRoutes({ ...spec(PERU, 12), routeTemplateId: 'peru_classic_huaraz' }, PILOT_DATA);
  assert.equal(r.ok, true);
  assert.equal(r.value[0].routePackageId, HUARAZ_VARIANT);
  const direct = selectRoutes({ ...spec(PERU, 12), routeTemplateId: HUARAZ_VARIANT }, PILOT_DATA);
  assert.deepStrictEqual(direct, r);
  // Without a template, the backbone still ranks first.
  assert.equal(selectRoutes(spec(PERU, 12), PILOT_DATA).value[0].routePackageId, 'peru_classic');
  // A held variant is never selectable by a traveller, even by id.
  const held = selectRoutes({ ...spec(PERU, 12), routeTemplateId: HELD_VARIANT }, PILOT_DATA);
  assert.equal(held.value.some((x) => x.routePackageId === HELD_VARIANT), false);
});

// Test-only family builder.
const fstop = (placeId, minNights = 1, maxNights = 2) => ({ placeId, minNights, maxNights, excursions: [] });
function tinyFamily(positions, extra = {}) {
  return {
    id: 'tiny',
    name: 'Tiny',
    countryId: 'PE',
    stops: { a: fstop('lima'), b: fstop('cusco', 2, 4), ...Object.fromEntries(positions.map((p, i) => [`x${i}`, fstop('lima')])) },
    backbone: ['a', 'b'],
    optional: [{ id: 'opt', label: 'Opt', pitch: '', exclusiveWith: [], positions }],
    ...extra
  };
}
const approvedAt = (i, after = 'a') => ({ id: `p${i}`, after, insert: [`x${i}`], status: 'approved' });

test('RF7: variant cap — 24 compile, 25 throw naming the family and count', () => {
  assert.equal(MAX_VARIANTS_PER_FAMILY, 24);
  const ok = compileFamilies([tinyFamily(Array.from({ length: 23 }, (_, i) => approvedAt(i)))]);
  assert.equal(ok.length, 24);
  assert.throws(
    () => compileFamilies([tinyFamily(Array.from({ length: 24 }, (_, i) => approvedAt(i)))]),
    (err) => err instanceof FamilyAuthoringError && err.reason === 'too_many_variants' && err.detail.familyId === 'tiny' && err.detail.count === 25
  );
});

test('RF8: a duplicate stop key throws; a missing `after` key throws', () => {
  const dup = tinyFamily([{ id: 'p0', after: 'a', insert: ['b'], status: 'approved' }]);
  assert.throws(() => compileFamilies([dup]), (err) => err instanceof FamilyAuthoringError && err.reason === 'duplicate_stop_key' && err.detail.stopKey === 'b');
  const missingAfter = tinyFamily([{ id: 'p0', after: 'x0', insert: ['x0'], status: 'approved' }]);
  assert.throws(() => compileFamilies([missingAfter]), (err) => err instanceof FamilyAuthoringError && err.reason === 'after_key_missing');
  const unknownAfter = tinyFamily([{ id: 'p0', after: 'nowhere', insert: ['x0'], status: 'approved' }]);
  assert.throws(() => compileFamilies([unknownAfter]), (err) => err instanceof FamilyAuthoringError && err.reason === 'after_key_missing');
  const unknownInsert = tinyFamily([{ id: 'p0', after: 'a', insert: ['zz'], status: 'approved' }]);
  assert.throws(() => compileFamilies([unknownInsert]), (err) => err instanceof FamilyAuthoringError && err.reason === 'unknown_stop_key');
});

test('RF9: enumeration order, exclusiveWith, overrides per variant, names and deterministic ids', () => {
  const fam = {
    id: 'fam',
    name: 'Fam',
    countryId: 'PE',
    stops: { a: fstop('lima', 1, 3), b: fstop('cusco', 2, 4), h: fstop('huaraz', 2, 4), k: fstop('lima', 1, 1) },
    backbone: ['a', 'b'],
    optional: [
      { id: 'one', label: 'One', pitch: '', exclusiveWith: ['two'], positions: [{ id: 'p', after: 'a', insert: ['h'], status: 'approved', overrides: { a: { maxNights: 2 } } }] },
      { id: 'two', label: 'Two', pitch: '', exclusiveWith: [], positions: [{ id: 'q', after: 'b', insert: ['k'], status: 'approved' }] }
    ]
  };
  const pkgs = compileFamilies([fam]);
  assert.deepEqual(pkgs.map((p) => p.id), ['fam', 'fam+one@p', 'fam+two@q']);
  assert.equal(pkgs[1].name, 'Fam with One');
  assert.equal(pkgs[1].stops[0].maxNights, 2);
  assert.equal(pkgs[0].stops[0].maxNights, 3);
  assert.equal(pkgs[2].stops[0].maxNights, 3);
  const noExclusion = { ...fam, optional: fam.optional.map((o) => ({ ...o, exclusiveWith: [] })) };
  assert.deepEqual(compileFamilies([noExclusion]).map((p) => p.id), ['fam', 'fam+one@p', 'fam+two@q', 'fam+one@p+two@q']);
  assert.deepStrictEqual(compileFamilies([fam]), pkgs);
});

test('RF10: checkVariantsSchedulable passes for every served variant; the held variant is reported', () => {
  const served = checkVariantsSchedulable(PILOT_ROUTE_PACKAGES, PILOT_DATA);
  assert.deepEqual(served, [
    { variantId: 'nyc_city', held: false, minDays: 3, maxDays: 11 },
    { variantId: 'tokyo_city', held: false, minDays: 5, maxDays: 12 },
    { variantId: 'peru_classic', held: false, minDays: 8, maxDays: 14 },
    { variantId: HUARAZ_VARIANT, held: false, minDays: 11, maxDays: 18 }
  ]);
  // Held position after Machu Picchu: compiled and checked, never served.
  const held = checkVariantsSchedulable(PILOT_ROUTE_PACKAGES_ALL.filter((p) => p.held), PILOT_DATA);
  assert.deepEqual(held, [{ variantId: HELD_VARIANT, held: true, minDays: 11, maxDays: 19 }]);
});

test('RF11: checkVariantsSchedulable names the variant when a leg has no connection', () => {
  const fam = {
    id: 'bad',
    name: 'Bad',
    countryId: 'PE',
    stops: { a: fstop('lima', 1, 2), h: fstop('huaraz', 2, 4), c: fstop('cusco', 2, 4), z: fstop('lima', 1, 1) },
    backbone: ['a', 'c', 'z'],
    optional: [{ id: 'hz', label: 'Hz', pitch: '', exclusiveWith: [], positions: [{ id: 'direct', after: 'a', insert: ['h'], status: 'approved' }] }]
  };
  const pkgs = compileFamilies([fam]);
  assert.deepEqual(checkVariantsSchedulable([pkgs[0]], PILOT_DATA).map((r) => r.variantId), ['bad']);
  assert.throws(
    () => checkVariantsSchedulable(pkgs, PILOT_DATA),
    (err) => err instanceof FamilyAuthoringError && err.detail.variantId === 'bad+hz@direct' && err.reason === 'route_not_selectable'
  );
});
