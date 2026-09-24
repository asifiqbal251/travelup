import { test } from 'node:test';
import assert from 'node:assert/strict';

import { PILOT_DATA, buildSkeletonTrip } from '../../src/lib/door2/planner.js';
import { selectRoutes } from '../../src/lib/door2/route.js';
import { scheduleRoute } from '../../src/lib/door2/schedule.js';
import { validateSkeleton } from '../../src/lib/door2/validate.js';

// Expected values below were derived independently of this code (see the
// scheduler brief, Part E). If one disagrees, don't edit it to match: work out
// which side is wrong.
//
// Exception (decided 2026-09-22): the brief's Peru expectations (F2–F5)
// assumed Vancouver->Lima loses 15.75h (11.0h elapsed). The catalogue row
// (segments 4.6 + 6.6 = 11.2h in-vehicle, plus a 1.5h layover) is 12.7h
// elapsed, so 17.45h lost. The row stands; F2–F5 were re-derived by hand
// for 17.45h. The brief's original values are noted inline as "brief:".

const DRAFTS = { reviewPolicy: 'allow_drafts' };

function spec(destination, totalDays, requiredPlaceIds = []) {
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
    choices: { pinned: [], rejected: [], placed: [] }
  };
}

const PERU = { kind: 'country', id: 'PE' };
const F = {
  F1: spec({ kind: 'place', id: 'new_york' }, 7),
  F2: spec(PERU, 10),
  F3: spec(PERU, 5),
  F4: spec(PERU, 12, ['huaraz', 'machu_picchu']),
  F5: spec(PERU, 9, ['huaraz', 'machu_picchu']),
  F6: spec({ kind: 'place', id: 'tokyo' }, 7),
  F9: spec({ kind: 'place', id: 'ljubljana' }, 7)
};

