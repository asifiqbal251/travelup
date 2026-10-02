import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { assembleSkeletonTripFromSequence } from '../../src/lib/door2/assemble.js';
import { DEFAULT_BUFFER_RULESET } from '../../src/lib/door2/bufferRuleset.js';
import { loadDraftTrip, saveDraftTrip } from '../../src/lib/door2/draftStorage.js';
import { compileFamilies } from '../../src/lib/door2/families.js';
import { fillTrip } from '../../src/lib/door2/fill.js';
import { materialiseTripSequence } from '../../src/lib/door2/materialise.js';
import { PILOT_CONTENT } from '../../src/lib/door2/pilotContent.js';
import { PILOT_DATA, buildFilledTrip, buildSkeletonTrip, buildTripFromRoutePlan, findRoutePackage } from '../../src/lib/door2/planner.js';
import * as R from '../../src/lib/door2/restructure.js';
import { tripSequenceFromPlan } from '../../src/lib/door2/tripSequence.js';
import { synBundle, synSpec } from './helpers/syntheticHub.js';

// F4 bridge: assembleSkeletonTripFromSequence composes an UNFILLED skeleton Trip
// from {sequence, plan, skeleton} plus explicit traveller and lifecycle inputs.
// Parity is with the skeleton path (buildSkeletonTrip / buildTripFromRoutePlan),
// never with a filled Trip. Assembly enforces input consistency; it does not
// reschedule, reselect routes or revalidate menus, and no test here claims it does.

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

/** The four reference trips, as the traveller's requests. */
const REFERENCE = {
  'Peru 10d': spec(PE, 10, 10),
  'Canada 12d + Ottawa': spec(CA, 12, 6, 'ec_corridor#west_to_east+ottawa@corridor'),
  'Japan 14d + Kyoto': spec(JP, 14, 10, 'tokyo_city+kyoto@after_tokyo'),
  'Tokyo-only 7d': spec(JP, 7, 10, 'tokyo_city')
};

function skeletonTrip(request, data = PILOT_DATA) {
  const trip = buildSkeletonTrip(request, data);
  assert.ok(trip.routePlan, JSON.stringify(trip.detail ?? trip.state));
  return trip;
}

/** Stage 1 and stage 2 for a plan: the sequence and the materialised skeleton. */
function stages(travellerSpec, plan, data = PILOT_DATA) {
  const sequence = tripSequenceFromPlan(travellerSpec, plan, { id: 'seq-assemble', data });
  const skeleton = materialiseTripSequence(sequence, { places: data.places, connections: data.connections }).value;
  return { sequence, skeleton };
}

/** The full input record: stage outputs for `plan`, and the traveller's spec. */
function inputFor(travellerSpec, plan, status, data = PILOT_DATA) {
  return {
    ...stages(travellerSpec, plan, data),
    plan,
    spec: travellerSpec,
    status,
    contentVersion: 'none',
    bufferRuleset: DEFAULT_BUFFER_RULESET,
    history: []
  };
}

const assemble = (input) => {
  const result = assembleSkeletonTripFromSequence(input);
  assert.equal(result.ok, true);
  return result.value;
};

/** Assembles the trip a legacy skeleton build produced, from that build's own plan and the given spec. */
const assembleLike = (legacy, travellerSpec, data = PILOT_DATA) => assemble(inputFor(travellerSpec, legacy.routePlan, legacy.status, data));

const nightsOf = (trip) => Object.fromEntries(trip.routePlan.stops.map((s) => [s.key, s.nights]));

function apply(trip, result, proposalId) {
  assert.equal(result.ok, true, JSON.stringify(result).slice(0, 300));
  const proposal = proposalId ? result.proposals.find((p) => p.id === proposalId) : result.proposals[0];
  const applied = R.applyProposal(trip, proposal);
  assert.equal(applied.ok, true);
  return applied.trip;
}

// ---------------------------------------------------------------------------
// A, B: the stretch warning and the minimum, assembled

test('A: Japan 14d tokyo_city, stretched: the assembled Trip carries the warning, minDays 5, 14 days, the legacy maxDays', () => {
  const request = spec(JP, 14, 10, 'tokyo_city');
  const legacy = skeletonTrip(request);
  assert.equal(legacy.routePlan.stops[0].maxNights, 10);
  assert.equal(legacy.routePlan.stops[0].nights, 12);

  // The complete sequence path: stage 1 -> stage 2 -> assembly.
  const trip = assembleLike(legacy, request);
  assert.deepEqual(trip.warnings, ['nights_above_package_max']);
  assert.equal(trip.routePlan.minDays, 5);
  assert.equal(trip.days.length, 14);
  assert.equal(trip.routePlan.maxDays, legacy.routePlan.maxDays);
  // The legacy assertions this mirrors (overMaximum.test.js:146, :180) hold on a filled trip built the old way.
  assert.deepEqual(buildFilledTrip(request, PILOT_DATA).warnings, ['nights_above_package_max']);
});

test('B: every reference trip is within its maximums and the assembled Trip has no stretch warning', () => {
  for (const [name, request] of Object.entries(REFERENCE)) {
    const legacy = skeletonTrip(request);
    assert.ok(legacy.routePlan.stops.every((s) => s.nights <= s.maxNights), `${name}: within maximums`);
    assert.deepEqual(assembleLike(legacy, request).warnings, [], name);
  }
});

