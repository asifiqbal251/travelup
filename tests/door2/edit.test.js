import { test } from 'node:test';
import assert from 'node:assert/strict';

import { PILOT_DATA, buildFilledTrip } from '../../src/lib/door2/planner.js';
import { PILOT_CONTENT } from '../../src/lib/door2/pilotContent.js';
import { makeDayLighter, pinActivity, rejectActivity, swapActivity, undo, unpinActivity } from '../../src/lib/door2/edit.js';
import { validateEditInvariant } from '../../src/lib/door2/validate.js';

const DRAFTS = { reviewPolicy: 'allow_drafts' };

function spec(destination, totalDays, extra = {}) {
  return {
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
  };
}

const PERU = { kind: 'country', id: 'PE' };
const TOKYO = { kind: 'place', id: 'tokyo' };

function filledTrip(s) {
  const trip = buildFilledTrip(s, PILOT_DATA, DRAFTS);
  assert.notEqual(trip.ok, false, `expected a Trip, got failure ${JSON.stringify(trip)}`);
  return trip;
}

const blockById = (trip, id) => trip.days.flatMap((d) => d.blocks).find((b) => b.id === id);

// Block IDs (0-indexed suffixes, derived from schedule.js output):
// G2/G7 Peru 10 days:
//   op:pc_lima_in:d0  = D2, lima_miraflores (half)
//   op:pc_lima_in:d1  = D3, lima_historic_centre (full)
//   op:pc_cusco:d0    = D4, cusco_acclimatise (half)
//   op:pc_cusco:d1    = D5, cusco_market_san_blas / cusco_pisac (full)
//   op:pc_cusco:d2    = D6, cusco_sacsayhuaman / cusco_humantay (full)
//   ex:pc_aguas:machu_picchu:site = D7, mp_citadel (half)
//   op:pc_lima_out:d0 = D8, lima_magic_water (evening)
//
// G5 Tokyo 10 days:
//   op:tokyo_base:d0..d5 = D2..D7 (d5 = tyo_tsukiji_ginza)
//   op:tokyo_base:d6, d7 = D8, D9 (GAP)

// E1: Swap on G2's D2 lima_miraflores block (no contentId given)
test('E1: swapActivity auto-picks a different eligible lima half-slot item', () => {
  const trip = filledTrip(spec(PERU, 10));
  assert.equal(blockById(trip, 'op:pc_lima_in:d0')?.activity?.templateId, 'lima_miraflores');

  const result = swapActivity(trip, 'op:pc_lima_in:d0');
  assert.equal(result.ok, true);

  const newBlock = blockById(result.trip, 'op:pc_lima_in:d0');
  assert.notEqual(newBlock.activity.templateId, 'lima_miraflores', 'should have a different item');
  assert.ok(newBlock.activity.templateId.startsWith('lima_'), 'item must be for lima');

  // Not used elsewhere
  const usedElsewhere = result.trip.days.flatMap((d) => d.blocks)
    .filter((b) => b.id !== 'op:pc_lima_in:d0' && b.type === 'activity')
    .map((b) => b.anchor.contentId);
  assert.ok(!usedElsewhere.includes(newBlock.activity.templateId));

  // Placed choices updated with the new item
  assert.ok(result.trip.spec.choices.placed.includes(newBlock.activity.templateId));

  // History: one entry = the pre-swap trip
  assert.equal(result.trip.history.length, 1);
  assert.deepStrictEqual(result.trip.history[0], trip);

  // Auto-pick: lima_barranco is the first eligible half-slot lima item after lima_miraflores
  assert.equal(newBlock.activity.templateId, 'lima_barranco');
});

// E2: Swap with an ineligible contentId
test('E2: swapActivity with wrong-place or already-used contentId returns content_not_eligible', () => {
  const trip = filledTrip(spec(PERU, 10));

  // Wrong place: cusco item for lima block
  const r1 = swapActivity(trip, 'op:pc_lima_in:d0', 'cusco_acclimatise');
  assert.equal(r1.ok, false);
  assert.equal(r1.reason, 'content_not_eligible');

  // Already used: lima_historic_centre is on op:pc_lima_in:d1 (D3)
  assert.equal(blockById(trip, 'op:pc_lima_in:d1')?.activity?.templateId, 'lima_historic_centre');
  const r2 = swapActivity(trip, 'op:pc_lima_in:d0', 'lima_historic_centre');
  assert.equal(r2.ok, false);
  assert.equal(r2.reason, 'content_not_eligible');
});

// E3: Swap on a travel block
test('E3: swapActivity on a travel block returns block_not_editable', () => {
  const trip = filledTrip(spec(PERU, 10));
  const travelBlock = trip.days.flatMap((d) => d.blocks).find((b) => b.type === 'travel');
  assert.ok(travelBlock);
  const result = swapActivity(trip, travelBlock.id);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'block_not_editable');
});

