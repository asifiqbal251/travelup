import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { pinActivity, rejectActivity, swapActivity, undo } from '../../src/lib/door2/edit.js';
import { tripFingerprint } from '../../src/lib/door2/fingerprint.js';
import { PILOT_CONTENT } from '../../src/lib/door2/pilotContent.js';
import { PILOT_DATA, buildFilledTrip, buildSkeletonTrip, buildTripFromRoutePlan } from '../../src/lib/door2/planner.js';
import { applyProposal, isDurationFlexible, previewAdjustNights, previewChangeLength, reconcile } from '../../src/lib/door2/restructure.js';
import { validateFilled } from '../../src/lib/door2/validate.js';
import { selectRoutes } from '../../src/lib/door2/route.js';
import { scheduleRoute } from '../../src/lib/door2/schedule.js';
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

const PC_KEYS = ['pc_lima_in', 'pc_cusco', 'pc_sacred_valley', 'pc_aguas', 'pc_olly_return', 'pc_cusco_return', 'pc_lima_out'];
/** [lima_in, cusco, sacred_valley, aguas, lima_out] → a peru_classic RoutePlan (pass-throughs at 0). */
function pcPlan([limaIn, cusco, sv, aguas, limaOut]) {
  const nights = { pc_lima_in: limaIn, pc_cusco: cusco, pc_sacred_valley: sv, pc_aguas: aguas, pc_olly_return: 0, pc_cusco_return: 0, pc_lima_out: limaOut };
  return { variantId: 'peru_classic', stops: PC_KEYS.map((key) => ({ key, nights: nights[key] })) };
}
const homeLeg = (trip) => trip.days.flatMap((d) => d.blocks).find((b) => b.id === 'tr:pc_lima_out>origin_home');

// ---------------------------------------------------------------------------
// Step 2: nightsOverride + buildTripFromRoutePlan

// Design §1.1: totalDays = minDays(8) + Σ(nights − min). Each row lands home on the predicted day.
const ALLOCATIONS = [
  [[2, 3, 0, 1, 1], 10],
  [[1, 4, 0, 1, 1], 10],
  [[3, 2, 0, 1, 1], 10],
  [[1, 3, 0, 2, 1], 10],
  [[1, 3, 1, 1, 1], 10],
  [[2, 2, 1, 1, 1], 10],
  [[3, 4, 1, 2, 1], 14]
];

test('R2.1: every §1.1 allocation lands home on the predicted day', () => {
  for (const [alloc, predicted] of ALLOCATIONS) {
    const trip = buildTripFromRoutePlan(spec(PERU, predicted), pcPlan(alloc), PILOT_DATA, DRAFTS);
    assert.notEqual(trip.ok, false, `${alloc}: ${JSON.stringify(trip)}`);
    assert.equal(trip.days.length, predicted);
    assert.equal(homeLeg(trip).transport.arriveDayNumber, predicted, `${alloc}`);
    const nights = Object.fromEntries(trip.spec.stops.map((s) => [s.id, s.nights]));
    assert.deepEqual(PC_KEYS.map((k) => nights[k]), [alloc[0], alloc[1], alloc[2], alloc[3], 0, 0, alloc[4]]);
  }
});

test('R2.2: the round-robin allocation through buildTripFromRoutePlan equals buildSkeletonTrip exactly', () => {
  for (let n = 8; n <= 14; n++) {
    const s = spec(PERU, n);
    const auto = buildSkeletonTrip(s, PILOT_DATA, DRAFTS);
    const plan = { variantId: 'peru_classic', stops: auto.spec.stops.map((x) => ({ key: x.id, nights: x.nights })) };
    assert.deepStrictEqual(buildTripFromRoutePlan(s, plan, PILOT_DATA, DRAFTS), auto, `${n} days`);
  }
  // The Huaraz variant, also reachable by its alias.
  const s = spec(PERU, 12, ['huaraz']);
  const auto = buildSkeletonTrip(s, PILOT_DATA, DRAFTS);
  const plan = { variantId: 'peru_classic_huaraz', stops: auto.spec.stops.map((x) => ({ key: x.id, nights: x.nights })) };
  assert.deepStrictEqual(buildTripFromRoutePlan(s, plan, PILOT_DATA, DRAFTS), auto);
});

