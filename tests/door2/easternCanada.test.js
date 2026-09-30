import { test } from 'node:test';
import assert from 'node:assert/strict';

import { checkVariantsSchedulable, compileFamilies } from '../../src/lib/door2/families.js';
import { PILOT_CONTENT } from '../../src/lib/door2/pilotContent.js';
import { PILOT_PLACES, PILOT_ROUTE_FAMILIES, PILOT_ROUTE_PACKAGES } from '../../src/lib/door2/pilotData.js';
import { PILOT_DATA, buildFilledTrip } from '../../src/lib/door2/planner.js';
import { listMoveOptions, previewAddOptional, previewMoveOptional, previewRemoveOptional } from '../../src/lib/door2/restructure.js';

// C3b: Eastern Canada, Route Family #2, on the real pilot data. The expected
// numbers are the ones measured in C1 (build brief §4); if the build
// disagrees, the build is wrong, not the table.
//
// E8 (Peru byte-identical) is C3a-T7 + C3a-T8 in reversible.test.js, which
// still compare against fixtures/peru-pre-c3a.json.

const FAMILY = 'ec_corridor';
const W = 'west_to_east';
const E = 'east_to_west';
const OTT = 'ottawa@corridor';
const NIA = 'niagara@toronto_spur';
const vid = (dir, ...picks) => [`${FAMILY}#${dir}`, ...picks].join('+');

const TOR = 'Toronto';
const MTL = 'Montréal';
const QC = 'Québec City';
const OTW = 'Ottawa';
const NF = 'Niagara Falls';

// §4, canonical rows (Niagara minimums +1 in C3c: the Toronto hub is 1-1). Each mirror is the same row reversed, same min/max.
const EXPECTED = [
  { picks: [], stops: [TOR, MTL, QC], minDays: 6, maxDays: 12 },
  { picks: [OTT], stops: [TOR, OTW, MTL, QC], minDays: 7, maxDays: 14 },
  { picks: [NIA], stops: [TOR, NF, TOR, MTL, QC], minDays: 8, maxDays: 15 },
  { picks: [OTT, NIA], stops: [TOR, NF, TOR, OTW, MTL, QC], minDays: 9, maxDays: 17 }
];

const packages = PILOT_ROUTE_PACKAGES.filter((p) => p.familyId === FAMILY);
const pkg = (id) => packages.find((p) => p.id === id);
const placeNames = (stops) => stops.map((s) => PILOT_PLACES[s.placeId].name);

function spec(totalDays, extra = {}) {
  return {
    originPlaceId: 'vancouver',
    destination: { kind: 'country', id: 'CA' },
    travelMonth: 6,
    totalDays,
    travellerType: 'couple',
    interests: [],
    pace: 'balanced',
    budget: 'mid',
    requiredPlaceIds: [],
    routeTemplateId: null,
    stops: [],
    choices: { pinned: [], rejected: [], placed: [] },
    ...extra
  };
}

function buildOn(variantId, totalDays) {
  const trip = buildFilledTrip(spec(totalDays, { routeTemplateId: variantId }));
  assert.ok(trip.routePlan, `built ${variantId} at ${totalDays} days: ${JSON.stringify(trip.detail ?? trip.state)}`);
  assert.equal(trip.routePlan.variantId, variantId);
  return trip;
}

/** Applies a one-proposal preview and checks the direction survived it. */
function applied(result, expectedVariantId, dir) {
  assert.equal(result.ok, true, JSON.stringify(result).slice(0, 400));
  const { routePlan, trip } = result.proposals[0];
  assert.equal(routePlan.variantId, expectedVariantId);
  assert.equal(routePlan.directionId, dir, `${expectedVariantId} keeps direction ${dir}`);
  assert.deepEqual(placeNames(routePlan.stops), placeNames(pkg(expectedVariantId).stops), `${expectedVariantId} stop order`);
  return trip;
}

// ---------------------------------------------------------------------------

test('E1: ec_corridor compiles to 8 variants whose ids, stop orders and day ranges match §4', () => {
  assert.deepEqual(
    packages.map((p) => p.id),
    [W, E].flatMap((dir) => EXPECTED.map((row) => vid(dir, ...row.picks)))
  );
  // Stop orders before day ranges: a wrong order usually also breaks
  // scheduling, and the order is the more useful failure to read.
  for (const dir of [W, E]) {
    for (const row of EXPECTED) {
      const id = vid(dir, ...row.picks);
      const stops = dir === W ? row.stops : [...row.stops].reverse();
      assert.deepEqual(placeNames(pkg(id).stops), stops, `${id} stop order`);
    }
  }
  const ranges = checkVariantsSchedulable(packages, PILOT_DATA);
  for (const dir of [W, E]) {
    for (const row of EXPECTED) {
      const id = vid(dir, ...row.picks);
      const r = ranges.find((x) => x.variantId === id);
      assert.deepEqual([r.minDays, r.maxDays], [row.minDays, row.maxDays], `${id} day range`);
    }
  }
});

