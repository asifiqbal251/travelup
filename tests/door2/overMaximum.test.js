import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { PILOT_ROUTE_FAMILIES } from '../../src/lib/door2/pilotData.js';
import * as R from '../../src/lib/door2/restructure.js';
import { buildRouteResult } from '../../src/lib/door2/route.js';
import { PILOT_DATA, buildFilledTrip, findRoutePackage } from '../../src/lib/door2/planner.js';
import { scheduleRoute } from '../../src/lib/door2/schedule.js';
import { validateExcursionSelections } from '../../src/lib/door2/validate.js';

// EF1: a stop the scheduler stretched past its authored maximum (a trip longer
// than the route's maxDays) must refuse or propose, never throw. The rule: an
// existing over-maximum allocation may be kept and may be reduced; no preview
// raises a stop above its authored maximum; the minimum is still a hard floor.

const JP = { kind: 'country', id: 'JP' };
const NY = { kind: 'place', id: 'new_york' };
const PE = { kind: 'country', id: 'PE' };
const FIXED = { startDate: '2026-10-01', endDate: '2026-10-30' };

const spec = (destination, totalDays, extra = {}) => ({
  originPlaceId: 'vancouver',
  destination,
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

function build(destination, totalDays, routeTemplateId, extra = {}) {
  const trip = buildFilledTrip(spec(destination, totalDays, { routeTemplateId, ...extra }), PILOT_DATA, { reviewPolicy: 'allow_drafts' });
  assert.ok(trip.routePlan, `built ${routeTemplateId}/${totalDays}: ${JSON.stringify(trip.detail ?? trip.state)}`);
  return trip;
}

const nightsOf = (trip) => Object.fromEntries(trip.routePlan.stops.map((s) => [s.key, s.nights]));
const planStop = (trip, key) => trip.routePlan.stops.find((s) => s.key === key);
const overMax = (trip) => trip.routePlan.stops.filter((s) => s.nights > s.maxNights).map((s) => s.key);

/** Every stretched trip the tests walk. Each has at least one stop above its authored maximum. */
function stretchedTrips() {
  return {
    'Japan 14 (Tokyo only)': build(JP, 14, 'tokyo_city'),
    'Japan 14 (Tokyo only, fixed dates)': build(JP, 14, 'tokyo_city', FIXED),
    'Japan 24 (Tokyo with Kyoto)': build(JP, 24, 'tokyo_city+kyoto@after_tokyo'),
    'New York 14': build(NY, 14, 'nyc_city'),
    'New York 16 (fixed dates)': build(NY, 16, 'nyc_city', FIXED),
    'Peru 15': build(PE, 15, 'peru_classic'),
    'Peru 25': build(PE, 25, 'peru_classic'),
    'Peru 25 (fixed dates)': build(PE, 25, 'peru_classic', FIXED),
    'Peru 25 with Huaraz first': build(PE, 25, 'peru_classic+huaraz@after_lima_in'),
    'Peru 25 with Huaraz last': build(PE, 25, 'peru_classic+huaraz@after_machu_picchu')
  };
}

/**
 * Every traveller-reachable preview on `trip`, as [label, thunk] pairs: ±1 night
 * on each stop, the day-trip menu and every add/remove on it, three lengths, and
 * every optional add/remove/move plus the move list.
 */
function everyPreview(trip) {
  const rp = trip.routePlan;
  const N = trip.spec.totalDays;
  const calls = [];
  for (const s of rp.stops) {
    calls.push([`adjust ${s.key} -1`, () => R.previewAdjustNights(trip, s.key, -1)]);
    calls.push([`adjust ${s.key} +1`, () => R.previewAdjustNights(trip, s.key, +1)]);
    calls.push([`menu ${s.key}`, () => R.listExcursionMenu(trip, s.key)]);
    let menu = [];
    try {
      menu = R.listExcursionMenu(trip, s.key);
    } catch {
      // The menu call above records the throw.
    }
    for (const m of menu) {
      calls.push([`add excursion ${s.key}/${m.excursionId}`, () => R.previewAddExcursion(trip, s.key, m.excursionId)]);
      if (m.selected) calls.push([`remove excursion ${s.key}/${m.excursionId}`, () => R.previewRemoveExcursion(trip, s.key, m.excursionId)]);
    }
  }
  const lengths = new Set([N - 1, N + 1, rp.minDays - 1].filter((n) => n >= 1 && n !== N));
  for (const n of lengths) calls.push([`length ${N} -> ${n}`, () => R.previewChangeLength(trip, n)]);
  const family = PILOT_ROUTE_FAMILIES.find((f) => f.id === rp.familyId);
  for (const opt of family.optional ?? []) {
    const included = rp.optionals.find((o) => o.optionalId === opt.id);
    if (!included) {
      for (const pos of opt.positions) calls.push([`add optional ${opt.id}@${pos.id}`, () => R.previewAddOptional(trip, opt.id, pos.id)]);
      continue;
    }
    calls.push([`remove optional ${opt.id}`, () => R.previewRemoveOptional(trip, opt.id)]);
    calls.push([`move list ${opt.id}`, () => R.listMoveOptions(trip, opt.id)]);
    for (const pos of opt.positions) {
      if (pos.id !== included.positionId) calls.push([`move optional ${opt.id}@${pos.id}`, () => R.previewMoveOptional(trip, opt.id, pos.id)]);
    }
  }
  return calls;
}

/** Runs every preview; returns the throws and every proposal built (alternatives and move options included). */
function runAll(trip) {
  const throws = [];
  const proposals = [];
  for (const [label, run] of everyPreview(trip)) {
    let r;
    try {
      r = run();
    } catch (err) {
      throws.push(`${label}: ${err.message}`);
      continue;
    }
    for (const p of r?.proposals ?? []) proposals.push({ label, p });
    for (const p of r?.alternatives ?? []) proposals.push({ label: `${label} (alternative)`, p });
    for (const o of r?.options ?? []) proposals.push({ label: `${label} (option ${o.positionId})`, p: o.proposal });
  }
  return { throws, proposals };
}

// ---------------------------------------------------------------------------

test('EF1-T1: Japan 14 days, Tokyo at 12 nights (max 10): "Less time here" returns, never throws', () => {
  const trip = build(JP, 14, 'tokyo_city');
  assert.deepEqual(nightsOf(trip), { tokyo_base: 12 }, 'the scheduler stretched Tokyo past its maximum');
  assert.equal(planStop(trip, 'tokyo_base').maxNights, 10);

  // Flexible dates: one stop, so no one to give the night to; the only answer is a shorter trip.
  let r;
  assert.doesNotThrow(() => {
    r = R.previewAdjustNights(trip, 'tokyo_base', -1);
  }, '−1 on an over-maximum stop threw');
  assert.equal(r.ok, true, JSON.stringify(r).slice(0, 300));
  assert.deepEqual(r.proposals.map((p) => p.id), ['nights:tokyo_base:-1:shorten']);
  const [p] = r.proposals;
  assert.equal(p.label, 'Shorten the trip by a day');
  assert.deepEqual(nightsOf(p.trip), { tokyo_base: 11 }, 'kept above the maximum, one night less');
  assert.equal(p.trip.spec.totalDays, 13);
  assert.equal(p.trip.days.length, 13);
  assert.deepEqual(p.diff.nights, [{ stopKey: 'tokyo_base', placeId: 'tokyo', from: 12, to: 11 }]);
  assert.deepEqual(p.trip.warnings.filter((w) => w === 'nights_above_package_max'), ['nights_above_package_max'], 'still stretched, still says so');
  const applied = R.applyProposal(trip, p);
  assert.equal(applied.ok, true);

  // Fixed dates: nothing can take the night and the length can't change, so a clean refusal.
  const fixed = build(JP, 14, 'tokyo_city', FIXED);
  let rf;
  assert.doesNotThrow(() => {
    rf = R.previewAdjustNights(fixed, 'tokyo_base', -1);
  }, '−1 on an over-maximum stop threw (fixed dates)');
  assert.deepEqual(rf, {
    ok: false,
    reason: 'change_not_feasible',
    why: 'no_donor',
    message: 'Every other stop is already at its longest, and your trip dates are fixed.',
    alternatives: []
  });
});

test('EF1-T2: Japan 14 days: adding the 4-hour Nikko day trip succeeds (the false refusal is gone)', () => {
  const trip = build(JP, 14, 'tokyo_city');
  let r;
  assert.doesNotThrow(() => {
    r = R.previewAddExcursion(trip, 'tokyo_base', 'nikko');
  }, 'adding a day trip on a stretched trip threw');
  assert.equal(r.ok, true, JSON.stringify(r).slice(0, 300));
  const [p] = r.proposals;
  assert.equal(p.id, 'excursion:add:tokyo_base:nikko');
  assert.equal(p.label, 'Add a day trip to Nikko');
  assert.deepEqual(nightsOf(p.trip), { tokyo_base: 12 }, 'nights unchanged');
  assert.equal(p.trip.spec.totalDays, 14, 'length unchanged');
  assert.deepEqual(planStop(p.trip, 'tokyo_base').selectedExcursionIds, ['nikko']);
  assert.ok(p.trip.days.some((d) => d.blocks.some((b) => b.id === 'ex:tokyo_base:nikko:site')), 'the day trip is on the calendar');
  assert.doesNotThrow(() => validateExcursionSelections(p.trip, PILOT_DATA));
  assert.ok(p.trip.warnings.includes('nights_above_package_max'), 'still stretched, still says so');

  // Applied, the stretched trip with Nikko keeps working: Kamakura adds too, and −1 still returns.
  const withNikko = R.applyProposal(trip, p).trip;
  const k = R.previewAddExcursion(withNikko, 'tokyo_base', 'kamakura');
  assert.equal(k.ok, true, JSON.stringify(k).slice(0, 300));
  assert.doesNotThrow(() => validateExcursionSelections(k.proposals[0].trip, PILOT_DATA));
  assert.equal(R.previewAdjustNights(withNikko, 'tokyo_base', -1).ok, true);
});

test('EF1-T3: every preview and listExcursionMenu returns on stretched Japan, New York and Peru trips', () => {
  const failures = [];
  for (const [name, trip] of Object.entries(stretchedTrips())) {
    assert.ok(overMax(trip).length > 0, `${name} is not stretched: ${JSON.stringify(nightsOf(trip))}`);
    const { throws, proposals } = runAll(trip);
    failures.push(...throws.map((t) => `${name}: ${t}`));
    // One step further: apply each proposal that still leaves the trip stretched, and try again.
    for (const { label, p } of proposals.filter(({ p }) => overMax(p.trip).length > 0).slice(0, 6)) {
      const next = R.applyProposal(trip, p);
      assert.equal(next.ok, true, `${name}: apply ${label}`);
      failures.push(...runAll(next.trip).throws.map((t) => `${name} after "${label}": ${t}`));
    }
  }
  assert.deepEqual(failures, [], `previews threw:\n${failures.slice(0, 15).join('\n')}`);
});

test('EF1-T4: no proposal raises a stop above max(authored maximum, its nights before); "More time here" at the maximum still refuses', () => {
  const violations = [];
  let checked = 0;
  for (const [name, trip] of Object.entries(stretchedTrips())) {
    const before = nightsOf(trip);
    for (const { label, p } of runAll(trip).proposals) {
      for (const s of p.trip.routePlan.stops) {
        checked += 1;
        const ceiling = Math.max(s.maxNights, before[s.key] ?? -Infinity);
        if (s.nights > ceiling) violations.push(`${name} / ${label}: ${s.key} ${s.nights} > ${ceiling} (max ${s.maxNights}, before ${before[s.key]})`);
      }
    }
  }
  assert.ok(checked > 200, `only ${checked} stops checked`);
  assert.deepEqual(violations, [], violations.slice(0, 10).join('\n'));

  // Today's wording, unchanged, at and above the maximum.
  const tokyo = build(JP, 14, 'tokyo_city');
  assert.deepEqual(R.previewAdjustNights(tokyo, 'tokyo_base', +1), {
    ok: false,
    reason: 'change_not_feasible',
    why: 'allocation_maximum',
    message: '10 nights is the most that works in Tokyo.',
    alternatives: []
  });
  const ny = R.previewAdjustNights(build(NY, 14, 'nyc_city'), 'nyc_base', +1);
  assert.equal(ny.why, 'allocation_maximum');
  assert.equal(ny.message, '10 nights is the most that works in New York.');
  const peru = build(PE, 15, 'peru_classic');
  assert.deepEqual(nightsOf(peru).pc_cusco, 4, 'Cusco sits exactly at its maximum');
  const cusco = R.previewAdjustNights(peru, 'pc_cusco', +1);
  assert.equal(cusco.why, 'allocation_maximum');
  assert.equal(cusco.message, '4 nights is the most that works in Cusco.');
});

test('EF1-T4b: a stop that was within its maximum never ends above the new variant\'s maximum', () => {
  // Peru 13: Lima-in at 3 (its backbone maximum). "Huaraz first" caps Lima-in at 2.
  const trip = build(PE, 13, 'peru_classic');
  assert.equal(nightsOf(trip).pc_lima_in, 3);
  const r = R.previewAddOptional(trip, 'huaraz', 'after_lima_in');
  const proposals = [...(r.proposals ?? []), ...(r.alternatives ?? [])];
  assert.ok(proposals.length > 0, JSON.stringify(r).slice(0, 300));
  for (const p of proposals) {
    for (const s of p.trip.routePlan.stops) {
      assert.ok(s.nights <= s.maxNights, `${p.id}: ${s.key} ${s.nights} above its maximum ${s.maxNights}`);
    }
  }
  // And on every stretched trip: a stop not above its maximum before is not above it after.
  const violations = [];
  for (const [name, t] of Object.entries(stretchedTrips())) {
    const within = new Set(t.routePlan.stops.filter((s) => s.nights <= s.maxNights).map((s) => s.key));
    for (const { label, p } of runAll(t).proposals) {
      for (const s of p.trip.routePlan.stops) {
        if ((within.has(s.key) || !t.routePlan.stops.some((o) => o.key === s.key)) && s.nights > s.maxNights) {
          violations.push(`${name} / ${label}: ${s.key} ${s.nights} > ${s.maxNights}`);
        }
      }
    }
  }
  assert.deepEqual(violations, [], violations.slice(0, 10).join('\n'));
});

test('EF1-T5: the floor is untouched: a day trip still holds its night, and nothing goes below a minimum', () => {
  // A stretched Tokyo + Kyoto trip; Nara and Osaka together need a second full day in Kyoto.
  let trip = build(JP, 24, 'tokyo_city+kyoto@after_tokyo');
  assert.ok(overMax(trip).includes('tokyo_base'), JSON.stringify(nightsOf(trip)));
  for (const id of ['nara', 'osaka']) {
    const r = R.previewAddExcursion(trip, 'kyo_base', id);
    assert.equal(r.ok, true, `add ${id}: ${JSON.stringify(r).slice(0, 300)}`);
    trip = R.applyProposal(trip, r.proposals[0]).trip;
  }
  const kyoto = planStop(trip, 'kyo_base');
  // Walk Kyoto down to its effective minimum through the public previews.
  while (planStop(trip, 'kyo_base').nights > kyoto.minNights) {
    const r = R.previewAdjustNights(trip, 'kyo_base', -1);
    assert.equal(r.ok, true, JSON.stringify(r).slice(0, 300));
    trip = R.applyProposal(trip, r.proposals[0]).trip;
  }
  assert.ok(overMax(trip).includes('tokyo_base'), 'Tokyo is still stretched');
  assert.ok(kyoto.minNights > 2, `Nara + Osaka raise Kyoto's minimum above the authored 2 (got ${kyoto.minNights})`);
  const r = R.previewAdjustNights(trip, 'kyo_base', -1);
  assert.equal(r.ok, false);
  assert.equal(r.why, 'excursion_does_not_fit');
  assert.equal(r.message, `Kyoto needs ${kyoto.minNights} nights to keep your day trip to Nara and Osaka.`);
  assert.deepEqual(r.detail, { stopKey: 'kyo_base', excursionIds: ['nara', 'osaka'], nightsNeeded: kyoto.minNights });

  // No proposal on any stretched trip goes below a stop's (effective) minimum.
  const violations = [];
  for (const [name, t] of Object.entries({ ...stretchedTrips(), 'Japan 24 with Nara and Osaka': trip })) {
    for (const { label, p } of runAll(t).proposals) {
      for (const s of p.trip.routePlan.stops) if (s.nights < s.minNights) violations.push(`${name} / ${label}: ${s.key} ${s.nights} < ${s.minNights}`);
    }
  }
  assert.deepEqual(violations, [], violations.slice(0, 10).join('\n'));

  // The scheduler itself: above the maximum is accepted when the sum holds; below the minimum still throws.
  const tokyo = build(JP, 14, 'tokyo_city');
  const pkg = findRoutePackage(PILOT_DATA, 'tokyo_city');
  const { routeResult } = buildRouteResult(pkg, tokyo.spec, PILOT_DATA);
  assert.equal(scheduleRoute(routeResult, { ...tokyo.spec, totalDays: 14 }, PILOT_DATA, { nightsOverride: { tokyo_base: 12 } }).ok, true);
  assert.throws(
    () => scheduleRoute(routeResult, { ...tokyo.spec, totalDays: 4 }, PILOT_DATA, { nightsOverride: { tokyo_base: 2 } }),
    /tokyo_base.*nights 2 outside 3–10/
  );
});

test('EF1-T6: every proposal on a stretched trip sums to its own length', () => {
  const violations = [];
  let checked = 0;
  for (const [name, trip] of Object.entries(stretchedTrips())) {
    for (const { label, p } of runAll(trip).proposals) {
      checked += 1;
      const rp = p.trip.routePlan;
      const sum = rp.minDays + rp.stops.reduce((acc, s) => acc + (s.nights - s.minNights), 0);
      const N = p.trip.spec.totalDays;
      if (sum !== N || p.trip.days.length !== N || p.diff.totalDays.to !== N) {
        violations.push(`${name} / ${label}: minDays ${rp.minDays} + extra = ${sum}, days ${p.trip.days.length}, totalDays ${N}`);
      }
    }
  }
  assert.ok(checked > 20, `only ${checked} proposals checked`);
  assert.deepEqual(violations, [], violations.slice(0, 10).join('\n'));
});

test('EF1-T7: both fixtures are byte-identical to their EF1 base', () => {
  const sha = (name) => createHash('sha256').update(readFileSync(new URL(`./fixtures/${name}`, import.meta.url))).digest('hex');
  assert.equal(sha('peru-pre-c3a.json'), '88ebac1796c33c0a2921ae3e93fa4c0832924b2f7fb1cc268e572925f9e91e5d');
  assert.equal(sha('pre-e3a.json'), 'f2075cc5e8d6ead96d6514d283c97c2ee36cfc677b6d0ae6aab70011fc3f3c33');
});