// E4: Pin then attempt swap on locked block
test('E4: pinActivity then swapActivity returns block_locked', () => {
  const trip = filledTrip(spec(PERU, 10));
  const blockId = 'op:pc_lima_in:d0';

  const pinResult = pinActivity(trip, blockId);
  assert.equal(pinResult.ok, true);
  assert.equal(blockById(pinResult.trip, blockId).locked, true);
  assert.ok(pinResult.trip.spec.choices.pinned.includes('lima_miraflores'));

  const swapResult = swapActivity(pinResult.trip, blockId);
  assert.equal(swapResult.ok, false);
  assert.equal(swapResult.reason, 'block_locked');
});

// E5: Unpin then swap succeeds
test('E5: unpinActivity then swapActivity succeeds', () => {
  const trip = filledTrip(spec(PERU, 10));
  const blockId = 'op:pc_lima_in:d0';

  const pinned = pinActivity(trip, blockId);
  assert.equal(pinned.ok, true);

  const unpinned = unpinActivity(pinned.trip, blockId);
  assert.equal(unpinned.ok, true);
  assert.equal(blockById(unpinned.trip, blockId).locked, false);
  assert.ok(!unpinned.trip.spec.choices.pinned.includes('lima_miraflores'));

  const swapped = swapActivity(unpinned.trip, blockId);
  assert.equal(swapped.ok, true);
});

// E6: Reject D7 block in G5 (Tokyo, thin content) until pool is exhausted
test('E6: rejectActivity exhausts Tokyo content; block becomes a gap on first rejection', () => {
  // G5: op:tokyo_base:d5 = D7 = tyo_tsukiji_ginza.
  // D2-D6 have used all other full-slot Tokyo items → pool is empty on first rejection.
  const trip = filledTrip(spec(TOKYO, 10));
  const blockId = 'op:tokyo_base:d5';
  assert.equal(blockById(trip, blockId)?.activity?.templateId, 'tyo_tsukiji_ginza');

  const r = rejectActivity(trip, blockId);
  assert.equal(r.ok, true);

  const newBlock = blockById(r.trip, blockId);
  assert.equal(newBlock.type, 'open');
  assert.equal(newBlock.generationStatus, 'unavailable');
  assert.deepEqual(newBlock.gap, { reason: 'no_eligible_content', slot: 'full' });

  assert.equal(r.trip.status, 'incomplete');
  assert.ok(r.trip.warnings.includes('content_insufficient'));
  assert.ok(r.trip.contentGaps.some((g) => g.blockId === blockId));
});

// E7: makeDayLighter is a no-op when current item already tops relaxed scoring
test('E7: makeDayLighter leaves block unchanged when current item already tops relaxed scoring (still pushes history)', () => {
  // G2 Day 4: cusco_acclimatise (Light, arrivalFriendly, isFirstAtStop → score 6 with relaxed).
  // Only other eligible half-slot cusco item at dayOffset=0 is cusco_chocolate_inca_museum
  // (Light, score=1). Current item wins → no change.
  const trip = filledTrip(spec(PERU, 10));
  assert.equal(blockById(trip, 'op:pc_cusco:d0')?.activity?.templateId, 'cusco_acclimatise');

  const result = makeDayLighter(trip, 4);
  assert.equal(result.ok, true);

  // Block is unchanged
  assert.equal(blockById(result.trip, 'op:pc_cusco:d0').activity.templateId, 'cusco_acclimatise');

  // Decision: push history even for no-op (operation ran; undo should undo it).
  assert.equal(result.trip.history.length, 1);
});

// E8: makeDayLighter replaces a High item with a Light alternative
test('E8: makeDayLighter replaces High-intensity item with Light alternative', () => {
  // G7 (Hiking) Day 6: op:pc_cusco:d2 = cusco_humantay (High).
  // Forced relaxed: cusco_market_san_blas (Light, score=1) > cusco_humantay (score=-2).
  const trip = filledTrip(spec(PERU, 10, { interests: ['Hiking'] }));
  assert.equal(blockById(trip, 'op:pc_cusco:d2')?.activity?.templateId, 'cusco_humantay');

  const result = makeDayLighter(trip, 6);
  assert.equal(result.ok, true);

  const newD6 = blockById(result.trip, 'op:pc_cusco:d2');
  assert.equal(newD6.activity.templateId, 'cusco_market_san_blas');
  assert.equal(newD6.activity.intensity, 'Light');

  // Other days untouched
  for (let d = 1; d <= 10; d++) {
    if (d === 6) continue;
    const before = trip.days.find((x) => x.dayNumber === d);
    const after = result.trip.days.find((x) => x.dayNumber === d);
    assert.deepStrictEqual(after, before, `Day ${d} should be unchanged`);
  }
  // validateEditInvariant confirms calendar is intact
  validateEditInvariant(result.trip, trip);
});

