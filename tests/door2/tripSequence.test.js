import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { orientConnection } from '../../src/lib/door2/bufferRuleset.js';
import { PILOT_DATA, buildFilledTrip } from '../../src/lib/door2/planner.js';
import * as R from '../../src/lib/door2/restructure.js';
import { checkTripSequence, tripSequenceFromPlan, tripSequenceFromTrip, tripSequenceRole } from '../../src/lib/door2/tripSequence.js';

// F3: the TripSequence contract, projected read-only from a built Door 2 Trip.
// These tests prove the projection is faithful to the RoutePlan it reads. They
// do NOT prove a sequence can be produced before scheduling, or that the
// pre-schedule handoff preserves excursion requirements end to end (brief §4a).

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

function apply(trip, result, proposalId) {
  assert.equal(result.ok, true, JSON.stringify(result).slice(0, 300));
  const proposal = proposalId ? result.proposals.find((p) => p.id === proposalId) : result.proposals[0];
  assert.ok(proposal, `proposal ${proposalId}`);
  const applied = R.applyProposal(trip, proposal);
  assert.equal(applied.ok, true);
  return applied.trip;
}

const addExcursion = (trip, stopKey, excursionId) => apply(trip, R.previewAddExcursion(trip, stopKey, excursionId));

/** The four reference trips (brief §4.8). */
function referenceTrips() {
  return {
    'Peru 10d': build(PE, 10, 10, null),
    'Canada 12d + Ottawa': build(CA, 12, 6, 'ec_corridor#west_to_east+ottawa@corridor'),
    'Japan 14d + Kyoto': build(JP, 14, 10, 'tokyo_city+kyoto@after_tokyo'),
    'Tokyo-only 7d': build(JP, 7, 10, 'tokyo_city')
  };
}

const seqOf = (trip, id = 'seq-test') => tripSequenceFromTrip(trip, { id });
const entry = (seq, stopKey) => seq.entries.find((e) => e.stopKey === stopKey);
const connection = (id) => PILOT_DATA.connections.find((c) => c.id === id);
const sum = (xs) => xs.reduce((a, b) => a + b, 0);

test('the sequence has exactly the contract fields: no planning provenance, no connection experiences, no evidence', () => {
  for (const [name, trip] of Object.entries(referenceTrips())) {
    const seq = seqOf(trip);
    assert.deepEqual(Object.keys(seq), ['schemaVersion', 'id', 'source', 'origin', 'travelMonth', 'totalDays', 'entries', 'returnConnectionId'], name);
    assert.equal(seq.schemaVersion, 2);
    assert.equal(seq.source, 'door2');
    assert.deepEqual(seq.origin, { placeId: 'vancouver' });
    assert.equal(seq.travelMonth, trip.spec.travelMonth);
    assert.equal('evidence' in seq, false, `${name}: evidence is reserved, not built`);
    for (const e of seq.entries) {
      // No minNights/maxNights/optionalId/selectionSource/isRequired, and no inboundExperienceIds (F1-D19b).
      assert.deepEqual(Object.keys(e), ['placeId', 'stopKey', 'nights', 'role', 'excursions', 'inboundConnectionId'], `${name}/${e.stopKey}`);
    }
    assert.deepEqual(checkTripSequence(seq), [], name);
  }
});

test('travelMonth is omitted when the spec has none', () => {
  const trip = structuredClone(build(JP, 7, 10, 'tokyo_city'));
  delete trip.spec.travelMonth;
  assert.equal('travelMonth' in seqOf(trip), false);
});

test('round-trip fidelity: every stop, in order, pass-throughs included, with the same nights (§4.8)', () => {
  for (const [name, trip] of Object.entries(referenceTrips())) {
    const seq = seqOf(trip);
    const stops = trip.routePlan.stops;
    assert.equal(seq.entries.length, stops.length, name);
    assert.deepEqual(seq.entries.map((e) => e.placeId), stops.map((s) => s.placeId), name);
    assert.deepEqual(seq.entries.map((e) => e.stopKey), stops.map((s) => s.key), name);
    assert.deepEqual(seq.entries.map((e) => e.nights), stops.map((s) => s.nights), name);
    assert.equal(sum(seq.entries.map((e) => e.nights)), sum(stops.map((s) => s.nights)), name);
  }
});