test('R2.3: an invalid allocation throws (below min, above max, wrong sum, missing or unknown stop)', () => {
  const s10 = spec(PERU, 10);
  const [best] = selectRoutes(s10, PILOT_DATA, DRAFTS).value;
  const override = (alloc) => Object.fromEntries(pcPlan(alloc).stops.map((x) => [x.key, x.nights]));
  // Sanity: a valid override schedules.
  assert.equal(scheduleRoute(best, s10, PILOT_DATA, { nightsOverride: override([2, 3, 0, 1, 1]) }).ok, true);
  assert.throws(() => scheduleRoute(best, s10, PILOT_DATA, { nightsOverride: override([3, 1, 0, 1, 1]) }), /pc_cusco.*outside 2–4/);
  assert.throws(() => scheduleRoute(best, s10, PILOT_DATA, { nightsOverride: override([1, 2, 0, 3, 1]) }), /pc_aguas.*outside 1–2/);
  assert.throws(() => scheduleRoute(best, spec(PERU, 11), PILOT_DATA, { nightsOverride: override([2, 3, 0, 1, 1]) }), /expected totalDays 11/);
  const missing = override([2, 3, 0, 1, 1]);
  delete missing.pc_lima_out;
  assert.throws(() => scheduleRoute(best, s10, PILOT_DATA, { nightsOverride: missing }), /pc_lima_out/);
  assert.throws(() => scheduleRoute(best, s10, PILOT_DATA, { nightsOverride: { ...override([2, 3, 0, 1, 1]), pc_nowhere: 0 } }), /unknown stop/);
  // Through the planner: the same checks throw (engine bug), never a traveller failure.
  assert.throws(() => buildTripFromRoutePlan(s10, pcPlan([1, 1, 0, 1, 1]), PILOT_DATA, DRAFTS), /outside/);
  assert.throws(() => buildTripFromRoutePlan(s10, { variantId: 'nope', stops: [] }, PILOT_DATA, DRAFTS), /unknown variant/);
  assert.throws(
    () => buildTripFromRoutePlan(s10, { variantId: 'peru_classic', stops: [{ key: 'pc_cusco', nights: 3 }] }, PILOT_DATA, DRAFTS),
    /do not match/
  );
});

test('R2.4: buildTripFromRoutePlan builds a held variant (engine only) and applies review policy', () => {
  const held = {
    variantId: 'peru_classic+huaraz@after_machu_picchu',
    stops: ['pc_lima_in', 'pc_cusco', 'pc_sacred_valley', 'pc_aguas', 'pc_olly_return', 'pc_cusco_return', 'pc_lima_out', 'pc_huaraz', 'pc_lima_hub'].map(
      (key) => ({ key, nights: { pc_lima_in: 1, pc_cusco: 2, pc_aguas: 1, pc_lima_out: 1, pc_huaraz: 2, pc_lima_hub: 1 }[key] ?? 0 })
    )
  };
  const trip = buildTripFromRoutePlan(spec(PERU, 11), held, PILOT_DATA);
  assert.notEqual(trip.ok, false, JSON.stringify(trip));
  assert.equal(trip.status, 'valid');
  const oneDraft = { ...PILOT_DATA, connections: PILOT_DATA.connections.map((c) => (c.id === 'conn_lim_cuz_air' ? { ...c, reviewedAt: null } : c)) };
  const refused = buildTripFromRoutePlan(spec(PERU, 10), pcPlan([2, 3, 0, 1, 1]), oneDraft);
  assert.equal(refused.state, 'connection_unreviewed');
  assert.deepEqual(refused.detail.connectionIds, ['conn_lim_cuz_air']);
});

/**
 * Step 3 added trip.routePlan and bumped versions.schema to door2-v6 on purpose. Everything else
 * must be byte-identical to the snapshot, so strip exactly those two changes (key order is kept).
 */
function asPreStep3(r) {
  if (r.ok === false) return r;
  const { routePlan, ...rest } = r;
  assert.equal(r.versions.schema, 'door2-v6');
  assert.equal(routePlan.variantId, r.spec.routeTemplateId);
  return { ...rest, versions: { ...r.versions, schema: 'door2-v5' } };
}