const nightsOf = (trip) => Object.fromEntries(trip.spec.stops.map((s) => [s.id, s.nights]));
const day = (trip, n) => trip.days[n - 1];
const blocks = (trip, n) => day(trip, n).blocks;
const blockById = (trip, id) => trip.days.flatMap((d) => d.blocks.map((b) => ({ ...b, dayNumber: d.dayNumber }))).find((b) => b.id === id);
const endClock = (b) => {
  const [h, m] = b.startTime.split(':').map(Number);
  const total = Math.round(h * 60 + m + b.durationHours * 60);
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

function assertTrip(result) {
  assert.notEqual(result.ok, false, `expected a Trip, got failure ${JSON.stringify(result)}`);
  return result;
}

// Test-only package builder.
function testPackage(id, stops) {
  const placeIds = [];
  for (const s of stops) {
    if (!placeIds.includes(s.placeId)) placeIds.push(s.placeId);
    for (const ex of s.excursions) if (!placeIds.includes(ex.placeId)) placeIds.push(ex.placeId);
  }
  return { id, name: id, countryId: 'PE', stops, placeIds, visitRules: { minNights: 0, maxNights: 0, extensions: [] }, reviewed: false };
}
const st = (id, placeId, minNights, maxNights, excursions = []) => ({ id, placeId, minNights, maxNights, excursions });
const MP_EXCURSION = { placeId: 'machu_picchu', connectionId: 'conn_agc_mp_shuttle', hoursOnSite: 4 };
const withPackages = (routePackages) => ({ ...PILOT_DATA, routePackages });

test('F1: NYC, 7 days', () => {
  const trip = assertTrip(buildSkeletonTrip(F.F1, PILOT_DATA, DRAFTS));
  assert.equal(trip.status, 'valid'); // 72eb2d7: all connections reviewed → trip status 'valid'
  assert.deepEqual(nightsOf(trip), { nyc_base: 6 });
  const out = blocks(trip, 1)[0];
  assert.equal(out.type, 'travel');
  assert.equal(out.startTime, '09:00');
  assert.equal(out.transport.arriveDayNumber, 1);
  assert.equal(out.transport.arriveTime, '22:15');
  assert.equal(out.transport.overnight, false);
  assert.equal(blocks(trip, 1).filter((b) => b.type === 'open').length, 0);
  const home = blocks(trip, 7).find((b) => b.type === 'travel');
  assert.equal(home.startTime, '09:00');
  assert.equal(home.placeId, 'new_york');
  assert.equal(home.transport.arriveDayNumber, 7);
  assert.equal(home.transport.arriveTime, '16:15');
});

test('F2: Peru, 10 days', () => {
  const trip = assertTrip(buildSkeletonTrip(F.F2, PILOT_DATA, DRAFTS));
  assert.equal(trip.spec.routeTemplateId, 'peru_classic');
  // minDays is 8, so the 2 extra nights go round-robin to lima_in then cusco.
  assert.deepEqual(nightsOf(trip), {
    pc_lima_in: 2,
    pc_cusco: 3,
    pc_sacred_valley: 0, // brief: 1
    pc_aguas: 1,
    pc_olly_return: 0,
    pc_cusco_return: 0,
    pc_lima_out: 1
  });

  const out = blockById(trip, 'tr:origin_out>pc_lima_in');
  assert.equal(out.dayNumber, 1);
  assert.equal(out.startTime, '09:00');
  assert.equal(out.transport.arriveDayNumber, 2);
  assert.equal(out.transport.arriveTime, '04:57'); // brief: 02:45; 72eb2d7: YVR–LIM layover 1.5h → 2.0h (+30 min)
  assert.equal(out.transport.overnight, true);
  const d2Open = blocks(trip, 2).filter((b) => b.type === 'open').reduce((s, b) => s + b.durationHours, 0);
  assert.ok(d2Open <= 4, `D2 open ${d2Open}h`);

  const limCuz = blockById(trip, 'tr:pc_lima_in>pc_cusco');
  assert.equal(limCuz.dayNumber, 4);
  assert.equal(limCuz.startTime, '09:00');
  assert.equal(limCuz.transport.arriveTime, '14:00');

  const cuzOlly = blockById(trip, 'tr:pc_cusco>pc_sacred_valley');
  assert.equal(cuzOlly.dayNumber, 7);
  assert.equal(cuzOlly.transport.arriveTime, '11:03');

  // Sacred Valley is a pass-through now: the train leaves on arrival.
  const ollyAgc = blockById(trip, 'tr:pc_sacred_valley>pc_aguas');
  assert.equal(ollyAgc.dayNumber, 7); // brief: 8
  assert.equal(ollyAgc.startTime, '11:03');
  assert.equal(ollyAgc.transport.arriveTime, '13:39'); // brief: 11:51; 72eb2d7: train 1.75h → 1.5h (−15 min)

  const exOut = blockById(trip, 'ex:pc_aguas:machu_picchu:out');
  const exSite = blockById(trip, 'ex:pc_aguas:machu_picchu:site');
  const exBack = blockById(trip, 'ex:pc_aguas:machu_picchu:back');
  assert.equal(exOut.dayNumber, 7); // brief: D8 11:51–17:33
  assert.equal(exOut.startTime, '13:39'); // 72eb2d7: train −15 min
  assert.equal(exBack.transport.arriveTime, '19:21'); // 72eb2d7: train −15 min
  assert.equal(exSite.type, 'open');
  assert.equal(exSite.placeId, 'machu_picchu');
  assert.equal(exSite.anchor.stopId, 'pc_aguas');

  // D8 (brief: D9): Aguas -> Ollantaytambo -> Cusco -> Lima, chaining through the pass-throughs.
  const chain = blocks(trip, 8).filter((b) => b.type === 'travel');
  assert.deepEqual(
    chain.map((b) => b.id),
    ['tr:pc_aguas>pc_olly_return', 'tr:pc_olly_return>pc_cusco_return', 'tr:pc_cusco_return>pc_lima_out']
  );
  assert.equal(chain[1].startTime, chain[0].transport.arriveTime);
  assert.equal(chain[2].startTime, chain[1].transport.arriveTime);
  assert.equal(chain[2].transport.arriveTime, '18:39'); // 72eb2d7: the return train is the same row, −15 min

  // The flight home leaves D9 and lands just after midnight on D10.
  const home = blockById(trip, 'tr:pc_lima_out>origin_home');
  assert.equal(home.dayNumber, 9); // brief: 10
  assert.equal(home.startTime, '09:00');
  assert.equal(home.transport.arriveDayNumber, 10);
  assert.equal(home.transport.arriveTime, '00:57'); // brief: 22:45; 72eb2d7: LIM–YVR layover +30 min
  assert.equal(home.transport.overnight, true); // brief: false
  assert.deepEqual(blocks(trip, 10).map((b) => [b.type, b.note]), [['rest', 'in_transit']]);
});

test('F3: Peru, 5 days is too short', () => {
  const r = buildSkeletonTrip(F.F3, PILOT_DATA, DRAFTS);
  assert.equal(r.ok, false);
  assert.equal(r.state, 'duration_too_short');
  assert.equal(r.detail.minDays, 8); // brief: 7
  assert.ok(r.options.some((o) => o.action === 'extend' && o.days === 3)); // brief: 2
});

test('F4: Peru + Huaraz + Machu Picchu, 12 days', () => {
  const trip = assertTrip(buildSkeletonTrip(F.F4, PILOT_DATA, DRAFTS));
  // Route Families: the Huaraz package is now the compiled variant 'peru_classic+huaraz@after_lima_in'
  // (old id kept as an alias), with family stop keys: ph_* -> pc_*, ph_lima_mid -> pc_lima_hub.
  assert.equal(trip.spec.routeTemplateId, 'peru_classic+huaraz@after_lima_in');
  // minDays is 11, so the 1 extra night goes to lima_in.
  assert.deepEqual(nightsOf(trip), {
    pc_lima_in: 2,
    pc_huaraz: 2, // brief: 3
    pc_lima_hub: 1,
    pc_cusco: 2,
    pc_sacred_valley: 0,
    pc_aguas: 1,
    pc_olly_return: 0,
    pc_cusco_return: 0,
    pc_lima_out: 1
  });
  const toHuaraz = blockById(trip, 'tr:pc_lima_in>pc_huaraz');
  assert.equal(toHuaraz.dayNumber, 4);
  assert.equal(toHuaraz.transport.arriveTime, '18:21'); // 72eb2d7: Lima↔Huaraz coach 8.0h → 8.5h
  const fromHuaraz = blockById(trip, 'tr:pc_huaraz>pc_lima_hub');
  assert.equal(fromHuaraz.dayNumber, 6); // brief: 7
  assert.equal(fromHuaraz.transport.arriveTime, '18:21'); // 72eb2d7: coach 8.0h → 8.5h
  // Lima appears again mid-trip (the hub backtrack) as an overnight stop.
  assert.equal(trip.spec.stops.filter((s) => s.placeId === 'lima' && s.nights >= 1).length, 3);
  assert.ok(blocks(trip, 6).some((b) => b.type === 'open' && b.placeId === 'lima' && b.anchor.stopId === 'pc_lima_hub'));
  assert.equal(blockById(trip, 'tr:pc_lima_hub>pc_cusco').dayNumber, 7); // brief: 8
  const exOut = blockById(trip, 'ex:pc_aguas:machu_picchu:out');
  const exBack = blockById(trip, 'ex:pc_aguas:machu_picchu:back');
  assert.equal(exOut.dayNumber, 9); // brief: 10
  assert.equal(exOut.startTime, '13:39'); // 72eb2d7: train −15 min
  assert.equal(exBack.transport.arriveTime, '19:21'); // 72eb2d7: train −15 min
  const home = blockById(trip, 'tr:pc_lima_out>origin_home');
  assert.equal(home.dayNumber, 11);
  assert.equal(home.transport.arriveDayNumber, 12);
  assert.equal(home.transport.arriveTime, '00:57'); // brief: 22:45; 72eb2d7: layover +30 min
});

test('F5: Peru + Huaraz + Machu Picchu, 9 days is a required-place conflict', () => {
  const r = buildSkeletonTrip(F.F5, PILOT_DATA, DRAFTS);
  assert.equal(r.ok, false);
  assert.equal(r.state, 'required_place_conflict');
  assert.equal(r.detail.minDays, 11); // brief: 10
  assert.ok(r.options.some((o) => o.action === 'extend' && o.days === 2)); // brief: 1
  const removeHuaraz = r.options.find((o) => o.action === 'remove_place' && o.placeId === 'huaraz');
  assert.ok(removeHuaraz);
  assert.equal(removeHuaraz.routePackageId, 'peru_classic');
  assert.equal(r.options.some((o) => o.action === 'remove_place' && o.placeId === 'machu_picchu'), false);
});

test('F6: Tokyo, 7 days', () => {
  const trip = assertTrip(buildSkeletonTrip(F.F6, PILOT_DATA, DRAFTS));
  assert.deepEqual(nightsOf(trip), { tokyo_base: 5 });
  const out = blockById(trip, 'tr:origin_out>tokyo_base');
  assert.equal(out.transport.connectionId, 'conn_yvr_tokyo_air_nrt');
  assert.equal(out.transport.gatewayId, 'NRT');
  assert.equal(out.dayNumber, 1);
  assert.equal(out.transport.arriveDayNumber, 2);
  assert.equal(out.transport.arriveTime, '16:21');
  assert.equal(out.transport.overnight, true);
  const home = blockById(trip, 'tr:tokyo_base>origin_home');
  assert.equal(home.dayNumber, 7);
  assert.equal(home.startTime, '09:00');
  assert.equal(home.placeId, 'tokyo');
  assert.equal(home.transport.arriveDayNumber, 7);
  assert.equal(home.transport.arriveTime, '08:21');
  assert.equal(home.transport.overnight, true);
});

// 72eb2d7 made every pilot connection reviewed, so "strict refuses the pilot data" became a
// false premise. The intent is kept by un-reviewing one leg that every Peru package uses.
test('F7: strict review policy refuses a route with an unreviewed connection', () => {
  const oneDraft = {
    ...PILOT_DATA,
    connections: PILOT_DATA.connections.map((c) => (c.id === 'conn_lim_cuz_air' ? { ...c, reviewedAt: null } : c))
  };
  const r = buildSkeletonTrip(F.F2, oneDraft, { reviewPolicy: 'strict' });
  assert.equal(r.ok, false);
  assert.equal(r.state, 'connection_unreviewed');
  assert.equal(r.detail.reason, 'unreviewed');
  assert.deepEqual(r.detail.connectionIds, ['conn_lim_cuz_air']);
  // strict is the default.
  assert.deepEqual(buildSkeletonTrip(F.F2, oneDraft), r);
  // The same trip is served when drafts are allowed.
  assert.equal(assertTrip(buildSkeletonTrip(F.F2, oneDraft, DRAFTS)).status, 'draft');
  // And the real (fully reviewed) pilot data passes strict.
  assert.equal(assertTrip(buildSkeletonTrip(F.F2)).status, 'valid');
});

test('F7b: reviewed connections pass strict and produce a valid trip', () => {
  const reviewedData = {
    ...PILOT_DATA,
    connections: PILOT_DATA.connections.map((c) => ({ ...c, reviewedBy: 'test', reviewedAt: '2026-09-22' }))
  };
  const trip = assertTrip(buildSkeletonTrip(F.F1, reviewedData, { reviewPolicy: 'strict' }));
  assert.equal(trip.status, 'valid');
  for (const d of trip.days) for (const b of d.blocks) assert.equal(b.provenance.reviewed, true);
});

test('F8a: a package leg with no connection is connection_unreviewed (missing)', () => {
  const pkg = testPackage('test_huaraz_direct', [
    st('t_lima_in', 'lima', 1, 2),
    st('t_huaraz', 'huaraz', 2, 4),
    st('t_cusco', 'cusco', 2, 4),
    st('t_lima_out', 'lima', 1, 1)
  ]);
  const r = buildSkeletonTrip(F.F2, withPackages([pkg]), DRAFTS);
  assert.equal(r.ok, false);
  assert.equal(r.state, 'connection_unreviewed');
  assert.equal(r.detail.reason, 'missing');
  assert.equal(r.detail.from, 'huaraz');
  assert.equal(r.detail.to, 'cusco');
  assert.deepEqual(r.options.map((o) => o.action), ['check_back_later']);
});

test('F8b: a package stop with an unknown placeId throws', () => {
  const pkg = testPackage('test_atlantis', [st('t_lima', 'lima', 1, 2), st('t_atlantis', 'atlantis', 1, 2)]);
  assert.throws(() => buildSkeletonTrip(F.F2, withPackages([pkg]), DRAFTS), /atlantis/);
});

test('F8c: an attraction as an overnight stop throws', () => {
  const pkg = testPackage('test_sleep_at_mp', [
    st('t_lima_in', 'lima', 1, 1),
    st('t_cusco', 'cusco', 2, 2),
    st('t_olly', 'ollantaytambo', 0, 0),
    st('t_aguas', 'aguas_calientes', 0, 0),
    st('t_mp', 'machu_picchu', 1, 1),
    st('t_aguas_back', 'aguas_calientes', 0, 0),
    st('t_olly_back', 'ollantaytambo', 0, 0),
    st('t_cusco_back', 'cusco', 0, 0),
    st('t_lima_out', 'lima', 1, 1)
  ]);
  assert.throws(() => buildSkeletonTrip(spec(PERU, 12), withPackages([pkg]), DRAFTS), /machu_picchu/);
});

test('F8d: a pass-through that would need a night is route_not_supported', () => {
  const pkg = testPackage('test_lima_pass_through', [
    st('ph_lima_in', 'lima', 1, 2),
    st('ph_huaraz', 'huaraz', 2, 4),
    st('ph_lima_mid', 'lima', 0, 0),
    st('ph_cusco', 'cusco', 2, 4),
    st('ph_sacred_valley', 'ollantaytambo', 0, 1),
    st('ph_aguas', 'aguas_calientes', 1, 2, [MP_EXCURSION]),
    st('ph_olly_return', 'ollantaytambo', 0, 0),
    st('ph_cusco_return', 'cusco', 0, 0),
    st('ph_lima_out', 'lima', 1, 1)
  ]);
  const r = buildSkeletonTrip(F.F4, withPackages([pkg]), DRAFTS);
  assert.equal(r.ok, false);
  assert.equal(r.state, 'route_not_supported');
  assert.equal(r.detail.reason, 'pass_through_requires_overnight');
  assert.equal(r.detail.stopId, 'ph_lima_mid');
});

test('F9: Ljubljana is not covered', () => {
  const r = buildSkeletonTrip(F.F9, PILOT_DATA, DRAFTS);
  assert.equal(r.ok, false);
  assert.equal(r.state, 'destination_not_covered');
  assert.ok(r.options.some((o) => o.action === 'capture_interest'));
});

test('destination and origin edge cases', () => {
  const unknownPlace = buildSkeletonTrip(spec({ kind: 'place', id: 'narnia' }, 7), PILOT_DATA, DRAFTS);
  assert.equal(unknownPlace.state, 'destination_not_covered');
  assert.equal(unknownPlace.detail.reason, 'place_unknown');
  const unknownOrigin = buildSkeletonTrip({ ...F.F1, originPlaceId: 'narnia' }, PILOT_DATA, DRAFTS);
  assert.equal(unknownOrigin.state, 'route_not_supported');
  assert.equal(unknownOrigin.detail.reason, 'origin_unknown');
  const mixed = buildSkeletonTrip(spec(PERU, 10, ['tokyo']), PILOT_DATA, DRAFTS);
  assert.equal(mixed.state, 'route_not_supported');
  assert.ok(mixed.options.some((o) => o.routePackageId === 'tokyo_city'));
});

test('extra nights beyond every package max add a warning, never padding or shortening', () => {
  const trip = assertTrip(buildSkeletonTrip(spec({ kind: 'place', id: 'new_york' }, 14), PILOT_DATA, DRAFTS));
  assert.deepEqual(nightsOf(trip), { nyc_base: 13 });
  assert.deepEqual(trip.warnings, ['nights_above_package_max']);
  assert.equal(trip.days.length, 14);
});

test('F10: determinism and JSON round-trip', () => {
  const a = buildSkeletonTrip(F.F2, PILOT_DATA, DRAFTS);
  const b = buildSkeletonTrip(F.F2, PILOT_DATA, DRAFTS);
  assert.deepStrictEqual(a, b);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(a)), a);
  const c = buildSkeletonTrip(F.F4, PILOT_DATA, DRAFTS);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(c)), c);
});