test('the adapter is read-only: the trip is unchanged', () => {
  for (const trip of Object.values(referenceTrips())) {
    const before = JSON.stringify(trip);
    seqOf(trip);
    assert.equal(JSON.stringify(trip), before);
  }
});

test('id is the caller\'s: never derived from content, required', () => {
  const trip = build(PE, 10, 10, null);
  const a = tripSequenceFromTrip(trip, { id: 'a' });
  const b = tripSequenceFromTrip(trip, { id: 'b' });
  assert.equal(a.id, 'a');
  assert.equal(b.id, 'b');
  assert.deepEqual({ ...a, id: null }, { ...b, id: null }, 'same trip, different ids: only the id differs');
  assert.throws(() => tripSequenceFromTrip(trip, {}), /must supply an id/);
  assert.throws(() => tripSequenceFromTrip(trip, { id: '' }), /must supply an id/);
});

// ---------------------------------------------------------------------------
// The authority rule (§2.2)

test('totalDays is the REALISED day count, never spec.totalDays (the requested length)', () => {
  const trip = build(PE, 10, 10, null);
  assert.equal(seqOf(trip).totalDays, trip.days.length);

  // DELIBERATELY INCONSISTENT ADAPTER-TEST INPUT, NEVER AN ENGINE-PRODUCED TRIP. schedule.js:390 makes
  // days.length === spec.totalDays on every valid trip, so no real trip can separate requested from
  // realised. Change only the request on a clone: the output must still follow days.length.
  for (const requested of [1, 9, 11, 99]) {
    const inconsistent = structuredClone(trip);
    inconsistent.spec.totalDays = requested;
    const seq = seqOf(inconsistent);
    assert.equal(seq.totalDays, trip.days.length, `requested ${requested}: totalDays still follows days.length`);
    assert.notEqual(seq.totalDays, requested);
  }

  // And the other way: change the realised day count, keep the request.
  const shorter = structuredClone(trip);
  shorter.days = shorter.days.slice(0, 7);
  assert.equal(seqOf(shorter).totalDays, 7);
});

test('supplementary source check: the adapter never reads the requested length (not the proof; the clone test is)', () => {
  const src = readFileSync(new URL('../../src/lib/door2/tripSequence.js', import.meta.url), 'utf8');
  const code = src.split('\n').filter((line) => !/^\s*(\/\/|\*|\/\*\*)/.test(line)).join('\n');
  assert.equal(/spec\.totalDays|requestedDays/.test(code), false);
});

test('a stretched trip: the allocation survives an authored maximum, and totalDays is 14 from days.length (§4.10)', () => {
  // Japan 14d on Tokyo alone stretches Tokyo's NIGHTS past its authored maximum. Its day count is still 14 = 14,
  // so this proves the allocation is carried as built; it does not separate requested from realised.
  const trip = build(JP, 14, 10, 'tokyo_city');
  const stop = trip.routePlan.stops[0];
  assert.ok(stop.nights > stop.maxNights, `Tokyo is stretched: ${stop.nights} > ${stop.maxNights}`);
  const seq = seqOf(trip);
  assert.equal(seq.entries[0].nights, 12);
  assert.equal(seq.entries[0].nights, stop.nights);
  assert.equal(seq.totalDays, 14);
  assert.equal(seq.totalDays, trip.days.length);
});

// ---------------------------------------------------------------------------
// Legs (§2.1a)

