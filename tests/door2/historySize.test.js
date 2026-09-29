// F1: edit history must not nest inside itself. Each history entry used to embed the whole
// prior stack, so a saved trip doubled in size with every edit (Save draft failed after ~8).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { swapActivity, makeDayLighter, undo } from '../../src/lib/door2/edit.js';
import { PILOT_DATA, buildFilledTrip } from '../../src/lib/door2/planner.js';
import { applyProposal, previewChangeLength } from '../../src/lib/door2/restructure.js';
import { tripFingerprint } from '../../src/lib/door2/fingerprint.js';

const spec = {
  originPlaceId: 'vancouver', destination: { kind: 'place', id: 'new_york' }, travelMonth: 10, totalDays: 10,
  travellerType: 'couple', interests: [], pace: 'balanced', budget: 'mid', requiredPlaceIds: [],
  routeTemplateId: null, stops: [], choices: { pinned: [], rejected: [], placed: [] }
};
const fresh = () => buildFilledTrip(spec, PILOT_DATA, { reviewPolicy: 'allow_drafts' });
const strip = (t) => { const { history, ...rest } = t; return rest; };
const activityBlockIds = (t) => t.days.flatMap((d) => d.blocks).filter((b) => b.type === 'activity').map((b) => b.id);

/** Swap activity blocks in turn; every swap must succeed so the count of edits is real. */
function swapN(trip, n, sizes = {}) {
  let t = trip;
  for (let i = 1; i <= n; i++) {
    const ids = activityBlockIds(t);
    const r = swapActivity(t, ids[i % ids.length]);
    assert.equal(r.ok, true, `edit ${i} succeeds: ${r.message ?? ''}`);
    t = r.trip;
    if (i in sizes) sizes[i] = JSON.stringify(t).length;
  }
  return t;
}

test('F1-size: serialized trip size stays roughly linear across 12 successive edits', () => {
  const base = fresh();
  const baseBytes = JSON.stringify(base).length;
  const sizes = { 1: 0, 7: 0, 12: 0 };
  let t = base;
  for (let i = 1; i <= 12; i++) {
    t = swapN(t, 1);
    // swapN's own counter restarts at 1, so track size here instead.
    if (i in sizes) sizes[i] = JSON.stringify(t).length;
  }
  console.log(`# F1 sizes: unedited ${baseBytes} B; after 1 edit ${sizes[1]}, 7 edits ${sizes[7]}, 12 edits ${sizes[12]}`);
  assert.equal(t.history.length, 12);
  assert.ok(sizes[12] < 20 * baseBytes, `12 edits: ${sizes[12]} B must be under 20x the unedited ${baseBytes} B`);
});

test('F1-cap: history keeps at most 20 entries and stays bounded past the cap', () => {
  const base = fresh();
  const t = swapN(base, 25);
  assert.equal(t.history.length, 20);
  assert.ok(JSON.stringify(t).length < 30 * JSON.stringify(base).length);
});

test('F1-undo: three edits then three undos restores the original, and each step restores the prior state', () => {
  const original = fresh();
  const e1 = swapActivity(original, activityBlockIds(original)[0]).trip;
  const e2 = makeDayLighter(e1, 3).trip;
  const e3 = swapActivity(e2, activityBlockIds(e2)[1]).trip;
  assert.equal(e3.history.length, 3);

  const u1 = undo(e3);
  assert.equal(u1.ok, true);
  assert.deepEqual(strip(u1.trip), strip(e2), 'first undo returns the state before the third edit');
  assert.equal(u1.trip.history.length, 2, 'the remaining stack is rebuilt from the outer array');
  const u2 = undo(u1.trip);
  assert.equal(u2.ok, true, 'second undo is not a silent no-op');
  assert.deepEqual(strip(u2.trip), strip(e1));
  const u3 = undo(u2.trip);
  assert.equal(u3.ok, true);
  assert.deepEqual(strip(u3.trip), strip(original), 'byte-identical to the original after three undos');
  assert.equal(u3.trip.history.length, 0);
  assert.equal(undo(u3.trip).ok, false, 'nothing left to undo');
  assert.equal(undo(u3.trip).reason, 'nothing_to_undo');
  assert.equal(tripFingerprint(u3.trip), tripFingerprint(original));
});

test('F1-undo: a structural apply sits in the same chain and undoes cleanly', () => {
  const original = fresh();
  const e1 = swapActivity(original, activityBlockIds(original)[0]).trip;
  const proposal = previewChangeLength(e1, 11).proposals[0];
  const applied = applyProposal(e1, proposal);
  assert.equal(applied.ok, true);
  const e3 = swapActivity(applied.trip, activityBlockIds(applied.trip)[0]).trip;
  assert.equal(e3.history.length, 3);
  for (const entry of e3.history) assert.deepEqual(entry.history, [], 'stored snapshots carry no history of their own');

  let t = e3;
  for (let i = 0; i < 3; i++) { const r = undo(t); assert.equal(r.ok, true, `undo ${i + 1}`); t = r.trip; }
  assert.deepEqual(strip(t), strip(original));
});

test('F1-fingerprint: tripFingerprint ignores history, so an edited-then-undone trip matches the original', () => {
  const original = fresh();
  const edited = swapN(original, 3);
  assert.notEqual(tripFingerprint(edited), tripFingerprint(original));
  assert.equal(tripFingerprint({ ...edited, history: [] }), tripFingerprint(edited), 'history is not part of the fingerprint');
});