// E9: Three edits then undo × 3
test('E9: three edits then undo × 3 restores each previous state', () => {
  const base = filledTrip(spec(PERU, 10));

  // swap D2 (lima_miraflores → lima_barranco)
  const r1 = swapActivity(base, 'op:pc_lima_in:d0');
  assert.equal(r1.ok, true);

  // pin D3 (lima_historic_centre)
  const r2 = pinActivity(r1.trip, 'op:pc_lima_in:d1');
  assert.equal(r2.ok, true);

  // reject D4 (cusco_acclimatise → cusco_chocolate_inca_museum)
  const r3 = rejectActivity(r2.trip, 'op:pc_cusco:d0');
  assert.equal(r3.ok, true);

  assert.equal(r3.trip.history.length, 3);

  // Undo 1: back to r2.trip
  const u1 = undo(r3.trip);
  assert.equal(u1.ok, true);
  assert.deepStrictEqual(u1.trip, r2.trip);

  // Undo 2: back to r1.trip
  const u2 = undo(u1.trip);
  assert.equal(u2.ok, true);
  assert.deepStrictEqual(u2.trip, r1.trip);

  // Undo 3: back to base
  const u3 = undo(u2.trip);
  assert.equal(u3.ok, true);
  assert.deepStrictEqual(u3.trip, base);

  // Undo 4: nothing to undo
  const u4 = undo(u3.trip);
  assert.equal(u4.ok, false);
  assert.equal(u4.reason, 'nothing_to_undo');
});

// E10: Determinism
test('E10: same edit sequence from same starting trip is deepStrictEqual at every step', () => {
  const base = filledTrip(spec(PERU, 10));

  const run = (start) => {
    const s1 = swapActivity(start, 'op:pc_lima_in:d0');
    const s2 = pinActivity(s1.trip, 'op:pc_cusco:d0');
    const s3 = rejectActivity(s2.trip, 'op:pc_lima_in:d1');
    return [s1, s2, s3];
  };

  const a = run(base);
  const b = run(base);

  for (let i = 0; i < a.length; i++) {
    assert.deepStrictEqual(a[i], b[i], `step ${i + 1} must be deterministic`);
  }
});

// E11: validateEditInvariant catches tampering
test('E11: validateEditInvariant throws on: changed travel startTime, duplicate contentId, locked block not in pinned', () => {
  const trip = filledTrip(spec(PERU, 10));
  const clone = (x) => JSON.parse(JSON.stringify(x));

  // (a) travel block's startTime changed
  const a = clone(trip);
  const travelBlock = a.days.flatMap((d) => d.blocks).find((b) => b.type === 'travel');
  travelBlock.startTime = '10:00';
  assert.throws(() => validateEditInvariant(a, trip), /startTime changed/);

  // (b) same contentId on two blocks
  const b = clone(trip);
  const bl0 = b.days.flatMap((d) => d.blocks).find((x) => x.id === 'op:pc_lima_in:d0');
  const bl1 = b.days.flatMap((d) => d.blocks).find((x) => x.id === 'op:pc_lima_in:d1');
  bl1.anchor.contentId = bl0.anchor.contentId;
  bl1.activity.templateId = bl0.anchor.contentId;
  assert.throws(() => validateEditInvariant(b, trip), /used on more than one block/);

  // (c) locked block whose templateId is not in spec.choices.pinned
  const c = clone(trip);
  const actBlock = c.days.flatMap((d) => d.blocks).find((x) => x.type === 'activity');
  actBlock.locked = true;
  // spec.choices.pinned is empty → violation
  assert.throws(() => validateEditInvariant(c, trip), /not in spec\.choices\.pinned/);
});

// E12: Regression — fill output is identical after the eligibility extraction refactor
test('E12: regression — fill output is identical after the eligibility extraction refactor', () => {
  const G2 = filledTrip(spec(PERU, 10));
  const G5 = filledTrip(spec(TOKYO, 10));

  // Spot-check G2 fills
  assert.equal(blockById(G2, 'op:pc_lima_in:d0')?.activity?.templateId, 'lima_miraflores');
  assert.equal(blockById(G2, 'op:pc_cusco:d0')?.activity?.templateId, 'cusco_acclimatise');
  assert.equal(G2.contentGaps.length, 0);

  // G5 runs out of content
  assert.equal(G5.status, 'incomplete');
  assert.ok(G5.warnings.includes('content_insufficient'));
  assert.equal(G5.contentGaps.length, 2);
});