test('connections: every entry takes connectionIds[i], entry 0 included; the leg home is returnConnectionId (§4.11)', () => {
  for (const [name, trip] of Object.entries(referenceTrips())) {
    const seq = seqOf(trip);
    const ids = trip.routePlan.connectionIds;
    assert.equal(ids.length, seq.entries.length + 1, `${name}: stops + 1 legs`);
    seq.entries.forEach((e, i) => assert.equal(e.inboundConnectionId, ids[i], `${name}: entry ${i}`));
    assert.equal(seq.returnConnectionId, ids[seq.entries.length], name);
    // Ordered, not a set: a there-and-back route repeats connection ids (Peru's train is legs 3 and 4).
    assert.deepEqual([...seq.entries.map((e) => e.inboundConnectionId), seq.returnConnectionId], ids, name);

    // Each leg serves the endpoints its position implies, under the scheduler's orientation rule.
    const legPlaces = [seq.origin.placeId, ...seq.entries.map((e) => e.placeId), seq.origin.placeId];
    [...seq.entries.map((e) => e.inboundConnectionId), seq.returnConnectionId].forEach((id, i) => {
      assert.ok(orientConnection(connection(id), legPlaces[i], legPlaces[i + 1]), `${name}: leg ${i} ${id} serves ${legPlaces[i]} -> ${legPlaces[i + 1]}`);
    });
  }
});

test('Peru keeps all 7 entries and all 8 legs, the repeated train included', () => {
  const seq = seqOf(build(PE, 10, 10, null));
  assert.equal(seq.entries.length, 7);
  const legs = [...seq.entries.map((e) => e.inboundConnectionId), seq.returnConnectionId];
  assert.equal(legs.length, 8);
  assert.equal(legs[3], 'conn_olly_agc_train');
  assert.equal(legs[4], 'conn_olly_agc_train');
  assert.equal(entry(seq, 'pc_lima_in').inboundConnectionId, 'conn_yvr_lim_air', 'entry 0 arrives on the journey out');
  assert.equal(entry(seq, 'pc_cusco').inboundConnectionId, 'conn_lim_cuz_air', 'Cusco arrives from Lima, not on the Vancouver flight');
  assert.equal(seq.returnConnectionId, 'conn_yvr_lim_air');
});

test('the adapter refuses a plan that is not a round trip (open-jaw is a future item, not covered)', () => {
  const trip = structuredClone(build(PE, 10, 10, null));
  trip.routePlan.connectionIds.pop();
  assert.throws(() => seqOf(trip), /expected stops \+ 1/);
});

// ---------------------------------------------------------------------------
// Excursion requirements (§2.1b)

test('Aguas Calientes carries Machu Picchu as a fixed requirement (§4.11b)', () => {
  const trip = build(PE, 10, 10, null);
  const aguas = entry(seqOf(trip), 'pc_aguas');
  assert.deepEqual(aguas.excursions, [{ placeId: 'machu_picchu', connectionId: 'conn_agc_mp_shuttle', hoursOnSite: 4, source: 'fixed' }]);
  const planned = trip.routePlan.stops.find((s) => s.key === 'pc_aguas').excursions;
  assert.deepEqual(aguas.excursions.map(({ placeId, connectionId, hoursOnSite }) => ({ placeId, connectionId, hoursOnSite })), planned);
});

test('a trip with no excursions carries excursions: [] on every entry', () => {
  for (const e of seqOf(build(JP, 7, 10, 'tokyo_city')).entries) assert.deepEqual(e.excursions, []);
  for (const e of seqOf(build(CA, 12, 6, 'ec_corridor#west_to_east+ottawa@corridor')).entries) assert.deepEqual(e.excursions, []);
});

test('a selected Nikko day trip is carried as a selected requirement, matching what the scheduler placed', () => {
  const trip = addExcursion(build(JP, 14, 10, 'tokyo_city+kyoto@after_tokyo'), 'tokyo_base', 'nikko');
  const tokyo = entry(seqOf(trip), 'tokyo_base');
  assert.deepEqual(tokyo.selectedExcursionIds, ['nikko']);
  assert.deepEqual(tokyo.excursions, [{ placeId: 'nikko', connectionId: 'conn_tyo_nikko_train', hoursOnSite: 4, source: 'selected', excursionId: 'nikko' }]);

  // Cross-check against the built schedule: the same connection and on-site time.
  const blocks = trip.days.flatMap((d) => d.blocks);
  const out = blocks.find((b) => b.id.startsWith('ex:tokyo_base:nikko:out'));
  const site = blocks.find((b) => b.id.startsWith('ex:tokyo_base:nikko:site'));
  assert.equal(out.transport.connectionId, tokyo.excursions[0].connectionId);
  assert.equal(site.placeId, 'nikko');
  assert.equal(site.durationHours, tokyo.excursions[0].hoursOnSite);
});