test('F11: every C4 invariant holds for all successful fixtures (validateSkeleton run explicitly)', () => {
  const successes = [F.F1, F.F2, F.F4, F.F6, spec({ kind: 'place', id: 'new_york' }, 14)];
  for (const s of successes) {
    const trip = assertTrip(buildSkeletonTrip(s, PILOT_DATA, DRAFTS));
    const routes = selectRoutes(s, PILOT_DATA, DRAFTS);
    const best = routes.value.find((r) => r.routePackageId === trip.spec.routeTemplateId);
    const scheduled = scheduleRoute(best, s, PILOT_DATA);
    assert.equal(scheduled.ok, true);
    assert.deepStrictEqual(scheduled.value.days, trip.days);
    const v = validateSkeleton(scheduled.value, best, s, PILOT_DATA, DRAFTS);
    assert.equal(v.ok, true);
    assert.equal(v.value.status, 'valid'); // 72eb2d7: all connections reviewed → 'valid'
    assert.equal(v.value.contentStatus, 'not_filled');
    // 72eb2d7: reviewed data now passes strict validation too (the refusal path is covered by F7).
    assert.equal(validateSkeleton(scheduled.value, best, s, PILOT_DATA, { reviewPolicy: 'strict' }).ok, true);

    // Spot-check invariants directly on the Trip.
    assert.deepEqual(trip.days.map((d) => d.dayNumber), Array.from({ length: s.totalDays }, (_, i) => i + 1));
    for (const d of trip.days) {
      for (const b of d.blocks) {
        // 72eb2d7: reviewed connections → provenance.reviewed true.
        assert.deepEqual(b.provenance, { source: 'curated', reviewed: true, confidence: 'medium' });
        assert.equal(b.generationStatus, 'ok');
        assert.equal(b.userEdited, false);
        assert.equal(b.locked, false);
        if (b.type === 'open') assert.ok(b.durationHours >= 1.5, `${b.id} is ${b.durationHours}h`);
      }
    }
  }
});

