import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_BUFFER_RULESET,
  computeElapsedTravelHours,
  computeUsableTimeLost,
  orientConnection
} from '../../src/lib/door2/bufferRuleset.js';
import { formatClock, isOvernightBlock } from '../../src/lib/door2/calendarConvention.js';
import { FAILURE_STATES, DEFAULT_MESSAGES, makeFailure, makeSuccess } from '../../src/lib/door2/failureStates.js';
import { assertConnectionPlacesResolve, assertPlaceCanBeOvernightBase } from '../../src/lib/door2/placeIntegrity.js';
import { PILOT_CONNECTIONS, PILOT_PLACES, PILOT_ROUTE_PACKAGES } from '../../src/lib/door2/pilotData.js';

const conn = (id) => PILOT_CONNECTIONS.find((c) => c.id === id);

// 72eb2d7: conn_yvr_lim_air layoverHours 1.5 → 2.0, so usable time lost 17.45 → 17.95.
test('computeUsableTimeLost(conn_yvr_lim_air) === 17.95 (brief: 15.75, see pilotData.js header)', () => {
  assert.ok(Math.abs(computeUsableTimeLost(conn('conn_yvr_lim_air')) - 17.95) < 1e-9);
});

test('computeUsableTimeLost for NYC and Tokyo rows', () => {
  assert.equal(computeUsableTimeLost(conn('conn_yvr_nyc_air')), 10.25);
  assert.ok(Math.abs(computeUsableTimeLost(conn('conn_yvr_tokyo_air_nrt')) - 15.35) < 1e-9);
});

test('computeUsableTimeLost falls back to the default local transfer and rejects unknown modes', () => {
  const row = { id: 'x', mode: 'train', inVehicleHours: 2 };
  assert.equal(computeUsableTimeLost(row), 2 + 0.5 + 0.25 + 0.5 + 0.5);
  assert.throws(() => computeUsableTimeLost({ ...row, mode: 'teleport' }), /teleport/);
});

test('computeElapsedTravelHours sums segments plus layover', () => {
  assert.equal(computeElapsedTravelHours({ inVehicleHours: 3 }), 3);
  assert.equal(computeElapsedTravelHours({ inVehicleHours: 99, segments: [{ inVehicleHours: 1 }, { inVehicleHours: 2 }], layoverHours: 0.5 }), 3.5);
});

test('orientConnection reverses localTransferHours (lima -> vancouver gives origin 0.75, destination 0.5)', () => {
  const row = conn('conn_yvr_lim_air');
  const reversed = orientConnection(row, 'lima', 'vancouver');
  assert.equal(reversed.fromPlaceId, 'lima');
  assert.equal(reversed.toPlaceId, 'vancouver');
  assert.deepEqual(reversed.localTransferHours, { origin: 0.75, destination: 0.5 });
  // Never mutates the catalogue row.
  assert.equal(row.fromPlaceId, 'vancouver');
  assert.deepEqual(row.localTransferHours, { origin: 0.5, destination: 0.75 });
});

test('orientConnection forward copy, oneway rows and unrelated places', () => {
  const row = conn('conn_lim_cuz_air');
  const forward = orientConnection(row, 'lima', 'cusco');
  assert.notEqual(forward, row);
  assert.deepEqual(forward, row);
  assert.equal(orientConnection({ ...row, direction: 'oneway' }, 'cusco', 'lima'), null);
  assert.equal(orientConnection(row, 'lima', 'tokyo'), null);
});

test('DEFAULT_BUFFER_RULESET is buffer_ruleset_v2', () => {
  assert.equal(DEFAULT_BUFFER_RULESET.id, 'buffer_ruleset_v2');
  assert.deepEqual(DEFAULT_BUFFER_RULESET.modes.flight_international, { preHours: 2.5, postHours: 1.0 });
});

