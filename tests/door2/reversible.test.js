import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { FamilyAuthoringError, checkVariantsSchedulable, compileFamilies } from '../../src/lib/door2/families.js';
import { PILOT_ROUTE_FAMILIES, PILOT_ROUTE_PACKAGES } from '../../src/lib/door2/pilotData.js';
import { PILOT_DATA, buildFilledTrip } from '../../src/lib/door2/planner.js';
import {
  listMoveOptions,
  previewAddOptional,
  previewChangeLength,
  previewMoveOptional,
  previewRemoveOptional
} from '../../src/lib/door2/restructure.js';
import { selectRoutes } from '../../src/lib/door2/route.js';

// C3a: reversible route families, engine only. Everything below runs against a
// synthetic corridor defined in this file (the Eastern Canada topology with
// the names removed); nothing is added to pilotData.js.
//
//   backbone:   A → B → C
//   'mid':      D, between A and B, segmentOrder 2
//   'spur':     E then A_hub (A again), between A and B, segmentOrder 1
//   connections (all bidirectional): home↔A, home↔C, A↔B, A↔D, D↔B, B↔C, A↔E

const FAMILY_ID = 'demo_corridor';
const FWD = 'a_to_c';
const REV = 'c_to_a';

function place(id) {
  return { id, name: id.toUpperCase(), aliases: [], countryId: 'XX', coordinates: { lat: 0, lng: 0 }, visitKind: 'base', utcOffsetHours: 0 };
}

function train(from, to) {
  return {
    id: `conn_${from}_${to}`,
    fromPlaceId: from,
    toPlaceId: to,
    mode: 'train',
    inVehicleHours: 2,
    localTransferHours: { origin: 0.25, destination: 0.25 },
    direction: 'bidirectional',
    gatewayRequirements: [],
    assumptions: [],
    sources: [],
    reviewedBy: 'test',
    reviewedAt: '2026-09-28',
    version: 1
  };
}

const PLACES = Object.fromEntries(['home', 'pa', 'pb', 'pc', 'pd', 'pe'].map((id) => [id, place(id)]));
const CONNECTIONS = [
  train('home', 'pa'),
  train('home', 'pc'),
  train('pa', 'pb'),
  train('pa', 'pd'),
  train('pd', 'pb'),
  train('pb', 'pc'),
  train('pa', 'pe')
];

const stop = (placeId, minNights, maxNights) => ({ placeId, minNights, maxNights, excursions: [] });

/**
 * @param {Object} [o]
 * @param {Array} [o.directions]
 * @param {boolean} [o.midAlsoBC]  Give 'mid' a second position (between B and C), so it can move.
 */
function demoFamily({ directions, midAlsoBC = false } = {}) {
  return {
    id: FAMILY_ID,
    name: 'Demo corridor',
    countryId: 'XX',
    directions: directions ?? [
      { id: FWD, label: 'A to C', status: 'approved' },
      { id: REV, label: 'C to A', status: 'approved' }
    ],
    stops: {
      stop_a: stop('pa', 1, 2),
      stop_b: stop('pb', 1, 2),
      stop_c: stop('pc', 1, 2),
      stop_d: stop('pd', 1, 2),
      stop_e: stop('pe', 1, 2),
      stop_a_hub: stop('pa', 1, 1)
    },
    backbone: ['stop_a', 'stop_b', 'stop_c'],
    optional: [
      {
        id: 'mid',
        label: 'D',
        pitch: '',
        exclusiveWith: [],
        positions: [
          { id: 'ab', between: ['stop_a', 'stop_b'], insert: ['stop_d'], segmentOrder: 2, status: 'approved' },
          ...(midAlsoBC ? [{ id: 'bc', between: ['stop_b', 'stop_c'], insert: ['stop_d'], status: 'approved' }] : [])
        ]
      },
      {
        id: 'spur',
        label: 'E',
        pitch: '',
        exclusiveWith: [],
        positions: [{ id: 'ab', between: ['stop_a', 'stop_b'], insert: ['stop_e', 'stop_a_hub'], segmentOrder: 1, status: 'approved' }]
      }
    ]
  };
}