test('B: the duplicated stretch predicate agrees with the scheduler\'s at every length tried', () => {
  // Parity for the accepted duplication (sharing it would touch schedule.js): both sides of the boundary, many lengths.
  let stretched = 0;
  let clean = 0;
  for (const [destination, template, lengths] of [
    [JP, 'tokyo_city', [5, 6, 7, 10, 13, 14, 16]],
    [PE, null, [8, 10, 12, 14]],
    [JP, 'tokyo_city+kyoto@after_tokyo', [8, 14, 20]]
  ]) {
    for (const days of lengths) {
      const request = spec(destination, days, 10, template);
      const legacy = buildSkeletonTrip(request, PILOT_DATA);
      if (!legacy.routePlan) continue;
      const trip = assembleLike(legacy, request);
      assert.deepEqual(trip.warnings, legacy.warnings, `${template ?? destination.id}/${days}`);
      if (trip.warnings.length > 0) stretched += 1;
      else clean += 1;
    }
  }
  assert.ok(stretched >= 2 && clean >= 4, `both outcomes exercised (${stretched} stretched, ${clean} clean)`);
});

// ---------------------------------------------------------------------------
// C: a selection that actually raises a minimum

test('C: synthetic spur 8d: minDays 6 -> 7 with Douro -> 6 removed (nights kept); maxDays 11 throughout', () => {
  const B = synBundle(compileFamilies);
  const SPUR = 'syn_hub+spur@after_base';
  const authoredMin = findRoutePackage(B.data, SPUR).stops.find((s) => s.id === 'pt_base').minNights;
  assert.equal(authoredMin, 2);

  const plain = buildFilledTrip(synSpec(8, { routeTemplateId: SPUR }), B.data, { content: B.content });
  assert.ok(plain.routePlan);
  const withDouro = apply(plain, R.previewAddExcursion(plain, 'pt_base', 'douro', B.options));
  const removed = apply(withDouro, R.previewRemoveExcursion(withDouro, 'pt_base', 'douro', B.options));

  const rows = [
    ['no selection', plain, 2, 6],
    ['Douro selected', withDouro, 3, 7],
    ['Douro removed', removed, 2, 6]
  ];
  for (const [name, trip, planMin, minDays] of rows) {
    const legacy = buildTripFromRoutePlan(trip.spec, trip.routePlan, B.data);
    assert.ok(legacy.routePlan, name);
    const assembled = assembleLike(legacy, trip.spec, B.data);
    const pt = assembled.routePlan.stops.find((s) => s.key === 'pt_base');
    assert.equal(pt.nights, 3, `${name}: pt_base keeps its 3 nights`);
    assert.equal(pt.minNights, planMin, `${name}: the plan's effective minimum`);
    assert.equal(assembled.routePlan.minDays, minDays, name);
    assert.equal(assembled.routePlan.maxDays, 11, name);
    assert.deepEqual(assembled, legacy, `${name}: skeleton parity`);
  }
  assert.deepEqual(nightsOf(removed), nightsOf(plain), 'removing the selection keeps the allocated nights');

  // The case discriminates: with Douro selected the AUTHORED formula would give 6, not the plan's 7.
  const days = withDouro.days.length;
  const authoredFormula = days - withDouro.routePlan.stops.reduce((n, s) => n + s.nights - (s.key === 'pt_base' ? authoredMin : s.minNights), 0);
  assert.equal(authoredFormula, 6);
  assert.notEqual(authoredFormula, assembleLike(buildTripFromRoutePlan(withDouro.spec, withDouro.routePlan, B.data), withDouro.spec, B.data).routePlan.minDays);
});

// ---------------------------------------------------------------------------
// D: cached values verified

test('D: a plan whose cached minDays or maxDays disagrees with the recomputation is refused, both values named', () => {
  const request = REFERENCE['Peru 10d'];
  const legacy = skeletonTrip(request);
  const { minDays, maxDays } = legacy.routePlan;
  const input = inputFor(request, legacy.routePlan, legacy.status);
  assert.throws(
    () => assembleSkeletonTripFromSequence({ ...input, plan: { ...input.plan, minDays: minDays + 1 } }),
    new RegExp(`minDays disagree: recomputed ${minDays}, plan\\.minDays ${minDays + 1}$`)
  );
  assert.throws(
    () => assembleSkeletonTripFromSequence({ ...input, plan: { ...input.plan, maxDays: maxDays - 1 } }),
    new RegExp(`maxDays disagree: recomputed ${maxDays}, plan\\.maxDays ${maxDays - 1}$`)
  );
});

// ---------------------------------------------------------------------------
// E: one test per §2 check. Reject, never prefer whichever object is convenient.

/** A fresh, consistent input for a reference case; each test breaks exactly one thing. */
function base(name = 'Peru 10d') {
  const request = REFERENCE[name];
  const legacy = skeletonTrip(request);
  return structuredClone(inputFor(request, legacy.routePlan, legacy.status));
}
function nikkoBase() {
  const trip = apply(buildFilledTrip(spec(JP, 14, 10, 'tokyo_city'), PILOT_DATA), R.previewAddExcursion(buildFilledTrip(spec(JP, 14, 10, 'tokyo_city'), PILOT_DATA), 'tokyo_base', 'nikko'));
  const legacy = buildTripFromRoutePlan(trip.spec, trip.routePlan, PILOT_DATA);
  return structuredClone(inputFor(trip.spec, legacy.routePlan, legacy.status));
}
const refuses = (input, pattern) => assert.throws(() => assembleSkeletonTripFromSequence(input), pattern);