test('isOvernightBlock', () => {
  assert.equal(isOvernightBlock({ startHourOfDay: 23, durationHours: 3 }), true);
  assert.equal(isOvernightBlock({ startHourOfDay: 9, durationHours: 15.75 }), false);
  assert.equal(isOvernightBlock({ startHourOfDay: 1, durationHours: 1 }), true);
  assert.equal(isOvernightBlock({ startHourOfDay: 2, durationHours: 23.9 }), false);
  assert.equal(isOvernightBlock({ startHourOfDay: 11, durationHours: 15.75 }), true);
});

test('formatClock rounds to the nearest minute', () => {
  assert.equal(formatClock(9), '09:00');
  assert.equal(formatClock(22.75), '22:45');
  assert.equal(formatClock(16.35), '16:21');
  assert.equal(formatClock(23.999), '00:00');
});

test('makeFailure / makeSuccess', () => {
  const f = makeFailure(FAILURE_STATES.DURATION_TOO_SHORT, [{ action: 'extend', days: 2, detail: '+2 days' }], { detail: { minDays: 7 } });
  assert.deepEqual(f, {
    ok: false,
    state: 'duration_too_short',
    message: DEFAULT_MESSAGES.duration_too_short,
    options: [{ action: 'extend', days: 2, detail: '+2 days' }],
    detail: { minDays: 7 }
  });
  assert.throws(() => makeFailure('nope', [{ action: 'x', detail: 'y' }]), /unknown failure state/);
  assert.throws(() => makeFailure(FAILURE_STATES.ROUTE_NOT_SUPPORTED, []), /at least one option/);
  assert.throws(() => makeFailure(FAILURE_STATES.ROUTE_NOT_SUPPORTED), /at least one option/);
  assert.deepEqual(makeSuccess(3), { ok: true, value: 3 });
  for (const state of Object.values(FAILURE_STATES)) assert.equal(typeof DEFAULT_MESSAGES[state], 'string');
});

test('placeIntegrity throws, naming the offending id', () => {
  assert.throws(
    () => assertConnectionPlacesResolve({ id: 'c1', fromPlaceId: 'lima', toPlaceId: 'atlantis' }, PILOT_PLACES),
    /atlantis/
  );
  assert.throws(
    () => assertConnectionPlacesResolve({ id: 'c1', fromPlaceId: 'atlantis', toPlaceId: 'lima' }, new Map(Object.entries(PILOT_PLACES))),
    /atlantis/
  );
  assert.equal(assertConnectionPlacesResolve(conn('conn_lim_cuz_air'), PILOT_PLACES), undefined);
  assert.throws(() => assertPlaceCanBeOvernightBase(PILOT_PLACES.machu_picchu), /machu_picchu/);
  assert.equal(assertPlaceCanBeOvernightBase(PILOT_PLACES.cusco), undefined);
});

// 72eb2d7: every connection row now carries reviewedBy/reviewedAt '2026-09-23' and version 3.
test('pilot data: every connection is reviewed and resolves; package placeIds are derived', () => {
  assert.equal(PILOT_CONNECTIONS.length, 8);
  for (const c of PILOT_CONNECTIONS) {
    assert.equal(typeof c.reviewedBy, 'string');
    assert.ok(c.reviewedBy.length > 0);
    assert.equal(c.reviewedAt, '2026-09-23');
    assert.equal(c.version, 3);
    assert.equal(c.direction, 'bidirectional');
    assertConnectionPlacesResolve(c, PILOT_PLACES);
    if (c.segments) {
      assert.equal(c.segments.reduce((s, x) => s + x.inVehicleHours, 0), c.inVehicleHours);
    }
  }
  const pc = PILOT_ROUTE_PACKAGES.find((p) => p.id === 'peru_classic');
  assert.deepEqual(pc.placeIds, ['lima', 'cusco', 'ollantaytambo', 'aguas_calientes', 'machu_picchu']);
  for (const p of PILOT_ROUTE_PACKAGES) assert.equal(p.reviewed, false);
});