test('selected requirements need the compiled package: the Trip alone does not resolve them (a contract finding)', () => {
  // A plan stop stores only menu ids. Without the package the adapter cannot say where a selected day trip goes
  // or how long it takes, so it refuses rather than guess. Fixed requirements need no package.
  const noPackages = { ...PILOT_DATA, routePackages: [], allRoutePackages: [] };
  const withNikko = addExcursion(build(JP, 14, 10, 'tokyo_city'), 'tokyo_base', 'nikko');
  assert.throws(() => tripSequenceFromTrip(withNikko, { id: 'x', data: noPackages }), /cannot resolve selected excursions/);
  assert.deepEqual(tripSequenceFromTrip(build(PE, 10, 10, null), { id: 'x', data: noPackages }), seqOf(build(PE, 10, 10, null), 'x'));
});

test('a withdrawn selection fails loudly instead of being dropped', () => {
  const trip = structuredClone(addExcursion(build(JP, 14, 10, 'tokyo_city'), 'tokyo_base', 'nikko'));
  trip.routePlan.stops[0].selectedExcursionIds = ['not_on_the_menu'];
  assert.throws(() => seqOf(trip), /do not resolve \(not_in_menu at tokyo_base\)/);
});

test('a zero-night entry carrying an excursion requirement fails validation', () => {
  // DELIBERATELY INCONSISTENT ADAPTER-TEST INPUT: no engine path leaves Aguas Calientes at 0 nights.
  const trip = structuredClone(build(PE, 10, 10, null));
  trip.routePlan.stops.find((s) => s.key === 'pc_aguas').nights = 0;
  assert.throws(() => seqOf(trip), /pc_aguas: zero nights but 1 excursion requirement/);
});

// ---------------------------------------------------------------------------
// Selections (§4.13)

test('selectedExcursionIds survive in menu order, and the key is absent when nothing is selected', () => {
  const plain = build(JP, 14, 10, 'tokyo_city');
  assert.equal('selectedExcursionIds' in seqOf(plain).entries[0], false, 'absent, not []');

  // Chosen in reverse menu order: the entry still carries menu order (nikko, kamakura).
  const both = addExcursion(addExcursion(plain, 'tokyo_base', 'kamakura'), 'tokyo_base', 'nikko');
  const tokyo = seqOf(both).entries[0];
  assert.deepEqual(tokyo.selectedExcursionIds, ['nikko', 'kamakura']);
  assert.deepEqual(tokyo.excursions.map((x) => [x.excursionId, x.source]), [['nikko', 'selected'], ['kamakura', 'selected']]);

  const removed = apply(both, R.previewRemoveExcursion(both, 'tokyo_base', 'nikko'));
  const afterRemove = apply(removed, R.previewRemoveExcursion(removed, 'tokyo_base', 'kamakura'));
  assert.equal('selectedExcursionIds' in seqOf(afterRemove).entries[0], false, 'absent again after the last one is removed');
});

// ---------------------------------------------------------------------------
// Role (§2.3, F1-D30)