test('E1: stop count disagrees between the sequence and the plan', () => {
  const input = base();
  input.plan.stops.pop();
  refuses(input, /stop count disagrees: sequence\.entries 7, plan\.stops 6/);
  const other = base();
  other.sequence.entries.pop();
  refuses(other, /stop count disagrees: sequence\.entries 6, plan\.stops 7/);
});

test('E2: stop keys disagree, pairwise by position (an order swap included)', () => {
  const input = base();
  input.plan.stops[1].key = 'pc_elsewhere';
  refuses(input, /stop 1 key disagree: sequence "pc_cusco", plan "pc_elsewhere"/);
  const swapped = base();
  [swapped.plan.stops[1], swapped.plan.stops[2]] = [swapped.plan.stops[2], swapped.plan.stops[1]];
  refuses(swapped, /stop 1 key disagree/);
});

test('E3: placeIds disagree, pairwise', () => {
  const input = base();
  input.plan.stops[0].placeId = 'cusco';
  refuses(input, /stop pc_lima_in placeId disagree: sequence "lima", plan "cusco"/);
  const other = base();
  other.sequence.entries[0].placeId = 'cusco';
  refuses(other, /stop pc_lima_in placeId disagree: sequence "cusco", plan "lima"/);
});

test('E4: allocated nights disagree, pairwise', () => {
  const input = base();
  const n = input.plan.stops[0].nights;
  input.plan.stops[0].nights = n + 1;
  refuses(input, new RegExp(`stop pc_lima_in nights disagree: sequence ${n}, plan ${n + 1}`));
  const other = base();
  other.sequence.entries[0].nights = n + 1;
  refuses(other, new RegExp(`stop pc_lima_in nights disagree: sequence ${n + 1}, plan ${n}`));
});

test('E5: ordered journey connections disagree, the return leg included', () => {
  const input = base();
  input.plan.connectionIds[input.plan.connectionIds.length - 1] = 'conn_lim_cuz_air';
  refuses(input, /journey connections disagree: sequence \[.*"conn_[a-z_]+"\], plan\.connectionIds \[.*"conn_lim_cuz_air"\]/);
  const ret = base();
  ret.sequence.returnConnectionId = 'conn_lim_cuz_air';
  refuses(ret, /journey connections disagree/);
  const mid = base();
  // Peru's legs read the same backwards, so swap two instead of reversing.
  [mid.plan.connectionIds[1], mid.plan.connectionIds[2]] = [mid.plan.connectionIds[2], mid.plan.connectionIds[1]];
  refuses(mid, /journey connections disagree/);
  const short = base();
  short.plan.connectionIds.pop();
  refuses(short, /journey connections disagree/);
});

test('E6: selected excursion ids disagree between the sequence and the plan', () => {
  const input = nikkoBase();
  delete input.plan.stops[0].selectedExcursionIds;
  refuses(input, /stop tokyo_base selectedExcursionIds disagree: sequence \["nikko"\], plan \[\]/);
  const other = nikkoBase();
  other.plan.stops[0].selectedExcursionIds = ['kamakura'];
  refuses(other, /stop tokyo_base selectedExcursionIds disagree: sequence \["nikko"\], plan \["kamakura"\]/);
});

test('E7: a resolved excursion requirement the skeleton does not represent is refused (ids and blocks only, not menu definitions)', () => {
  // Fixed: Machu Picchu.
  const input = base();
  for (const d of input.skeleton.days) d.blocks = d.blocks.filter((b) => !b.id.startsWith('ex:pc_aguas:machu_picchu:'));
  refuses(input, /excursion requirement pc_aguas -> machu_picchu disagrees with the skeleton: sequence requires it, skeleton has no block ex:pc_aguas:machu_picchu:out/);
  // Selected: Nikko, the site block alone missing.
  const nikko = nikkoBase();
  for (const d of nikko.skeleton.days) d.blocks = d.blocks.filter((b) => b.id !== 'ex:tokyo_base:nikko:site');
  refuses(nikko, /excursion requirement tokyo_base -> nikko disagrees with the skeleton: .* no block ex:tokyo_base:nikko:site/);
});

test('E8: the skeleton\'s stop summaries disagree with the sequence on stops, order or nights', () => {
  const nights = base();
  nights.skeleton.stops[0].nights += 1;
  refuses(nights, /stop summaries disagree: sequence \[.*\], skeleton \[.*\]/);
  const order = base();
  [order.skeleton.stops[0], order.skeleton.stops[1]] = [order.skeleton.stops[1], order.skeleton.stops[0]];
  refuses(order, /stop summaries disagree/);
  const missing = base();
  missing.skeleton.stops.pop();
  refuses(missing, /stop summaries disagree/);
});

// ---------------------------------------------------------------------------
// F4.1: check 12 (fixed excursions, plan against sequence) and check 7 (the calendar against the requirements)

const MP = { placeId: 'machu_picchu', connectionId: 'conn_agc_mp_shuttle', hoursOnSite: 4 };
const aguas = (input) => input.plan.stops.find((s) => s.key === 'pc_aguas');
const aguasEntry = (input) => input.sequence.entries.find((e) => e.stopKey === 'pc_aguas');