test('E2: every east_to_west variant is its canonical twin reversed, with identical day ranges', () => {
  const ranges = checkVariantsSchedulable(packages, PILOT_DATA);
  for (const row of EXPECTED) {
    const c = pkg(vid(W, ...row.picks));
    const m = pkg(vid(E, ...row.picks));
    assert.deepEqual(m.stops, [...c.stops].reverse(), `${m.id} is ${c.id} reversed`);
    assert.equal(m.directionId, E);
    assert.equal(c.directionId, W);
    assert.deepEqual(m.optionals, c.optionals);
    assert.deepEqual(m.visitRules, c.visitRules);
    assert.deepEqual(m.assumptions, c.assumptions);
    const rc = ranges.find((x) => x.variantId === c.id);
    const rm = ranges.find((x) => x.variantId === m.id);
    assert.deepEqual([rm.minDays, rm.maxDays], [rc.minDays, rc.maxDays]);
  }
});

test('E3: checkVariantsSchedulable passes for all 8; none is held', () => {
  const report = checkVariantsSchedulable(packages, PILOT_DATA);
  assert.equal(report.length, 8);
  assert.ok(report.every((r) => r.held === false));
  // And nothing in the family is held when pending variants are included.
  const all = compileFamilies(PILOT_ROUTE_FAMILIES, { includePending: true }).filter((p) => p.familyId === FAMILY);
  assert.equal(all.length, 8);
  assert.ok(all.every((p) => p.held === false));
});

test('E4: add, remove and move each optional on a reversed trip; the direction is kept every time', () => {
  for (const [optionalId, pick] of [['ottawa', OTT], ['niagara', NIA]]) {
    // Add (default position, and naming the position).
    const bare = buildOn(vid(E), 12);
    applied(previewAddOptional(bare, optionalId), vid(E, pick), E);
    const positionId = pick.split('@')[1];
    const added = applied(previewAddOptional(bare, optionalId, positionId), vid(E, pick), E);

    // Remove, from the trip the add produced.
    applied(previewRemoveOptional(added, optionalId), vid(E), E);

    // Move: each optional has exactly one authored position, so there is
    // nowhere to move to. The sheet offers nothing and a move to the current
    // position is refused — and neither touches the trip's direction.
    const withIt = buildOn(vid(E, pick), 12);
    const sheet = listMoveOptions(withIt, optionalId);
    assert.deepEqual(sheet.options, [], `${optionalId}: no other position to move to`);
    const moved = previewMoveOptional(withIt, optionalId, positionId);
    assert.equal(moved.ok, false);
    assert.equal(moved.why, 'already_included');
    assert.equal(withIt.routePlan.directionId, E);
  }
});

test('E5: both optionals compile and schedule in both directions, and add/remove in either order', () => {
  for (const dir of [W, E]) {
    const bothId = vid(dir, OTT, NIA);
    const both = buildOn(bothId, 12);
    assert.equal(both.routePlan.directionId, dir);

    // Add Ottawa then Niagara, and Niagara then Ottawa: same trip shape.
    const bare = buildOn(vid(dir), 12);
    const viaOttawa = applied(previewAddOptional(bare, 'ottawa'), vid(dir, OTT), dir);
    applied(previewAddOptional(viaOttawa, 'niagara'), bothId, dir);
    const viaNiagara = applied(previewAddOptional(bare, 'niagara'), vid(dir, NIA), dir);
    applied(previewAddOptional(viaNiagara, 'ottawa'), bothId, dir);

    // Remove Ottawa then Niagara, and Niagara then Ottawa: back to the backbone.
    const noOttawa = applied(previewRemoveOptional(both, 'ottawa'), vid(dir, NIA), dir);
    applied(previewRemoveOptional(noOttawa, 'niagara'), vid(dir), dir);
    const noNiagara = applied(previewRemoveOptional(both, 'niagara'), vid(dir, OTT), dir);
    applied(previewRemoveOptional(noNiagara, 'ottawa'), vid(dir), dir);
  }
});

