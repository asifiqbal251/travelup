import { test } from 'node:test';
import assert from 'node:assert/strict';

import { pinActivity, rejectActivity, swapActivity, swapDays, swappableDays, undo } from '../../src/lib/door2/edit.js';
import { PILOT_DATA, buildFilledTrip } from '../../src/lib/door2/planner.js';
import { validateEditInvariant } from '../../src/lib/door2/validate.js';

// Route Families design §1.4 / §8: same-stop day swap (Day editor).

const DRAFTS = { reviewPolicy: 'allow_drafts' };
function spec(totalDays, extra = {}) {
  return {
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
  };
}
const filled = (s) => {
  const t = buildFilledTrip(s, PILOT_DATA, DRAFTS);
  assert.notEqual(t.ok, false);
  return t;
};
const must = (r) => {
  assert.equal(r.ok, true, JSON.stringify(r));
  return r.trip;
};
const itemsOn = (trip, n) => trip.days[n - 1].blocks.map((b) => b.anchor.contentId);
const HIKING_FAST = spec(10, { interests: ['Hiking'], pace: 'fast-paced' });
const BALANCED = spec(10);

test('S1: hiking + fast-paced 10-day Peru: swapDays(5, 6) is blocked by Humantay Lake (altitude)', () => {
  const t = filled(HIKING_FAST);
  assert.deepEqual([itemsOn(t, 5), itemsOn(t, 6)], [['cusco_pisac'], ['cusco_humantay']]);
  const r = swapDays(t, 5, 6);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'change_not_feasible');
  assert.equal(r.why, 'content_constraint');
  assert.deepEqual(r.blocked.map((b) => b.templateId), ['cusco_humantay']);
  assert.deepEqual(
    { fromDay: r.blocked[0].fromDay, toDay: r.blocked[0].toDay, minDayAtStop: r.blocked[0].minDayAtStop },
    { fromDay: 6, toDay: 5, minDayAtStop: 2 }
  );
  assert.match(r.message, /Humantay/);
  // Same answer in either order.
  assert.deepEqual(swapDays(t, 6, 5).blocked.map((b) => b.templateId), ['cusco_humantay']);
  assert.deepEqual(swappableDays(t, 5), []);
  assert.deepEqual(swappableDays(t, 6), []);
});

test('S2: arrival and travel days are never swappable', () => {
  const t = filled(HIKING_FAST);
  assert.deepEqual(swappableDays(t, 4), []); // Cusco arrival day: travel + half block
  assert.equal(swapDays(t, 4, 5).why, 'day_shape');
  for (const n of [1, 7, 8, 9, 10]) assert.deepEqual(swappableDays(t, n), [], `Day ${n}`);
});

test('S3: balanced 10-day Peru: Day 5 ↔ Day 6 swaps both ways, undo restores exactly', () => {
  const t = filled(BALANCED);
  assert.deepEqual([itemsOn(t, 5), itemsOn(t, 6)], [['cusco_market_san_blas'], ['cusco_sacsayhuaman']]);
  assert.deepEqual(swappableDays(t, 5), [6]);
  assert.deepEqual(swappableDays(t, 6), [5]);
  const swapped = must(swapDays(t, 5, 6));
  assert.deepEqual([itemsOn(swapped, 5), itemsOn(swapped, 6)], [['cusco_sacsayhuaman'], ['cusco_market_san_blas']]);
  // Calendar unchanged; activities moved with their details.
  assert.equal(validateEditInvariant(swapped, t).ok, true);
  assert.deepEqual(swapped.days[4].blocks[0].activity, t.days[5].blocks[0].activity);
  assert.deepEqual(swapped.days[5].blocks[0].activity, t.days[4].blocks[0].activity);
  assert.equal(swapped.days[4].blocks[0].id, t.days[4].blocks[0].id);
  assert.equal(swapped.days[4].blocks[0].userEdited, true);
  assert.deepStrictEqual(must(undo(swapped)), t);
  // Swapping back is an exact round trip on content.
  const back = must(swapDays(swapped, 5, 6));
  assert.deepEqual(back.days.map((d) => d.blocks.map((b) => b.anchor.contentId)), t.days.map((d) => d.blocks.map((b) => b.anchor.contentId)));
});

test('S4: cross-stop and same-day requests are refused with a reason; Lima full day has no partner', () => {
  const t = filled(BALANCED);
  const cross = swapDays(t, 3, 5); // Lima full day vs Cusco full day
  assert.deepEqual([cross.ok, cross.reason, cross.why], [false, 'change_not_feasible', 'different_stop']);
  assert.match(cross.message, /nights/);
  assert.equal(swapDays(t, 5, 5).why, 'same_day');
  assert.equal(swapDays(t, 5, 42).reason, 'block_not_found');
  assert.deepEqual(swappableDays(t, 3), []);
});

test('S5: pins travel with the item; gaps move too; spec choices are unchanged', () => {
  let t = filled(BALANCED);
  t = must(pinActivity(t, 'op:pc_cusco:d1')); // Day 5
  const swapped = must(swapDays(t, 5, 6));
  const d6 = swapped.days[5].blocks[0];
  assert.deepEqual([d6.anchor.contentId, d6.locked], ['cusco_market_san_blas', true]);
  assert.equal(swapped.days[4].blocks[0].locked, false);
  assert.deepEqual(swapped.spec.choices, t.spec.choices);
  // A pinned block still can't be swapped by swapActivity after moving.
  assert.equal(swapActivity(swapped, 'op:pc_cusco:d2').reason, 'block_locked');

  // Reject Cusco content until Day 6 becomes a gap, then swap the gap with Day 5.
  let g = filled(BALANCED);
  for (let i = 0; i < 10 && g.days[5].blocks[0].type === 'activity'; i++) g = must(rejectActivity(g, 'op:pc_cusco:d2'));
  assert.equal(g.days[5].blocks[0].type, 'open', 'Day 6 should be a gap after rejecting the Cusco shelf');
  const moved = must(swapDays(g, 5, 6));
  assert.equal(moved.days[4].blocks[0].type, 'open');
  assert.equal(moved.days[4].blocks[0].gap.slot, 'full');
  assert.equal(moved.days[5].blocks[0].type, 'activity');
  assert.deepEqual(moved.contentGaps.map((x) => x.dayNumber), [5]);
});