test('E12: the plan\'s fixed excursions disagree with the sequence\'s: dropped, hoursOnSite, connectionId, order', () => {
  const clean = base();
  assert.deepEqual(aguas(clean).excursions.map(({ placeId, connectionId, hoursOnSite }) => ({ placeId, connectionId, hoursOnSite })), [MP], 'measured: Peru 10d');
  assert.ok(assemble(clean));

  const dropped = base();
  aguas(dropped).excursions = [];
  refuses(dropped, /stop pc_aguas fixed excursions disagree: sequence \[\{"placeId":"machu_picchu","connectionId":"conn_agc_mp_shuttle","hoursOnSite":4\}\], plan \[\]$/);
  const droppedFromSequence = base();
  aguasEntry(droppedFromSequence).excursions = [];
  refuses(droppedFromSequence, /stop pc_aguas fixed excursions disagree: sequence \[\], plan \[\{"placeId":"machu_picchu"/);

  const hours = base();
  aguas(hours).excursions[0].hoursOnSite = 9;
  refuses(hours, /stop pc_aguas fixed excursions disagree: sequence \[.*"hoursOnSite":4\}\], plan \[.*"hoursOnSite":9\}\]$/);

  const connection = base();
  aguas(connection).excursions[0].connectionId = 'conn_cuz_olly_road';
  refuses(connection, /stop pc_aguas fixed excursions disagree: sequence \[.*"conn_agc_mp_shuttle".*\], plan \[.*"conn_cuz_olly_road".*\]$/);

  // Order: no pilot stop has two fixed excursions, so give pc_aguas a second one, in opposite orders on each side.
  const order = base();
  const second = { placeId: 'cusco', connectionId: 'conn_agc_mp_shuttle', hoursOnSite: 2 };
  aguas(order).excursions = [{ ...MP }, { ...second }];
  aguasEntry(order).excursions = [{ ...second, source: 'fixed' }, { ...MP, source: 'fixed' }];
  refuses(order, /stop pc_aguas fixed excursions disagree: sequence \[\{"placeId":"cusco".*\},\{"placeId":"machu_picchu".*\}\], plan \[\{"placeId":"machu_picchu".*\},\{"placeId":"cusco".*\}\]$/);

  // Selected requirements are not fixed ones: Tokyo with Nikko has no fixed excursion on either side and assembles.
  const nikko = nikkoBase();
  assert.deepEqual(nikko.plan.stops[0].excursions, []);
  assert.ok(assemble(nikko));
});

/** The two check-7 cases: a fixed requirement (Peru, Machu Picchu) and a selected one (Tokyo, Nikko). Both 4h. */
const CHECK7_CASES = [
  ['fixed', base, 'pc_aguas', 'machu_picchu', 'aguas_calientes'],
  ['selected', nikkoBase, 'tokyo_base', 'nikko', 'tokyo']
];
const blockOf = (input, id) => input.skeleton.days.flatMap((d) => d.blocks).find((b) => b.id === id);

test('E7: a calendar generated for a different visit duration (3h, 5h) is refused against a 4h requirement, fixed and selected', () => {
  // Nikko is the only 4h selectable excursion in the pilot and synthetic catalogues, and a 5h Nikko visit cannot be
  // scheduled at all (5h plus both train legs exceeds the day window; the scheduler throws excursion_does_not_fit). So
  // the selected case is generated at 3h and 4.5h, and 5h is covered by setting the site block's duration by hand.
  const generated = { fixed: [3, 5], selected: [3, 4.5] };
  for (const [kind, make, stopKey, placeId] of CHECK7_CASES) {
    const input = make();
    const required = input.sequence.entries.find((e) => e.stopKey === stopKey).excursions.find((x) => x.placeId === placeId);
    assert.equal(required.hoursOnSite, 4, `${kind}: the requirement is 4h`);
    if (kind === 'selected') {
      const five = structuredClone(input.sequence);
      five.entries.find((e) => e.stopKey === stopKey).excursions.find((x) => x.placeId === placeId).hoursOnSite = 5;
      assert.throws(() => materialiseTripSequence(five, PILOT_DATA), (err) => err.reason === 'excursion_does_not_fit', 'measured: no 5h Nikko calendar exists');
      const handSet = make();
      blockOf(handSet, `ex:${stopKey}:${placeId}:site`).durationHours = 5;
      refuses(handSet, new RegExp(`ex:${stopKey}:${placeId}:site visit minutes disagree: sequence 240, skeleton 300$`));
    }
    for (const hours of generated[kind]) {
      // A genuine scheduler calendar for the other duration: the same sequence, its requirement changed, materialised.
      const other = structuredClone(input.sequence);
      other.entries.find((e) => e.stopKey === stopKey).excursions.find((x) => x.placeId === placeId).hoursOnSite = hours;
      const skeleton = materialiseTripSequence(other, PILOT_DATA).value;
      assert.equal(blockOf({ skeleton }, `ex:${stopKey}:${placeId}:site`).durationHours, hours, `${kind}: a real ${hours}h calendar`);
      refuses({ ...input, skeleton }, new RegExp(`excursion requirement ${stopKey} -> ${placeId}: ex:${stopKey}:${placeId}:site visit minutes disagree: sequence 240, skeleton ${hours * 60}$`));
    }
  }
});