function dataFor(families, { includePending = false, extraConnections = [] } = {}) {
  const all = compileFamilies(families, { includePending: true });
  return {
    places: PLACES,
    connections: [...CONNECTIONS, ...extraConnections],
    routePackages: includePending ? all : all.filter((p) => !p.held),
    allRoutePackages: all
  };
}

function spec(totalDays, extra = {}) {
  return {
    originPlaceId: 'home',
    destination: { kind: 'country', id: 'XX' },
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

const vid = (dir, ...picks) => [`${FAMILY_ID}#${dir}`, ...picks].join('+');
const keysOf = (pkg) => pkg.stops.map((s) => s.id);
const planKeys = (trip) => trip.routePlan.stops.map((s) => s.key);

function buildOn(variantId, totalDays, data) {
  const trip = buildFilledTrip(spec(totalDays, { routeTemplateId: variantId }), data, { content: [] });
  assert.ok(trip.routePlan, `built a trip on ${variantId}: ${JSON.stringify(trip.detail ?? trip.state)}`);
  assert.equal(trip.routePlan.variantId, variantId);
  return trip;
}

function editOptions(families, data) {
  return { data, content: [], families };
}

function throwsReason(fn, reason) {
  assert.throws(fn, (err) => err instanceof FamilyAuthoringError && err.reason === reason, `expected FamilyAuthoringError(${reason})`);
}

// ---------------------------------------------------------------------------

test('C3a-T1: every mirrored variant is its canonical twin with the stops reversed', () => {
  const pkgs = compileFamilies([demoFamily()]);
  assert.deepEqual(
    pkgs.map((p) => p.id),
    [vid(FWD), vid(FWD, 'mid@ab'), vid(FWD, 'spur@ab'), vid(FWD, 'mid@ab', 'spur@ab'), vid(REV), vid(REV, 'mid@ab'), vid(REV, 'spur@ab'), vid(REV, 'mid@ab', 'spur@ab')]
  );
  const canonical = pkgs.filter((p) => p.directionId === FWD);
  const mirrored = pkgs.filter((p) => p.directionId === REV);
  assert.equal(canonical.length, 4);
  assert.equal(mirrored.length, 4);
  canonical.forEach((c, i) => {
    const m = mirrored[i];
    assert.equal(m.variantId, c.variantId.replace(`#${FWD}`, `#${REV}`));
    assert.deepEqual(m.stops, [...c.stops].reverse(), `${m.id} is ${c.id} reversed`);
    // Only id, directionId, stop order and the name's direction label differ (C3b).
    assert.equal(m.familyId, c.familyId);
    assert.equal(m.name, c.name.replace('A to C', 'C to A'));
    assert.notEqual(m.name, c.name);
    assert.deepEqual(m.optionals, c.optionals);
    assert.deepEqual(m.visitRules, c.visitRules);
    assert.equal(m.held, c.held);
  });
});

test('C3a-T2: structural edits on a reversed trip keep its direction', () => {
  const families = [demoFamily({ midAlsoBC: true })];
  const data = dataFor(families, { extraConnections: [train('pd', 'pc')] });
  const opts = editOptions(families, data);

  // Add: backbone C→A plus 'mid' stays C→A.
  const bare = buildOn(vid(REV), 6, data);
  assert.equal(bare.routePlan.directionId, REV);
  const added = previewAddOptional(bare, 'mid', 'ab', opts);
  assert.equal(added.ok, true, JSON.stringify(added));
  const addedPlan = added.proposals[0].routePlan;
  assert.equal(addedPlan.variantId, vid(REV, 'mid@ab'));
  assert.equal(addedPlan.directionId, REV);
  assert.deepEqual(addedPlan.stops.map((s) => s.key), ['stop_c', 'stop_b', 'stop_d', 'stop_a']);

  // Remove: C→A with 'mid' and 'spur', drop 'mid', still C→A.
  const both = buildOn(vid(REV, 'mid@ab', 'spur@ab'), 10, data);
  const removed = previewRemoveOptional(both, 'mid', opts);
  assert.equal(removed.ok, true, JSON.stringify(removed));
  const removedPlan = removed.proposals[0].routePlan;
  assert.equal(removedPlan.variantId, vid(REV, 'spur@ab'));
  assert.equal(removedPlan.directionId, REV);
  assert.deepEqual(removedPlan.stops.map((s) => s.key), ['stop_c', 'stop_b', 'stop_a_hub', 'stop_e', 'stop_a']);

  // Move: 'mid' from A–B to B–C on a C→A trip, still C→A.
  const withMid = buildOn(vid(REV, 'mid@ab'), 8, data);
  const moved = previewMoveOptional(withMid, 'mid', 'bc', opts);
  assert.equal(moved.ok, true, JSON.stringify(moved));
  const movedPlan = moved.proposals[0].routePlan;
  assert.equal(movedPlan.variantId, vid(REV, 'mid@bc'));
  assert.equal(movedPlan.directionId, REV);
  assert.deepEqual(movedPlan.stops.map((s) => s.key), ['stop_c', 'stop_d', 'stop_b', 'stop_a']);

  // The move sheet names the segment's first stop in the direction travelled.
  const sheet = listMoveOptions(withMid, 'mid', opts);
  assert.deepEqual(sheet.current, { positionId: 'ab', after: 'pb' });
  assert.deepEqual(sheet.options.map((o) => [o.positionId, o.after]), [['bc', 'pc']]);

  // "Switch to the shorter route" offers the backbone in the trip's direction.
  const shorter = previewChangeLength(withMid, withMid.routePlan.minDays - 1, opts);
  assert.equal(shorter.ok, false);
  assert.equal(shorter.alternatives.length, 1, JSON.stringify(shorter));
  assert.equal(shorter.alternatives[0].routePlan.variantId, vid(REV));
  assert.equal(shorter.alternatives[0].routePlan.directionId, REV);
  assert.deepEqual(planKeys(shorter.alternatives[0].trip), ['stop_c', 'stop_b', 'stop_a']);
});

test('C3a-T3: all 8 variants schedule; twins report identical minDays and maxDays', () => {
  const pkgs = compileFamilies([demoFamily()]);
  const report = checkVariantsSchedulable(pkgs, dataFor([demoFamily()]), { originPlaceId: 'home' });
  assert.equal(report.length, 8);
  for (const r of report) assert.equal(r.held, false);
  for (let i = 0; i < 4; i++) {
    const c = report[i];
    const m = report[i + 4];
    assert.equal(m.variantId, c.variantId.replace(`#${FWD}`, `#${REV}`));
    assert.deepEqual([m.minDays, m.maxDays], [c.minDays, c.maxDays], `${c.variantId} vs ${m.variantId}`);
  }
});

test('C3a-T4: segmentOrder places the spur nearer A than the mid-route stop, and the mirror keeps it', () => {
  const pkgs = compileFamilies([demoFamily()]);
  const both = pkgs.find((p) => p.id === vid(FWD, 'mid@ab', 'spur@ab'));
  const bothRev = pkgs.find((p) => p.id === vid(REV, 'mid@ab', 'spur@ab'));
  assert.deepEqual(keysOf(both), ['stop_a', 'stop_e', 'stop_a_hub', 'stop_d', 'stop_b', 'stop_c']);
  assert.deepEqual(keysOf(bothRev), ['stop_c', 'stop_b', 'stop_d', 'stop_a_hub', 'stop_e', 'stop_a']);

  // segmentOrder, not declaration order, decides: swap the declarations, same result.
  const swapped = demoFamily();
  swapped.optional.reverse();
  const reordered = compileFamilies([swapped]).find((p) => p.directionId === FWD && p.optionals.length === 2);
  assert.deepEqual(keysOf(reordered), ['stop_a', 'stop_e', 'stop_a_hub', 'stop_d', 'stop_b', 'stop_c']);
});

test('C3a-T5: authoring errors for directions and between-positions', () => {
  // `after` in a reversible family.
  const withAfter = demoFamily();
  withAfter.optional[0].positions[0] = { id: 'ab', after: 'stop_a', insert: ['stop_d'], status: 'approved' };
  throwsReason(() => compileFamilies([withAfter]), 'after_position_in_reversible_family');

  // `between` naming keys that aren't adjacent in the backbone.
  const gap = demoFamily();
  gap.optional[0].positions[0].between = ['stop_a', 'stop_c'];
  throwsReason(() => compileFamilies([gap]), 'segment_not_adjacent');
  const backwards = demoFamily();
  backwards.optional[0].positions[0].between = ['stop_b', 'stop_a'];
  throwsReason(() => compileFamilies([backwards]), 'segment_not_adjacent');

  // Three directions.
  const three = demoFamily();
  three.directions.push({ id: 'loop', label: 'Loop', status: 'approved' });
  throwsReason(() => compileFamilies([three]), 'too_many_directions');

  // Both anchors on one position.
  const both = demoFamily();
  both.optional[0].positions[0].after = 'stop_a';
  throwsReason(() => compileFamilies([both]), 'position_anchor_ambiguous');

  // Two co-pickable inserts in one segment must be ordered explicitly.
  const unordered = demoFamily();
  delete unordered.optional[1].positions[0].segmentOrder;
  throwsReason(() => compileFamilies([unordered]), 'segment_order_missing');
  const tied = demoFamily();
  tied.optional[1].positions[0].segmentOrder = 2;
  throwsReason(() => compileFamilies([tied]), 'segment_order_duplicate');
});

test('C3a-T5b: the variant cap applies after the direction expansion', () => {
  const keys = ['p0', 'p1', 'p2', 'p3', 'p4', 'p5'];
  const segs = keys.slice(0, -1).map((k, i) => [k, keys[i + 1]]);
  const family = (nOpt2Positions, directions) => ({
    id: 'cap',
    name: 'Cap',
    countryId: 'XX',
    ...(directions ? { directions: [{ id: 'f', label: 'F', status: 'approved' }, { id: 'r', label: 'R', status: 'approved' }] } : {}),
    stops: Object.fromEntries([...keys, 'x', 'y'].map((k) => [k, stop('pa', 1, 1)])),
    backbone: keys,
    optional: [
      { id: 'o1', label: 'O1', pitch: '', exclusiveWith: [], positions: segs.slice(0, 2).map((s, i) => ({ id: `s${i}`, between: s, insert: ['x'], segmentOrder: 1, status: 'approved' })) },
      { id: 'o2', label: 'O2', pitch: '', exclusiveWith: [], positions: segs.slice(0, nOpt2Positions).map((s, i) => ({ id: `s${i}`, between: s, insert: ['y'], segmentOrder: 2, status: 'approved' })) }
    ]
  });
  // 3 × 4 = 12 combinations → 24 variants with directions: exactly at the cap.
  assert.equal(compileFamilies([family(3, true)]).length, 24);
  // 3 × 5 = 15 combinations: fine one-way, 30 variants two-way is over.
  assert.equal(compileFamilies([family(4, false)]).length, 15);
  throwsReason(() => compileFamilies([family(4, true)]), 'too_many_variants');
});

test('C3a-T6: a pending direction holds its variants everywhere', () => {
  const families = [
    demoFamily({
      midAlsoBC: true,
      directions: [
        { id: FWD, label: 'A to C', status: 'approved' },
        { id: REV, label: 'C to A', status: 'pending_review' }
      ]
    })
  ];
  // compileFamilies: excluded by default, returned (held) with includePending.
  const served = compileFamilies(families);
  assert.ok(served.length > 0 && served.every((p) => p.directionId === FWD && !p.held));
  const all = compileFamilies(families, { includePending: true });
  assert.deepEqual(
    all.filter((p) => p.held).map((p) => p.id),
    all.filter((p) => p.directionId === REV).map((p) => p.id)
  );
  assert.equal(all.filter((p) => p.held).length, served.length);

  // selectRoutes never offers it.
  const data = dataFor(families, { extraConnections: [train('pd', 'pc')] });
  const routes = selectRoutes(spec(8), data);
  assert.equal(routes.ok, true);
  assert.ok(routes.value.every((r) => !r.routePackageId.includes(`#${REV}`)));

  // Every restructure entry point that resolves a variant refuses the held
  // direction. Control first: the same edits, direction approved, all work.
  const edits = (fams, d, buildData) => {
    const opts = editOptions(fams, d);
    const bare = buildOn(vid(REV), 6, buildData);
    const withMid = buildOn(vid(REV, 'mid@ab'), 7, buildData);
    return {
      add: previewAddOptional(bare, 'mid', 'ab', opts),
      remove: previewRemoveOptional(withMid, 'mid', opts),
      move: previewMoveOptional(withMid, 'mid', 'bc', opts),
      moveSheet: listMoveOptions(withMid, 'mid', opts).options,
      shorter: previewChangeLength(withMid, withMid.routePlan.minDays - 1, opts)
    };
  };
  const approvedFamilies = [demoFamily({ midAlsoBC: true })];
  const approvedData = dataFor(approvedFamilies, { extraConnections: [train('pd', 'pc')] });
  const control = edits(approvedFamilies, approvedData, approvedData);
  assert.equal(control.add.ok, true);
  assert.equal(control.remove.ok, true);
  assert.equal(control.move.ok, true);
  assert.equal(control.moveSheet.length, 1);
  assert.equal(control.shorter.alternatives.length, 1);

  const held = edits(families, data, { ...data, routePackages: all });
  assert.deepEqual([held.add.ok, held.add.why], [false, 'exclusive_optional']);
  assert.deepEqual([held.remove.ok, held.remove.why], [false, 'not_available']);
  assert.deepEqual([held.move.ok, held.move.why], [false, 'not_available']);
  assert.deepEqual(held.moveSheet, []);
  assert.deepEqual([held.shorter.ok, held.shorter.alternatives], [false, []]);

  // A pending position still holds its variants, in both directions.
  const pendingPos = demoFamily();
  pendingPos.optional[0].positions[0].status = 'pending_review';
  assert.deepEqual(
    compileFamilies([pendingPos], { includePending: true }).filter((p) => p.held).map((p) => p.id),
    [vid(FWD, 'mid@ab'), vid(FWD, 'mid@ab', 'spur@ab'), vid(REV, 'mid@ab'), vid(REV, 'mid@ab', 'spur@ab')]
  );
});

test('C3a: the canonical direction is the default trip, by catalogue order rather than id', () => {
  // 'inbound' sorts before 'outbound', so an id-string tiebreak would pick the mirror.
  const families = [
    demoFamily({
      directions: [
        { id: 'outbound', label: 'Out', status: 'approved' },
        { id: 'inbound', label: 'Back', status: 'approved' }
      ]
    })
  ];
  const data = dataFor(families);
  const routes = selectRoutes(spec(6), data);
  assert.equal(routes.ok, true);
  assert.equal(routes.value[0].routePackageId, `${FAMILY_ID}#outbound`);
  const trip = buildFilledTrip(spec(6), data, { content: [] });
  assert.equal(trip.routePlan.variantId, `${FAMILY_ID}#outbound`);
  assert.equal(trip.routePlan.directionId, 'outbound');
  assert.deepEqual(planKeys(trip), ['stop_a', 'stop_b', 'stop_c']);
});

// ---------------------------------------------------------------------------
// Peru: pinned to fixtures/peru-pre-c3a.json, generated from 30e901b (before
// C3a) by the same code as below. Hashes are sha256 of JSON.stringify.

const GOLDEN = JSON.parse(readFileSync(new URL('./fixtures/peru-pre-c3a.json', import.meta.url), 'utf8'));
const sha = (x) => createHash('sha256').update(JSON.stringify(x)).digest('hex');
const peruSpec = (totalDays, extra = {}) => ({
  originPlaceId: 'vancouver',
  destination: { kind: 'country', id: 'PE' },
  travelMonth: 10,
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
});

test('C3a-T7: Peru compiles to the same ids, stop keys and order as before', () => {
  // The fixture predates Eastern Canada (C3b), which is additive: compare the
  // families it captured.
  const compiled = compileFamilies(PILOT_ROUTE_FAMILIES.filter((f) => f.id !== 'ec_corridor'), { includePending: true });
  assert.deepEqual(
    compiled.map((p) => ({ id: p.id, stopKeys: keysOf(p) })),
    GOLDEN.compiled
  );
  assert.equal(sha(compiled), GOLDEN.compiledHash);
  for (const p of compiled) assert.equal('directionId' in p, false);
});

test('C3a-T8: Peru trips, intake builds and structural edits are byte-identical to before', () => {
  const ranges = checkVariantsSchedulable(PILOT_ROUTE_PACKAGES.filter((p) => p.familyId === 'peru_classic'), PILOT_DATA);
  assert.deepEqual(ranges, GOLDEN.ranges);
  assert.equal(ranges.length, 3);
  let checked = 0;
  for (const { variantId, minDays, maxDays } of ranges) {
    for (let d = minDays; d <= maxDays; d++) {
      const k = `${variantId}:${d}`;
      const t = buildFilledTrip(peruSpec(d, { routeTemplateId: variantId }));
      assert.ok(t.routePlan, k);
      assert.equal('directionId' in t.routePlan, false);
      assert.equal(sha(t), GOLDEN.trips[k], `trip ${k}`);
      assert.equal(sha(previewAddOptional(t, 'huaraz')), GOLDEN.edits[`${k}:add`], `${k} add`);
      assert.equal(sha(previewRemoveOptional(t, 'huaraz')), GOLDEN.edits[`${k}:remove`], `${k} remove`);
      assert.equal(sha(previewMoveOptional(t, 'huaraz', 'after_lima_in')), GOLDEN.edits[`${k}:move_lima`], `${k} move_lima`);
      assert.equal(sha(previewMoveOptional(t, 'huaraz', 'after_machu_picchu')), GOLDEN.edits[`${k}:move_mp`], `${k} move_mp`);
      assert.equal(sha(listMoveOptions(t, 'huaraz')), GOLDEN.edits[`${k}:moves`], `${k} moves`);
      assert.equal(sha(previewChangeLength(t, d - 3)), GOLDEN.edits[`${k}:len-3`], `${k} len-3`);
      assert.equal(sha(previewChangeLength(t, d + 1)), GOLDEN.edits[`${k}:len+1`], `${k} len+1`);
      checked++;
    }
  }
  assert.equal(checked, Object.keys(GOLDEN.trips).length);
  // Unpinned intake builds exercise the ranking tiebreak (the two Huaraz variants tie on places and stops).
  for (let d = 4; d <= 20; d++) {
    assert.equal(sha(buildFilledTrip(peruSpec(d))), GOLDEN.intake[`PE:${d}`], `intake ${d}`);
    assert.equal(sha(buildFilledTrip(peruSpec(d, { requiredPlaceIds: ['huaraz'] }))), GOLDEN.intake[`PE+hz:${d}`], `intake+huaraz ${d}`);
  }
});