test('R2.5 regression: buildSkeletonTrip output is byte-identical to the pre-step-2 snapshot for every fixture', () => {
  const snapshot = JSON.parse(readFileSync(new URL('./fixtures/skeleton-pre-step2.json', import.meta.url), 'utf8'));
  let checked = 0;
  for (const [k, s] of Object.entries(SKELETON_FIXTURES)) {
    for (const policy of ['allow_drafts', 'strict']) {
      const r = asPreStep3(buildSkeletonTrip(s, PILOT_DATA, { reviewPolicy: policy }));
      const hash = createHash('sha256').update(JSON.stringify(r)).digest('hex');
      assert.equal(hash, snapshot[`${k}:${policy}`], `${k}:${policy}`);
      checked += 1;
    }
  }
  assert.equal(checked, Object.keys(snapshot).length);
});

// ---------------------------------------------------------------------------
// Step 4: fingerprint, reconcile, previews, apply

const must = (r) => {
  assert.equal(r.ok, true, JSON.stringify(r).slice(0, 300));
  return r.trip ?? r;
};
const filled = (s) => {
  const t = buildFilledTrip(s, PILOT_DATA, DRAFTS);
  assert.notEqual(t.ok, false, JSON.stringify(t));
  return t;
};
const nightsOf = (trip) => Object.fromEntries(trip.routePlan.stops.map((x) => [x.key, x.nights]));
const blockSig = (trip) => trip.days.flatMap((d) => d.blocks.map((b) => `${b.id}|${b.startTime}|${b.durationHours}`));
const contentIds = (trip) => trip.days.flatMap((d) => d.blocks.filter((b) => b.type === 'activity').map((b) => b.anchor.contentId));
const blockById = (trip, id) => trip.days.flatMap((d) => d.blocks).find((b) => b.id === id);

/** Independent re-check: rebuild the skeleton from the proposal's own RoutePlan and validateFilled against it. */
function assertProposalValid(p) {
  const skeleton = buildTripFromRoutePlan(p.trip.spec, p.trip.routePlan, PILOT_DATA, DRAFTS);
  assert.notEqual(skeleton.ok, false);
  assert.equal(validateFilled(p.trip, { ...skeleton, spec: p.trip.spec }, p.trip.spec, PILOT_CONTENT).ok, true);
  assert.equal(PILOT_DATA.routePackages.some((pkg) => pkg.id === p.trip.routePlan.variantId), true, 'never a held variant');
}

test('R4.1 fingerprint: stable, changes on any edit, restored by undo, ignores history', () => {
  const t = filled(spec(PERU, 10));
  assert.equal(tripFingerprint(t), tripFingerprint(structuredClone(t)));
  assert.match(tripFingerprint(t), /^[0-9a-f]{1,14}$/);
  const edited = must(swapActivity(t, 'op:pc_cusco:d1'));
  assert.notEqual(tripFingerprint(edited), tripFingerprint(t));
  const back = must(undo(edited));
  assert.equal(tripFingerprint(back), tripFingerprint(t));
  assert.equal(tripFingerprint({ ...t, history: [edited] }), tripFingerprint(t));
  assert.notEqual(tripFingerprint({ ...t, spec: { ...t.spec, pace: 'relaxed' } }), tripFingerprint(t));
});