test('E7: the scheduler\'s rounding is the comparison: a duration that rounds to the same minute is accepted', () => {
  const input = base();
  // 4h + 0.4 of a minute is still minute 240 under Math.round(hours * 60).
  aguasEntry(input).excursions[0].hoursOnSite = 4 + 0.4 / 60;
  aguas(input).excursions[0].hoursOnSite = 4 + 0.4 / 60;
  assert.ok(assemble(input));
  aguasEntry(input).excursions[0].hoursOnSite = 4 + 0.6 / 60;
  aguas(input).excursions[0].hoursOnSite = 4 + 0.6 / 60;
  refuses(input, /ex:pc_aguas:machu_picchu:site visit minutes disagree: sequence 241, skeleton 240$/);
});

test('E7: wrong connection, place, stop anchor or block type on an excursion block is refused, fixed and selected', () => {
  for (const [kind, make, stopKey, placeId, basePlace] of CHECK7_CASES) {
    const id = (part) => `ex:${stopKey}:${placeId}:${part}`;
    const broken = (part, mutate) => {
      const input = make();
      mutate(blockOf(input, id(part)));
      return input;
    };
    const at = (part, field) => new RegExp(`excursion requirement ${stopKey} -> ${placeId}: ${id(part)} ${field.replace('.', '\\.')} disagree: sequence `);

    refuses(broken('out', (b) => (b.transport.connectionId = 'conn_other')), at('out', 'connectionId'));
    refuses(broken('back', (b) => (b.transport.connectionId = 'conn_other')), at('back', 'connectionId'));
    refuses(broken('site', (b) => (b.placeId = 'cusco')), new RegExp(`${id('site')} placeId disagree: sequence "${placeId}", skeleton "cusco"$`));
    refuses(broken('out', (b) => (b.transport.toPlaceId = 'cusco')), at('out', 'toPlaceId'));
    refuses(broken('out', (b) => (b.transport.fromPlaceId = 'cusco')), at('out', 'fromPlaceId'));
    refuses(broken('back', (b) => (b.transport.fromPlaceId = basePlace)), at('back', 'fromPlaceId'));
    refuses(broken('back', (b) => (b.transport.toPlaceId = placeId)), at('back', 'toPlaceId'));
    for (const part of ['out', 'site', 'back']) refuses(broken(part, (b) => (b.anchor.stopId = 'pc_elsewhere')), at(part, 'anchor.stopId'));
    refuses(broken('out', (b) => (b.type = 'open')), at('out', 'type'));
    refuses(broken('site', (b) => (b.type = 'travel')), at('site', 'type'));
    refuses(broken('back', (b) => (b.type = 'open')), at('back', 'type'));
    assert.ok(assemble(make()), `${kind}: the unbroken input assembles`);
  }
});

test('E7: the ex: blocks must be exactly the expected set: missing, duplicate and unexpected blocks are refused, fixed and selected', () => {
  for (const [, make, stopKey, placeId] of CHECK7_CASES) {
    const id = (part) => `ex:${stopKey}:${placeId}:${part}`;
    for (const part of ['out', 'site', 'back']) {
      const missing = make();
      for (const d of missing.skeleton.days) d.blocks = d.blocks.filter((b) => b.id !== id(part));
      refuses(missing, new RegExp(`excursion requirement ${stopKey} -> ${placeId} disagrees with the skeleton: sequence requires it, skeleton has no block ${id(part)}$`));
    }

    const duplicate = make();
    duplicate.skeleton.days.at(-1).blocks.push(structuredClone(blockOf(duplicate, id('site'))));
    refuses(duplicate, new RegExp(`skeleton has duplicate block ${id('site')}$`));

    const extra = make();
    extra.skeleton.days.at(-1).blocks.push({ ...structuredClone(blockOf(extra, id('site'))), id: `ex:${stopKey}:somewhere:site` });
    refuses(extra, new RegExp(`skeleton has ex: block\\(s\\) no requirement accounts for: ex:${stopKey}:somewhere:site$`));

    // A well-formed block for a requirement this stop does not have, anchored at another stop.
    const elsewhere = make();
    const otherKey = elsewhere.sequence.entries.find((e) => e.stopKey !== stopKey)?.stopKey ?? 'kyo_base'; // Tokyo-only has one stop
    elsewhere.skeleton.days[0].blocks.push({ ...structuredClone(blockOf(elsewhere, id('out'))), id: `ex:${otherKey}:${placeId}:out` });
    refuses(elsewhere, new RegExp(`no requirement accounts for: ex:${otherKey}:${placeId}:out$`));
  }
});

test('E7: two requirements to one place on one entry are refused as ambiguous, not counted as one, fixed and selected', () => {
  // Fixed: Machu Picchu twice, on both plan and sequence (so check 12 agrees and check 7 is what refuses).
  const fixed = base();
  aguas(fixed).excursions = [{ ...MP }, { ...MP, hoursOnSite: 2 }];
  aguasEntry(fixed).excursions = [{ ...MP, source: 'fixed' }, { ...MP, hoursOnSite: 2, source: 'fixed' }];
  refuses(fixed, /entry pc_aguas has more than one excursion requirement to machu_picchu; their blocks cannot be told apart$/);

  // Selected: a fixed requirement to Nikko beside the selected one, again agreeing between plan and sequence.
  const selected = nikkoBase();
  const nikko = selected.sequence.entries[0].excursions.find((x) => x.placeId === 'nikko');
  const fixedNikko = { placeId: nikko.placeId, connectionId: nikko.connectionId, hoursOnSite: nikko.hoursOnSite };
  selected.plan.stops[0].excursions = [fixedNikko];
  selected.sequence.entries[0].excursions = [{ ...fixedNikko, source: 'fixed' }, ...selected.sequence.entries[0].excursions];
  refuses(selected, /entry tokyo_base has more than one excursion requirement to nikko; their blocks cannot be told apart$/);
});