test('role distribution on the reference trips: Aguas Calientes is the only hub (§4.12)', () => {
  const byRole = (seq) => {
    const out = { base: [], hub: [], passthrough: [] };
    for (const e of seq.entries) out[e.role].push(e.stopKey);
    return out;
  };
  const trips = referenceTrips();
  assert.deepEqual(byRole(seqOf(trips['Peru 10d'])), {
    base: ['pc_lima_in', 'pc_cusco', 'pc_lima_out'],
    hub: ['pc_aguas'],
    passthrough: ['pc_sacred_valley', 'pc_olly_return', 'pc_cusco_return']
  });
  assert.deepEqual(byRole(seqOf(trips['Canada 12d + Ottawa'])), { base: ['ec_toronto', 'ec_ottawa', 'ec_montreal', 'ec_quebec'], hub: [], passthrough: [] });
  // Tokyo and Kyoto both have menus; a menu is not a hub. The Tokyo return night is classified on its own.
  assert.deepEqual(byRole(seqOf(trips['Japan 14d + Kyoto'])), { base: ['tokyo_base', 'kyo_base', 'tokyo_hub'], hub: [], passthrough: [] });
  assert.deepEqual(byRole(seqOf(trips['Tokyo-only 7d'])), { base: ['tokyo_base'], hub: [], passthrough: [] });
});

test('role is not RoutePlanStop.role: an optional-inserted stop is a base, not "optional"', () => {
  const trip = build(CA, 12, 6, 'ec_corridor#west_to_east+ottawa@corridor');
  assert.equal(trip.routePlan.stops.find((s) => s.key === 'ec_ottawa').role, 'optional');
  assert.equal(entry(seqOf(trip), 'ec_ottawa').role, 'base');
});

test('a selected excursion makes a hub; Kyoto with Nara selected is a hub while the Tokyo stops stay bases', () => {
  const trip = addExcursion(build(JP, 14, 10, 'tokyo_city+kyoto@after_tokyo'), 'kyo_base', 'nara');
  const seq = seqOf(trip);
  assert.equal(entry(seq, 'kyo_base').role, 'hub');
  assert.equal(entry(seq, 'tokyo_base').role, 'base');
  assert.equal(entry(seq, 'tokyo_hub').role, 'base');
});

test('the role rule, in priority order', () => {
  const fixed = [{ placeId: 'x', connectionId: 'c', hoursOnSite: 1 }];
  assert.equal(tripSequenceRole({ nights: 0, excursions: [] }), 'passthrough');
  assert.equal(tripSequenceRole({ nights: 0, excursions: fixed }), 'passthrough', 'nights first (and the validator then rejects it)');
  assert.equal(tripSequenceRole({ nights: 2, excursions: fixed }), 'hub');
  assert.equal(tripSequenceRole({ nights: 2, excursions: [], selectedExcursionIds: ['nikko'] }), 'hub');
  assert.equal(tripSequenceRole({ nights: 2, excursions: [] }), 'base');
});

test('one-entry sequence: Tokyo-only 7d is a single base with an outbound and a separate return leg (§4.14)', () => {
  // The full F1-D24 invariant (a single-base Door 1 record and a one-stop family giving identical output)
  // needs Door 1 and belongs to F8; it is not attempted here.
  const trip = build(JP, 7, 10, 'tokyo_city');
  const seq = seqOf(trip);
  assert.equal(seq.entries.length, 1);
  assert.equal(seq.entries[0].role, 'base', 'nothing is selected');
  assert.equal(seq.entries[0].inboundConnectionId, trip.routePlan.connectionIds[0]);
  assert.equal(seq.returnConnectionId, trip.routePlan.connectionIds[1]);
  assert.equal(seq.totalDays, 7);
});

test('zero-night roles: Sacred Valley is a passthrough until a night is added, and its stopKey never changes (§4.14b)', () => {
  const trip = build(PE, 10, 10, null);
  const sv = trip.routePlan.stops.find((s) => s.key === 'pc_sacred_valley');
  assert.equal(sv.nights, 0);
  assert.equal(sv.maxNights, 1);
  const seq = seqOf(trip);
  for (const key of ['pc_sacred_valley', 'pc_olly_return', 'pc_cusco_return']) assert.equal(entry(seq, key).role, 'passthrough', key);

  const edited = apply(trip, R.previewAdjustNights(trip, 'pc_sacred_valley', +1), 'nights:pc_sacred_valley:+1:from:pc_cusco');
  const after = seqOf(edited);
  assert.equal(entry(after, 'pc_sacred_valley').nights, 1);
  assert.equal(entry(after, 'pc_sacred_valley').role, 'base');
  assert.deepEqual(after.entries.map((e) => e.stopKey), seq.entries.map((e) => e.stopKey), 'a role change mints no new stop identity');
});