test('R4.2 10-day Peru, +1 Cusco: exactly 2 proposals in order, one activity lost and one gained', () => {
  const t = filled(spec(PERU, 10));
  assert.deepEqual(nightsOf(t), { pc_lima_in: 2, pc_cusco: 3, pc_sacred_valley: 0, pc_aguas: 1, pc_olly_return: 0, pc_cusco_return: 0, pc_lima_out: 1 });
  const r = previewAdjustNights(t, 'pc_cusco', +1);
  assert.equal(r.ok, true);
  assert.deepEqual(r.proposals.map((p) => p.id), ['nights:pc_cusco:+1:from:pc_lima_in', 'nights:pc_cusco:+1:extend']);
  const [redistribute, extend] = r.proposals;
  assert.deepEqual([nightsOf(redistribute.trip).pc_cusco, nightsOf(redistribute.trip).pc_lima_in, redistribute.trip.spec.totalDays], [4, 1, 10]);
  assert.deepEqual([nightsOf(extend.trip).pc_cusco, nightsOf(extend.trip).pc_lima_in, extend.trip.spec.totalDays], [4, 2, 11]);
  assert.equal(redistribute.label, 'Take a night from Lima');
  assert.equal(extend.label, 'Add a day to the trip');

  const d = redistribute.diff;
  assert.equal(d.activitiesLost.length, 1);
  assert.equal(d.activitiesLost[0].blockId, 'op:pc_lima_in:d1');
  assert.equal(d.activitiesLost[0].contentId, blockById(t, 'op:pc_lima_in:d1').anchor.contentId);
  assert.equal(d.activitiesAdded.length, 1);
  assert.equal(d.activitiesAdded[0].blockId, 'op:pc_cusco:d3');
  assert.deepEqual(d.totalDays, { from: 10, to: 10 });
  assert.deepEqual(d.keptItemsAffected, []);
  assert.deepEqual(d.nights, [
    { stopKey: 'pc_lima_in', placeId: 'lima', from: 2, to: 1 },
    { stopKey: 'pc_cusco', placeId: 'cusco', from: 3, to: 4 }
  ]);

  // 18 of 19 skeleton blocks keep id, start and duration (design §1.2).
  const before = new Set(blockSig(t));
  const after = blockSig(redistribute.trip);
  assert.equal(after.length, 19);
  assert.equal(before.size, 19);
  assert.equal(after.filter((x) => before.has(x)).length, 18);
  for (const p of r.proposals) assertProposalValid(p);
});

test('R4.3 +1 Aguas at its maximum → allocation_maximum with a Cusco alternative', () => {
  const t = filled(spec(PERU, 12));
  assert.equal(nightsOf(t).pc_aguas, 2);
  const r = previewAdjustNights(t, 'pc_aguas', +1);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'change_not_feasible');
  assert.equal(r.why, 'allocation_maximum');
  assert.equal(r.alternatives.length, 1);
  const alt = r.alternatives[0];
  assert.equal(alt.label, 'Give the extra night to Cusco instead');
  assert.equal(nightsOf(alt.trip).pc_cusco, nightsOf(t).pc_cusco + 1);
  assert.equal(nightsOf(alt.trip).pc_aguas, 2);
  assertProposalValid(alt);
  // It is directly appliable.
  assert.equal(applyProposal(t, alt).ok, true);
});

test('R4.4 −1 Cusco at 2 nights → allocation_minimum', () => {
  const t = filled(spec(PERU, 8));
  assert.equal(nightsOf(t).pc_cusco, 2);
  const r = previewAdjustNights(t, 'pc_cusco', -1);
  assert.deepEqual([r.ok, r.reason, r.why], [false, 'change_not_feasible', 'allocation_minimum']);
  assert.deepEqual(r.alternatives, []);
});

test('R4.5 fixed dates: no "add a day"; nothing to take from → no_donor', () => {
  const fixed = { startDate: '2026-10-01', endDate: '2026-10-10' };
  assert.equal(isDurationFlexible(spec(PERU, 10)), true);
  assert.equal(isDurationFlexible(spec(PERU, 10, [], fixed)), false);
  assert.equal(isDurationFlexible(spec(PERU, 10, [], { startDate: '2026-10-01' })), false);

  const t = filled(spec(PERU, 10, [], fixed));
  const r = previewAdjustNights(t, 'pc_cusco', +1);
  assert.deepEqual(r.proposals.map((p) => p.id), ['nights:pc_cusco:+1:from:pc_lima_in']);

  const atMin = filled(spec(PERU, 8, [], fixed));
  const none = previewAdjustNights(atMin, 'pc_cusco', +1);
  assert.deepEqual([none.ok, none.why], [false, 'no_donor']);
  // Flexible and at minimum: "Add a day" is still a working option, not a refusal.
  const flexible = previewAdjustNights(filled(spec(PERU, 8)), 'pc_cusco', +1);
  assert.deepEqual(flexible.proposals.map((p) => p.id), ['nights:pc_cusco:+1:extend']);
  // Length changes need flexible dates.
  assert.equal(previewChangeLength(t, 11).why, 'duration_fixed');
});