test('E9: spec.originPlaceId disagrees with the sequence origin', () => {
  const input = base();
  input.spec.originPlaceId = 'seattle';
  refuses(input, /origin disagree: spec\.originPlaceId "seattle", sequence\.origin\.placeId "vancouver"/);
});

test('E10: the requested spec.totalDays disagrees with the skeleton\'s day count (never rewritten to match)', () => {
  const input = base();
  input.spec.totalDays = 11;
  refuses(input, /day count disagree: spec\.totalDays 11, skeleton\.days\.length 10/);
});

test('E11: a recomputed minDays or maxDays disagrees with the plan', () => {
  const input = base();
  input.plan.stops[0].minNights += 1; // the effective minimum moves, the cached minDays does not
  refuses(input, /minDays disagree: recomputed \d+, plan\.minDays \d+/);
  const max = base();
  max.plan.stops[0].maxNights += 1;
  refuses(max, /maxDays disagree: recomputed \d+, plan\.maxDays \d+/);
});

// ---------------------------------------------------------------------------
// Lifecycle inputs (§1.3, §1.6)

test('status: only draft and valid (what a skeleton validation writes); incomplete, conflict and anything else are refused by name', () => {
  for (const status of ['draft', 'valid']) assert.equal(assemble({ ...base(), status }).status, status);
  refuses({ ...base(), status: 'incomplete' }, /status "incomplete" is refused \(it is set only by filling and cannot belong to an unfilled skeleton\); accepted: draft, valid$/);
  refuses({ ...base(), status: 'conflict' }, /status "conflict" is refused \(it has no producer in the engine\); accepted: draft, valid$/);
  refuses({ ...base(), status: 'ok' }, /status "ok" is refused; accepted: draft, valid$/);
  refuses({ ...base(), status: 'toString' }, /status "toString" is refused; accepted: draft, valid$/);
  // A fill-only warning never appears: warnings are seeded from the stretch predicate alone.
  for (const request of [...Object.values(REFERENCE), spec(JP, 14, 10, 'tokyo_city')]) {
    const warnings = assembleLike(skeletonTrip(request), request).warnings;
    assert.ok(warnings.every((w) => w === 'nights_above_package_max'), JSON.stringify(warnings));
  }
});

test('inputs are explicit: undeclared or missing fields, a filled content version and a non-empty history are refused', () => {
  refuses({ ...base(), trip: {} }, /undeclared input\(s\) trip/);
  for (const key of ['sequence', 'plan', 'skeleton', 'spec', 'status', 'contentVersion', 'bufferRuleset', 'history']) {
    const input = base();
    delete input[key];
    refuses(input, new RegExp(`missing input ${key}`));
  }
  refuses({ ...base(), contentVersion: 'pilot-content-v1' }, /contentVersion "pilot-content-v1"/);
  refuses({ ...base(), history: [{}] }, /history .*: assembly writes \[\] and never appends/);
  const extraSpec = base();
  extraSpec.spec.routePlan = {};
  refuses(extraSpec, /undeclared spec field\(s\) routePlan/);
});

test('versions: the bufferRuleset is the declared input; content is "none"', () => {
  const trip = assemble({ ...base(), bufferRuleset: { ...DEFAULT_BUFFER_RULESET, id: 'buffer_ruleset_test', version: 7 } });
  assert.equal(trip.versions.bufferRuleset, 'buffer_ruleset_test@7');
  assert.equal(trip.versions.content, 'none');
  assert.equal('contentGaps' in trip, false);
});

// ---------------------------------------------------------------------------
// F: v6 round trip

test('F: v6 preservation through saveDraftTrip / loadDraftTrip (not evidence that the loader validates)', () => {
  const store = new Map();
  globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  try {
    const request = spec(JP, 14, 10, 'tokyo_city');
    const trip = assembleLike(skeletonTrip(request), request);
    const loaded = loadDraftTrip(saveDraftTrip(trip, 'assembled'));
    assert.equal(loaded.compatible, true);
    assert.deepEqual(loaded.trip, trip);
    assert.deepEqual(loaded.trip.warnings, ['nights_above_package_max']);
    assert.equal(loaded.trip.routePlan.minDays, 5);
    assert.equal(loaded.trip.routePlan.maxDays, trip.routePlan.maxDays);
    assert.deepEqual(loaded.trip.spec, trip.spec);
    assert.equal(loaded.trip.versions.schema, 'door2-v6');
  } finally {
    delete globalThis.localStorage;
  }
});

// ---------------------------------------------------------------------------
// G: stage 2 stays sealed

// The same top-level allowlist as materialise.test.js:146–157.
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