test('E6: variant names lead with the direction (§5.1); Peru, NYC and Tokyo names are unchanged', () => {
  assert.deepEqual(
    packages.map((p) => [p.id, p.name]),
    [
      [vid(W), 'Toronto to Québec City'],
      [vid(W, OTT), 'Toronto to Québec City, with Ottawa'],
      [vid(W, NIA), 'Toronto to Québec City, with Niagara Falls'],
      [vid(W, OTT, NIA), 'Toronto to Québec City, with Ottawa and Niagara Falls'],
      [vid(E), 'Québec City to Toronto'],
      [vid(E, OTT), 'Québec City to Toronto, with Ottawa'],
      [vid(E, NIA), 'Québec City to Toronto, with Niagara Falls'],
      [vid(E, OTT, NIA), 'Québec City to Toronto, with Ottawa and Niagara Falls']
    ]
  );
  assert.equal(new Set(packages.map((p) => p.name)).size, 8, 'no two variants share a name');
  assert.deepEqual(
    PILOT_ROUTE_PACKAGES.filter((p) => p.familyId !== FAMILY).map((p) => [p.id, p.name]),
    [
      ['nyc_city', 'New York City'],
      ['tokyo_city', 'Tokyo'],
      ['tokyo_city+kyoto@after_tokyo', 'Tokyo with Kyoto'],
      ['peru_classic', 'Peru classic: Lima, Cusco, Sacred Valley, Machu Picchu'],
      ['peru_classic+huaraz@after_lima_in', 'Peru classic with Huaraz'],
      ['peru_classic+huaraz@after_machu_picchu', 'Peru classic, then Huaraz']
    ]
  );
});

test('E7: previewRemoveOptional falls back to the backbone, in the trip\'s own direction', () => {
  // A reversed 17-day trip with both optionals. Removing Niagara leaves the
  // Ottawa variant (7–14), which can't absorb 17 days, so a shrink is offered.
  const both = buildOn(vid(E, OTT, NIA), 17);
  const plain = previewRemoveOptional(both, 'niagara');
  assert.equal(plain.ok, false);
  assert.deepEqual(plain.alternatives.map((a) => a.routePlan.variantId), [vid(E, OTT)], 'first choice: the remaining variant, shrunk');

  // Make the Ottawa variant unservable under the strict policy (Toronto–Ottawa
  // unreviewed): the only way left is the backbone fallback. It must be the
  // backbone in THIS trip's direction, not the canonical one.
  const data = {
    ...PILOT_DATA,
    connections: PILOT_DATA.connections.map((c) => (c.id === 'conn_yyz_yow_train' ? { ...c, reviewedAt: null } : c))
  };
  const fallback = previewRemoveOptional(both, 'niagara', { data, reviewPolicy: 'strict' });
  assert.equal(fallback.ok, false);
  assert.equal(fallback.alternatives.length, 1, JSON.stringify(fallback).slice(0, 400));
  const alt = fallback.alternatives[0];
  assert.equal(alt.routePlan.variantId, vid(E));
  assert.equal(alt.routePlan.directionId, E);
  assert.deepEqual(placeNames(alt.routePlan.stops), [QC, MTL, TOR]);
  assert.equal(alt.label, 'Remove Niagara Falls and shorten the trip by 5 days');
  assert.equal(alt.trip.spec.totalDays, 12);
});

test('E9: every variant fills at its maximum length with no empty activity slot', () => {
  const ranges = checkVariantsSchedulable(packages, PILOT_DATA);
  for (const { variantId, maxDays } of ranges) {
    const trip = buildOn(variantId, maxDays);
    const gaps = trip.contentGaps.map((g) => `day ${g.dayNumber} ${g.placeId} ${g.slot} (${g.blockId})`);
    assert.deepEqual(gaps, [], `${variantId} at ${maxDays} days has content gaps`);
  }
  assert.equal(
    PILOT_CONTENT.filter((c) => c.source?.note?.startsWith('Written for the Eastern Canada pilot family')).length,
    33
  );
});

test('E10: with both optionals at minimum length, no day carries more than one ground leg between different stops', () => {
  // C3c: at 0 hub nights the default trip put Niagara -> Toronto -> Montréal
  // (9.1h) on one day. The Toronto hub is now 1-1, like Peru's Lima hub.
  const ranges = checkVariantsSchedulable(packages, PILOT_DATA);
  for (const dir of [W, E]) {
    const id = vid(dir, OTT, NIA);
    const { minDays } = ranges.find((r) => r.variantId === id);
    const trip = buildOn(id, minDays);
    for (const day of trip.days) {
      const legs = day.blocks
        .filter((b) => b.type === 'travel' && b.transport && !b.transport.mode.startsWith('flight'))
        .filter((b) => b.transport.fromPlaceId !== b.transport.toPlaceId)
        .map((b) => `${b.transport.fromPlaceId} -> ${b.transport.toPlaceId}`);
      assert.ok(legs.length <= 1, `${id} at ${minDays} days, day ${day.dayNumber}: ${legs.join(', ')}`);
    }
  }
});