test('R4.6 pinned items: a pinned Lima item on the removed day is listed; a pinned Cusco item survives', () => {
  let t = filled(spec(PERU, 10));
  t = must(pinActivity(t, 'op:pc_lima_in:d1'));
  t = must(pinActivity(t, 'op:pc_cusco:d1'));
  const limaItem = blockById(t, 'op:pc_lima_in:d1').anchor.contentId;
  const cuscoItem = blockById(t, 'op:pc_cusco:d1').anchor.contentId;
  const [p] = previewAdjustNights(t, 'pc_cusco', +1).proposals;
  assert.deepEqual(p.diff.keptItemsAffected.map((x) => [x.contentId, x.blockId]), [[limaItem, 'op:pc_lima_in:d1']]);
  const cusco = blockById(p.trip, 'op:pc_cusco:d1');
  assert.deepEqual([cusco.anchor.contentId, cusco.locked], [cuscoItem, true]);
  assert.deepEqual(p.trip.spec.choices, t.spec.choices);
  assertProposalValid(p);
});

test('R4.7 applyProposal: fresh preview applies; any other edit makes it stale; undo restores exactly', () => {
  const t = filled(spec(PERU, 10));
  const [p] = previewAdjustNights(t, 'pc_cusco', +1).proposals;
  const applied = applyProposal(t, p);
  assert.equal(applied.ok, true);
  assert.equal(applied.trip.routePlan.nightsSource, 'user');
  assert.deepStrictEqual(applied.trip.history, [t]);
  assert.deepStrictEqual({ ...applied.trip, history: [] }, p.trip, 'what was previewed is what is applied');
  assert.deepStrictEqual(must(undo(applied.trip)), t);

  const edited = must(swapActivity(t, 'op:pc_cusco:d1'));
  const stale = applyProposal(edited, p);
  assert.deepEqual([stale.ok, stale.reason], [false, 'stale_preview']);
  assert.equal(typeof stale.message, 'string');
  // Undoing the other edit makes the same preview valid again (content hash, not a counter).
  assert.equal(applyProposal(must(undo(edited)), p).ok, true);
  // History cap is shared with edit.js.
  const long = { ...t, history: Array.from({ length: 20 }, () => t) };
  const longPreview = previewAdjustNights(long, 'pc_cusco', +1).proposals[0];
  assert.equal(applyProposal(long, longPreview).trip.history.length, 20);
});

test('R4.8 determinism and validity: identical input → identical proposals; every trip validates', () => {
  const cases = [
    [spec(PERU, 10), 'pc_cusco', +1],
    [spec(PERU, 10), 'pc_lima_in', -1],
    [spec(PERU, 12), 'pc_aguas', +1],
    [spec(PERU, 12, ['huaraz']), 'pc_huaraz', +1],
    [spec(PERU, 14, [], { interests: ['Hiking'] }), 'pc_cusco', -1]
  ];
  for (const [s, key, delta] of cases) {
    const a = previewAdjustNights(filled(s), key, delta);
    const b = previewAdjustNights(filled(s), key, delta);
    assert.deepStrictEqual(a, b, `${key} ${delta}`);
    for (const p of a.ok ? a.proposals : a.alternatives) assertProposalValid(p);
  }
});

test('R4.9 12-day Peru + Huaraz required: +1 Huaraz works and never removes Huaraz', () => {
  const t = filled(spec(PERU, 12, ['huaraz', 'machu_picchu']));
  const r = previewAdjustNights(t, 'pc_huaraz', +1);
  assert.equal(r.ok, true);
  assert.deepEqual(r.proposals.map((p) => p.id), ['nights:pc_huaraz:+1:from:pc_lima_in', 'nights:pc_huaraz:+1:extend']);
  for (const p of r.proposals) {
    assert.equal(nightsOf(p.trip).pc_huaraz, 3);
    assert.deepEqual(p.diff.placesRemoved, []);
    assert.equal(p.trip.routePlan.stops.find((x) => x.key === 'pc_huaraz').selectionSource, 'required');
    assertProposalValid(p);
  }
  // Taking a night from Huaraz is possible (down to its minimum), but it ranks after default stops.
  const more = previewAdjustNights(filled(spec(PERU, 14, ['huaraz'])), 'pc_cusco', +1);
  const donors = more.proposals.filter((p) => p.id.includes(':from:')).map((p) => p.id.split(':from:')[1]);
  assert.equal(donors.includes('pc_huaraz') ? donors.indexOf('pc_huaraz') === donors.length - 1 : true, true);
});