test('G: the assembly pipeline materialises through the places/connections allowlist, which still fires, and stage 2 takes no plan', async () => {
  for (const [name, request] of Object.entries(REFERENCE)) {
    const legacy = skeletonTrip(request);
    const sequence = tripSequenceFromPlan(request, legacy.routePlan, { id: 'seq-g' });
    const skeleton = materialiseTripSequence(sequence, graphOnly()).value;
    const trip = assemble({ sequence, plan: legacy.routePlan, skeleton, spec: request, status: legacy.status, contentVersion: 'none', bufferRuleset: DEFAULT_BUFFER_RULESET, history: [] });
    assert.deepEqual(trip, legacy, name);
  }
  const data = graphOnly();
  for (const key of ['routePackages', 'allRoutePackages', 'routeFamilies', 'packages']) assert.throws(() => data[key], new RegExp(`stage 2 read data\\.${key}$`));
  assert.throws(() => Object.keys(data), /stage 2 enumerated data/);

  // Not widened: materialise still exports one function and refuses a plan, or anything else undeclared.
  const M = await import('../../src/lib/door2/materialise.js');
  assert.deepEqual(Object.keys(M), ['materialiseTripSequence']);
  const legacy = skeletonTrip(REFERENCE['Peru 10d']);
  const sequence = tripSequenceFromPlan(REFERENCE['Peru 10d'], legacy.routePlan, { id: 'seq-g' });
  for (const key of ['plan', 'routePlan', 'spec', 'status']) {
    assert.throws(() => materialiseTripSequence(sequence, PILOT_DATA, { [key]: legacy.routePlan }), new RegExp(`undeclared option\\(s\\) ${key}`));
  }
});

test('the boundary is the import list: assemble.js imports constants only, and no scheduler, selector, validator or package lookup', () => {
  const source = readFileSync(fileURLToPath(new URL('../../src/lib/door2/assemble.js', import.meta.url)), 'utf8');
  const imports = [...source.matchAll(/^import\s+\{([^}]*)\}\s+from\s+'([^']+)';$/gm)].map((m) => [m[2], m[1].trim()]);
  assert.deepEqual(imports, [
    ['./bufferRuleset.js', 'BUFFER_RULESET_VERSION'],
    ['./pilotData.js', 'PILOT_DATA_VERSION'],
    ['./scheduleConfig.js', 'ENGINE_VERSION']
  ]);
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  for (const name of ['scheduleRoute', 'selectRoutes', 'validateSkeleton', 'resolveExcursions', 'findRoutePackage', 'compileFamilies', 'routePackages', 'checkTripSequence', 'materialiseTripSequence']) {
    assert.equal(code.includes(name), false, `assemble.js code mentions ${name}`);
  }
});

// ---------------------------------------------------------------------------
// H, I: skeleton parity and the id

test('H: every reference trip assembles to exactly the buildSkeletonTrip and buildTripFromRoutePlan output, field by field', () => {
  const FIELDS = ['id', 'status', 'spec', 'routePlan', 'days', 'warnings', 'versions', 'history'];
  for (const [name, request] of Object.entries(REFERENCE)) {
    const fresh = skeletonTrip(request);
    const trip = assembleLike(fresh, request);
    assert.deepEqual(Object.keys(trip), Object.keys(fresh), name);
    assert.deepEqual(Object.keys(trip), FIELDS, name);
    for (const field of FIELDS) assert.deepEqual(trip[field], fresh[field], `${name}: ${field}`);
    assert.equal(JSON.stringify(trip), JSON.stringify(fresh), `${name}: byte-identical`);
    assert.equal(trip.versions.content, 'none', name);
    assert.equal('contentGaps' in trip, false, name);

    // The rebuild path too, from the built trip's own spec (its mirrors included) and plan.
    const rebuilt = buildTripFromRoutePlan(fresh.spec, fresh.routePlan, PILOT_DATA);
    assert.deepEqual(assembleLike(rebuilt, fresh.spec), rebuilt, `${name}: buildTripFromRoutePlan parity`);
  }
});

test('I: the id from plan.variantId, canonical and alias; the alias on input.spec passes through unrejected', () => {
  const canonical = REFERENCE['Japan 14d + Kyoto'];
  const c = assembleLike(skeletonTrip(canonical), canonical);
  assert.equal(c.id, 'door2:vancouver:JP:14:tokyo_city+kyoto@after_tokyo');
  assert.equal(c.spec.routeTemplateId, 'tokyo_city+kyoto@after_tokyo');
  assert.equal(c.id, skeletonTrip(canonical).id);

  const HUARAZ = 'peru_classic+huaraz@after_lima_in';
  const aliasRequest = spec(PE, 12, 10, 'peru_classic_huaraz');
  const legacy = skeletonTrip(aliasRequest);
  assert.equal(legacy.routePlan.variantId, HUARAZ);
  let trip;
  assert.doesNotThrow(() => {
    trip = assembleLike(legacy, aliasRequest);
  }, 'the alias on input.spec is not a rejection');
  assert.equal(aliasRequest.routeTemplateId, 'peru_classic_huaraz', 'the input really carried the alias');
  assert.equal(trip.id, `door2:vancouver:PE:12:${HUARAZ}`);
  assert.equal(trip.spec.routeTemplateId, HUARAZ);
  assert.equal(trip.id, legacy.id);
  assert.deepEqual(trip, legacy);
});

test('the legacy Trip.id and the TripSequence.id are distinct', () => {
  const request = REFERENCE['Peru 10d'];
  const input = base();
  const trip = assemble(input);
  assert.equal(input.sequence.id, 'seq-assemble');
  assert.notEqual(trip.id, input.sequence.id);
  assert.equal(trip.id, skeletonTrip(request).id);
});