// ---------------------------------------------------------------------------
// Boundary (§3.1)

// F3b.1 §2.5 replaces F3's "nothing in src/ imports the adapter": that rule stopped the materialiser validating its
// input. The F3b handoff modules may share code (materialise.js imports the checker); no existing live build path
// may consume them.
const HANDOFF_MODULES = ['lib/door2/tripSequence.js', 'lib/door2/materialise.js'];
const IMPORTS_HANDOFF = /(?:from|import)\s*\(?\s*['"][^'"]*\/(?:tripSequence|materialise)(?:\.js)?['"]/;

test('no existing live build path consumes the new handoff', () => {
  const root = fileURLToPath(new URL('../../src/', import.meta.url));
  const files = readdirSync(root, { recursive: true }).filter((f) => /\.(jsx?|tsx?)$/.test(f));
  const importers = files.filter((f) => !HANDOFF_MODULES.includes(f) && IMPORTS_HANDOFF.test(readFileSync(join(root, f), 'utf8')));
  assert.deepEqual(importers, []);
  // The check is live: it sees the one permitted import between the handoff modules, and a dynamic import.
  assert.match(readFileSync(join(root, 'lib/door2/materialise.js'), 'utf8'), IMPORTS_HANDOFF);
  assert.match("const m = await import('./door2/materialise.js');", IMPORTS_HANDOFF);
});

// ---------------------------------------------------------------------------
// F3b: the stage-1 producer, from a plan (brief §2.1)

/** The §3 cases: the reference trips, selections singly and together, and the stretch. */
function f3bCases() {
  const japan = build(JP, 14, 10, 'tokyo_city+kyoto@after_tokyo');
  const withNikko = addExcursion(japan, 'tokyo_base', 'nikko');
  return {
    ...referenceTrips(),
    'Japan 14d + Kyoto, Nikko': withNikko,
    'Japan 14d + Kyoto, Nara': addExcursion(japan, 'kyo_base', 'nara'),
    'Japan 14d + Kyoto, Nikko and Nara': addExcursion(withNikko, 'kyo_base', 'nara'),
    'Japan 14d Tokyo, Kamakura then Nikko (menu order)': addExcursion(addExcursion(build(JP, 14, 10, 'tokyo_city'), 'tokyo_base', 'kamakura'), 'tokyo_base', 'nikko'),
    'Japan 14d Tokyo, stretched': build(JP, 14, 10, 'tokyo_city')
  };
}

test('F3b: tripSequenceFromPlan and tripSequenceFromTrip are identical apart from totalDays', () => {
  for (const [name, trip] of Object.entries(f3bCases())) {
    const fromPlan = tripSequenceFromPlan(trip.spec, trip.routePlan, { id: 'seq-test' });
    const fromTrip = seqOf(trip);
    assert.equal('totalDays' in fromPlan, false, `${name}: no realised day count before materialisation`);
    const { totalDays, ...rest } = fromTrip;
    assert.equal(totalDays, trip.days.length, name);
    assert.deepEqual(fromPlan, rest, name);
    assert.deepEqual(checkTripSequence(fromPlan, { data: PILOT_DATA }), [], name);
  }
});

test('F3b: the producer reads the plan and the spec, never the days', () => {
  const trip = build(PE, 10, 10, null);
  // A plan and a spec, with no Trip around them at all.
  const seq = tripSequenceFromPlan(structuredClone(trip.spec), structuredClone(trip.routePlan), { id: 'p' });
  assert.deepEqual(seq.entries.map((e) => e.nights), trip.routePlan.stops.map((s) => s.nights));
  assert.throws(() => tripSequenceFromPlan(trip.spec, trip.routePlan, {}), /must supply an id/);
  assert.throws(() => tripSequenceFromPlan(trip.spec, undefined, { id: 'p' }), /no routePlan/);
});

// ---------------------------------------------------------------------------
// F3b: the checker, hardened (brief §2.4). Each mutation was accepted at 6ac8c5d.

const peruSeq = () => seqOf(build(PE, 10, 10, null));
const full = (seq) => checkTripSequence(seq, { data: PILOT_DATA });
const mutated = (fn) => {
  const seq = structuredClone(peruSeq());
  fn(seq);
  return seq;
};

test('F3b mutation 1: a return leg that cannot reach home (Lima -> Cusco) is rejected, given the graph', () => {
  const seq = mutated((s) => (s.returnConnectionId = 'conn_lim_cuz_air'));
  assert.deepEqual(checkTripSequence(seq), [], 'structurally a valid id: the cheap check cannot see it');
  assert.deepEqual(full(seq), ['returnConnectionId "conn_lim_cuz_air" does not serve lima -> vancouver']);
});

test('F3b mutation 2: an entry without a stopKey is rejected', () => {
  const seq = mutated((s) => delete s.entries[2].stopKey);
  assert.ok(checkTripSequence(seq).includes('entry #2: stopKey is missing'), checkTripSequence(seq).join('; '));
});

test('F3b mutation 3: two entries with the same stopKey are rejected', () => {
  const seq = mutated((s) => (s.entries[2].stopKey = s.entries[1].stopKey));
  assert.deepEqual(checkTripSequence(seq), ['entry pc_cusco: stopKey "pc_cusco" is not unique']);
});

test('F3b mutation 4: a fixed excursion without hoursOnSite is rejected', () => {
  const seq = mutated((s) => delete s.entries.find((e) => e.stopKey === 'pc_aguas').excursions[0].hoursOnSite);
  assert.deepEqual(checkTripSequence(seq), ['entry pc_aguas: excursion 0: hoursOnSite undefined is not a duration']);
});

test('F3b mutation 5: a fixed excursion without connectionId is rejected', () => {
  const seq = mutated((s) => delete s.entries.find((e) => e.stopKey === 'pc_aguas').excursions[0].connectionId);
  assert.deepEqual(checkTripSequence(seq), ['entry pc_aguas: excursion 0: connectionId is missing']);
});

test('F3b mutation 6: an inbound leg that does not serve its entry is rejected, given the graph', () => {
  // Cusco's inbound swapped for the road leg Cusco -> Ollantaytambo: a real connection, the wrong endpoints.
  const seq = mutated((s) => (s.entries[1].inboundConnectionId = 'conn_cuz_olly_road'));
  assert.deepEqual(checkTripSequence(seq), []);
  assert.deepEqual(full(seq), ['entry pc_cusco: inboundConnectionId "conn_cuz_olly_road" does not serve lima -> cusco']);
});

test('F3b mutation 7: an entry moved to an unrelated place is rejected, given the graph', () => {
  const seq = mutated((s) => (s.entries[1].placeId = 'tokyo'));
  assert.deepEqual(checkTripSequence(seq), []);
  assert.deepEqual(full(seq), [
    'entry pc_cusco: inboundConnectionId "conn_lim_cuz_air" does not serve lima -> tokyo',
    'entry pc_sacred_valley: inboundConnectionId "conn_cuz_olly_road" does not serve tokyo -> ollantaytambo'
  ]);
});

test('F3b: every required identifier must be a non-empty string, and every excursion source valid', () => {
  const blank = mutated((s) => {
    s.origin.placeId = '';
    s.entries[0].placeId = '';
    s.entries[0].inboundConnectionId = '';
    s.returnConnectionId = '';
  });
  assert.deepEqual(checkTripSequence(blank), [
    'origin.placeId is missing',
    'returnConnectionId is missing',
    'entry pc_lima_in: placeId is missing',
    'entry pc_lima_in: inboundConnectionId is missing'
  ]);
  const aguas = (s) => s.entries.find((e) => e.stopKey === 'pc_aguas').excursions[0];
  assert.deepEqual(checkTripSequence(mutated((s) => (aguas(s).placeId = ''))), ['entry pc_aguas: excursion 0: placeId is missing']);
  assert.deepEqual(checkTripSequence(mutated((s) => (aguas(s).source = 'menu'))), ['entry pc_aguas: excursion 0: source "menu" is not fixed or selected']);
  assert.deepEqual(checkTripSequence(mutated((s) => (aguas(s).hoursOnSite = 0))), ['entry pc_aguas: excursion 0: hoursOnSite 0 is not a duration']);
});

test('F3b: selected requirements must still match selectedExcursionIds, in order', () => {
  const trip = addExcursion(addExcursion(build(JP, 14, 10, 'tokyo_city'), 'tokyo_base', 'kamakura'), 'tokyo_base', 'nikko');
  const seq = structuredClone(seqOf(trip));
  seq.entries[0].selectedExcursionIds.reverse();
  assert.deepEqual(checkTripSequence(seq), ['entry tokyo_base: selected requirements do not match selectedExcursionIds']);
});

test('F3b: given the graph, unknown places and connections, and an excursion its base cannot reach, are rejected', () => {
  assert.deepEqual(full(mutated((s) => (s.entries[0].placeId = 'atlantis'))), [
    'entry pc_lima_in: unknown place "atlantis"',
    'entry pc_lima_in: inboundConnectionId "conn_yvr_lim_air" does not serve vancouver -> atlantis',
    'entry pc_cusco: inboundConnectionId "conn_lim_cuz_air" does not serve atlantis -> cusco'
  ]);
  assert.deepEqual(full(mutated((s) => (s.returnConnectionId = 'conn_nowhere'))), ['returnConnectionId: unknown connection "conn_nowhere"']);
  const aguas = (s) => s.entries.find((e) => e.stopKey === 'pc_aguas').excursions[0];
  assert.deepEqual(full(mutated((s) => (aguas(s).connectionId = 'conn_olly_agc_train'))), [
    'entry pc_aguas: excursion 0: connection "conn_olly_agc_train" does not serve aguas_calientes <-> machu_picchu'
  ]);
});

test('F3b: the structural check runs without the graph; the graph check runs only with it', () => {
  for (const [name, trip] of Object.entries(referenceTrips())) {
    const seq = seqOf(trip);
    assert.deepEqual(checkTripSequence(seq), [], name);
    assert.deepEqual(checkTripSequence(seq, {}), [], name);
    assert.deepEqual(full(seq), [], name);
  }
});

test('F3b, correcting F3: the leg COUNT guard does not reject an open-jaw journey; endpoint validation does', () => {
  // Canada west-to-east, flying home from Toronto instead of Québec: stops + 1 legs, so the count is right
  // and the structural check passes. Only the endpoints differ, and only the graph check sees them.
  const seq = structuredClone(seqOf(build(CA, 12, 6, 'ec_corridor#west_to_east+ottawa@corridor')));
  assert.equal(seq.returnConnectionId, 'conn_yvr_yqb_air');
  seq.returnConnectionId = 'conn_yvr_yyz_air';
  assert.equal(seq.entries.length + 1, [...seq.entries.map((e) => e.inboundConnectionId), seq.returnConnectionId].length);
  assert.deepEqual(checkTripSequence(seq), []);
  assert.deepEqual(full(seq), ['returnConnectionId "conn_yvr_yyz_air" does not serve quebec_city -> vancouver']);

  // The producer runs the graph check, so a plan of that shape is refused at production.
  const trip = structuredClone(build(CA, 12, 6, 'ec_corridor#west_to_east+ottawa@corridor'));
  trip.routePlan.connectionIds[trip.routePlan.connectionIds.length - 1] = 'conn_yvr_yyz_air';
  assert.throws(() => seqOf(trip), /returnConnectionId "conn_yvr_yyz_air" does not serve quebec_city -> vancouver/);
});