test('R4.10 −1 proposals: give the night to another stop, or shorten the trip (last)', () => {
  const t = filled(spec(PERU, 10));
  const r = previewAdjustNights(t, 'pc_lima_in', -1);
  assert.equal(r.ok, true);
  assert.ok(r.proposals.length >= 2 && r.proposals.length <= 3);
  assert.equal(r.proposals.at(-1).id, 'nights:pc_lima_in:-1:shorten');
  assert.equal(r.proposals.at(-1).trip.spec.totalDays, 9);
  for (const p of r.proposals.slice(0, -1)) {
    assert.match(p.id, /^nights:pc_lima_in:-1:to:/);
    assert.equal(p.trip.spec.totalDays, 10);
    assert.equal(nightsOf(p.trip).pc_lima_in, 1);
  }
  const gaps = r.proposals.slice(0, -1).map((p) => p.diff.contentGaps);
  assert.deepEqual(gaps, [...gaps].sort((a, b) => a - b), 'fewer gaps first');
});

test('R4.11 previewChangeLength: grow/shrink from the current allocation; below minimum offers the shorter route', () => {
  const t = filled(spec(PERU, 10));
  const grow = previewChangeLength(t, 12);
  assert.equal(grow.ok, true);
  assert.deepEqual(nightsOf(grow.proposals[0].trip), { ...nightsOf(t), pc_lima_in: 3, pc_cusco: 4 });
  const shrink = previewChangeLength(t, 9);
  assert.deepEqual(nightsOf(shrink.proposals[0].trip), { ...nightsOf(t), pc_cusco: 2 });
  assert.equal(previewChangeLength(t, 10).why, 'no_change');
  assert.equal(previewChangeLength(t, 15).why, 'allocation_maximum');
  const tooShort = previewChangeLength(t, 7);
  assert.deepEqual([tooShort.why, tooShort.alternatives], ['insufficient_days', []]);

  // Huaraz variant chosen by route (not required): 10 days → switch to the backbone.
  const hz = filled({ ...spec(PERU, 12), routeTemplateId: 'peru_classic+huaraz@after_lima_in' });
  const r = previewChangeLength(hz, 10);
  assert.equal(r.why, 'insufficient_days');
  assert.equal(r.alternatives.length, 1);
  const alt = r.alternatives[0];
  assert.equal(alt.label, 'Switch to the shorter route');
  assert.equal(alt.trip.routePlan.variantId, 'peru_classic');
  assert.deepEqual(alt.diff.placesRemoved, ['huaraz']);
  assert.equal(alt.trip.spec.totalDays, 10);
  assertProposalValid(alt);
  // Required Huaraz is never removed automatically.
  assert.deepEqual(previewChangeLength(filled(spec(PERU, 12, ['huaraz'])), 10).alternatives, []);
  for (const p of [...grow.proposals, ...shrink.proposals]) assertProposalValid(p);
});

test('R4.12 reconcile never reinstates a rejected item; identical skeleton keeps every item', () => {
  let t = filled(spec(PERU, 10));
  const rejectedId = blockById(t, 'op:pc_cusco:d1').anchor.contentId;
  t = must(rejectActivity(t, 'op:pc_cusco:d1'));
  for (const p of previewAdjustNights(t, 'pc_cusco', +1).proposals) {
    assert.equal(contentIds(p.trip).includes(rejectedId), false);
  }
  // Reconciling onto the trip's own skeleton keeps everything in place.
  const skeleton = buildTripFromRoutePlan(t.spec, t.routePlan, PILOT_DATA, DRAFTS);
  const rec = reconcile(t, skeleton);
  assert.deepEqual(contentIds(rec.trip), contentIds(t));
  assert.deepEqual([rec.activitiesLost, rec.activitiesAdded, rec.keptItemsAffected], [[], [], []]);
});