// ---------------------------------------------------------------------------
// J: history

test('J1: the assembler writes history [] for a fresh build and for a rebuild proposal', () => {
  const request = spec(JP, 14, 10, 'tokyo_city+kyoto@after_tokyo');
  assert.deepEqual(assembleLike(skeletonTrip(request), request).history, []);

  // A trip with history, rebuilt for a proposal: the rebuild's input is the OLD spec with the NEW plan.
  let trip = buildFilledTrip(request, PILOT_DATA);
  trip = apply(trip, R.previewAddExcursion(trip, 'tokyo_base', 'nikko'));
  assert.equal(trip.history.length, 1);
  const preview = R.previewAdjustNights(trip, 'tokyo_base', 1);
  assert.equal(preview.ok, true, JSON.stringify(preview).slice(0, 300));
  const proposal = preview.proposals[0];
  const rebuildSpec = { ...trip.spec, totalDays: proposal.trip.spec.totalDays };
  const legacy = buildTripFromRoutePlan(rebuildSpec, proposal.trip.routePlan, PILOT_DATA);
  const assembled = assembleLike(legacy, rebuildSpec);
  assert.deepEqual(assembled.history, []);
  assert.deepEqual(assembled, legacy, 'rebuild parity');
});

test('J2: a preview does not advance history; applying adds exactly one snapshot, nested history stripped, cap respected', () => {
  const request = spec(JP, 14, 10, 'tokyo_city');
  const skeleton = assembleLike(skeletonTrip(request), request);
  let trip = fillTrip(skeleton, request, PILOT_CONTENT);
  assert.deepEqual(trip.history, []);

  const before = JSON.stringify(trip);
  const preview = R.previewAddExcursion(trip, 'tokyo_base', 'nikko');
  assert.equal(preview.ok, true);
  assert.equal(JSON.stringify(trip), before, 'the preview changed nothing');
  assert.deepEqual(preview.proposals[0].trip.history, [], 'the proposal carries no history of its own');

  const applied = R.applyProposal(trip, preview.proposals[0]).trip;
  assert.equal(applied.history.length, 1);
  assert.deepEqual(applied.history[0], { ...trip, history: [] });

  // 21 more applies: the stack stops at the cap (20) and no snapshot carries a stack.
  trip = applied;
  for (let i = 0; i < 21; i += 1) {
    const result = trip.routePlan.stops[0].selectedExcursionIds ? R.previewRemoveExcursion(trip, 'tokyo_base', 'nikko') : R.previewAddExcursion(trip, 'tokyo_base', 'nikko');
    const next = apply(trip, result);
    assert.equal(next.history.length, Math.min(trip.history.length + 1, 20));
    assert.deepEqual(next.history.at(-1), { ...trip, history: [] });
    trip = next;
  }
  assert.equal(trip.history.length, 20);
  assert.ok(trip.history.every((h) => Array.isArray(h.history) && h.history.length === 0));
});

// ---------------------------------------------------------------------------
// K: stale mirrors

test('K: stale routeTemplateId and stops on input.spec are accepted, never emitted, and the mirrors are rebuilt', () => {
  const trip = buildFilledTrip(spec(JP, 14, 10, 'tokyo_city+kyoto@after_tokyo'), PILOT_DATA);
  const preview = R.previewAdjustNights(trip, 'tokyo_base', 1);
  assert.equal(preview.ok, true, JSON.stringify(preview).slice(0, 300));
  const plan = preview.proposals[0].trip.routePlan;
  assert.notDeepEqual(nightsOf({ routePlan: plan }), nightsOf(trip), 'the plan carries new nights');

  // As restructure.js:244–247 supplies it: the OLD spec, OLD stops (old nights) and OLD routeTemplateId.
  const staleSpec = { ...trip.spec, totalDays: preview.proposals[0].trip.spec.totalDays };
  assert.notDeepEqual(staleSpec.stops.map((s) => s.nights), plan.stops.map((s) => s.nights));
  const legacy = buildTripFromRoutePlan(staleSpec, plan, PILOT_DATA);
  let assembled;
  assert.doesNotThrow(() => {
    assembled = assembleLike(legacy, staleSpec);
  }, 'stale mirrors are not a rejection');
  assert.deepEqual(assembled.spec.stops.map((s) => s.nights), plan.stops.map((s) => s.nights));
  assert.notDeepEqual(assembled.spec.stops, staleSpec.stops, 'the stale stops are not emitted');
  assert.deepEqual(assembled, legacy, 'and the result is what the rebuild path builds');

  // A routeTemplateId that names nothing at all, and stops that are pure noise: still ignored, still rebuilt.
  const noise = { ...staleSpec, routeTemplateId: 'stale_template', stops: [{ id: 'nowhere', placeId: 'atlantis', placeSource: 'user', nights: 99, isRequired: true }] };
  const rebuilt = assembleLike(legacy, noise);
  assert.equal(rebuilt.spec.routeTemplateId, plan.variantId);
  assert.equal(rebuilt.id, legacy.id);
  assert.deepEqual(rebuilt.spec.stops, legacy.spec.stops);
  assert.equal(JSON.stringify(rebuilt).includes('stale_template'), false);
  assert.equal(JSON.stringify(rebuilt).includes('atlantis'), false);
});