test('validateSkeleton throws on a tampered skeleton', () => {
  const s = F.F1;
  const [best] = selectRoutes(s, PILOT_DATA, DRAFTS).value;
  const scheduled = scheduleRoute(best, s, PILOT_DATA).value;

  const missingDay = { ...scheduled, days: scheduled.days.slice(0, -1) };
  assert.throws(() => validateSkeleton(missingDay, best, s, PILOT_DATA, DRAFTS), /expected 7 days/);

  const shortOpen = structuredClone(scheduled);
  shortOpen.days[2].blocks[0].durationHours = 1;
  assert.throws(() => validateSkeleton(shortOpen, best, s, PILOT_DATA, DRAFTS), /shorter than/);

  const overlap = structuredClone(scheduled);
  overlap.days[6].blocks.unshift({ ...overlap.days[5].blocks[0], id: 'op:fake', startTime: '08:00' });
  assert.throws(() => validateSkeleton(overlap, best, s, PILOT_DATA, DRAFTS), /overlaps|precedes/);

  const wrongNights = structuredClone(scheduled);
  wrongNights.stops[0].nights = 5;
  assert.throws(() => validateSkeleton(wrongNights, best, s, PILOT_DATA, DRAFTS), /nights/);
});

test('trip shape: id, versions, spec stops', () => {
  const trip = assertTrip(buildSkeletonTrip(F.F2, PILOT_DATA, DRAFTS));
  assert.equal(trip.id, 'door2:vancouver:PE:10:peru_classic');
  assert.deepEqual(trip.versions, {
    engine: 'door2-skeleton-0.1',
    schema: 'door2-v5',
    content: 'none',
    routeData: 'pilot-catalogue-v2',
    bufferRuleset: 'buffer_ruleset_v2@2'
  });
  assert.deepEqual(trip.history, []);
  assert.ok(trip.spec.stops.every((s) => s.placeSource === 'recommendation'));
  // Block ids are unique.
  const ids = trip.days.flatMap((d) => d.blocks.map((b) => b.id));
  assert.equal(new Set(ids).size, ids.length);
  // Open blocks never precede a departure on the same day at the same place.
  for (const d of trip.days) {
    for (const t of d.blocks.filter((b) => b.id.startsWith('tr:'))) {
      assert.equal(d.blocks.some((b) => b.type === 'open' && b.placeId === t.placeId && b.startTime < t.startTime), false);
    }
  }
  assert.equal(endClock(blockById(trip, 'ex:pc_aguas:machu_picchu:back')), '19:21'); // 72eb2d7: train −15 min
});
