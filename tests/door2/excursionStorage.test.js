import { test } from 'node:test';
import assert from 'node:assert/strict';

// The real draftStorage.js against jsdom's localStorage (installed by domHarness),
// with the synthetic bundle. The page saves `{ ...trip, history: [] }` (F1) and
// loads the stored trip as-is; an excursion selection lives in trip.routePlan and
// in the ex: blocks of trip.days, so a faithful round trip is all it takes.
await import('./helpers/domHarness.js');
const { deleteDraftTrip, listDraftTrips, loadDraftTrip, saveDraftTrip } = await import('../../src/lib/door2/draftStorage.js');
const { compileFamilies } = await import('../../src/lib/door2/families.js');
const { tripFingerprint } = await import('../../src/lib/door2/fingerprint.js');
const { buildFilledTrip } = await import('../../src/lib/door2/planner.js');
const R = await import('../../src/lib/door2/restructure.js');
const { synBundle, synSpec } = await import('./helpers/syntheticHub.js');

const B = synBundle(compileFamilies);

function addAll(trip, picks) {
  return picks.reduce((t, [stopKey, id]) => {
    const r = R.previewAddExcursion(t, stopKey, id, B.options);
    assert.equal(r.ok, true, `${id}: ${JSON.stringify(r).slice(0, 200)}`);
    return R.applyProposal(t, r.proposals[0]).trip;
  }, trip);
}

const selections = (trip) =>
  Object.fromEntries(trip.routePlan.stops.filter((s) => s.selectedExcursionIds).map((s) => [s.key, s.selectedExcursionIds]));
const exBlocks = (trip) => trip.days.flatMap((d) => d.blocks.filter((b) => b.id.startsWith('ex:')));

test('A13: a trip with excursions at two bases saves, lists, reloads compatible and identical, and deletes', () => {
  localStorage.clear();
  const start = buildFilledTrip(synSpec(9, { routeTemplateId: 'syn_hub+spur@after_base' }), B.data, { content: B.content });
  const trip = addAll(start, [['lx_base', 'sintra'], ['pt_base', 'douro']]);
  assert.deepEqual(selections(trip), { lx_base: ['sintra'], pt_base: ['douro'] });
  assert.ok(trip.history.length === 2, 'the session has history, which the page strips on save');

  const saved = { ...trip, history: [] };
  const id = saveDraftTrip(saved, 'with day trips');
  assert.equal(listDraftTrips().length, 1);
  assert.equal(listDraftTrips()[0].id, id);
  assert.deepEqual(listDraftTrips()[0].trip, saved);

  const loaded = loadDraftTrip(id);
  assert.equal(loaded.compatible, true);
  assert.deepEqual(loaded.trip, saved, 'deep-equal after the JSON round trip');
  assert.equal(tripFingerprint(loaded.trip), tripFingerprint(trip), 'same fingerprint, so a preview built before saving is still current');
  assert.deepEqual(selections(loaded.trip), { lx_base: ['sintra'], pt_base: ['douro'] });
  assert.deepEqual(exBlocks(loaded.trip), exBlocks(trip));
  assert.equal(loaded.trip.versions.schema, 'door2-v6', 'no schema bump');

  // The reloaded trip is fully editable: a further preview works on it and undo works within the session.
  const removed = R.previewRemoveExcursion(loaded.trip, 'lx_base', 'sintra', B.options);
  assert.equal(removed.ok, true);
  assert.deepEqual(selections(removed.proposals[0].trip), { pt_base: ['douro'] });

  deleteDraftTrip(id);
  assert.deepEqual(listDraftTrips(), []);
  assert.deepEqual(loadDraftTrip(id), { compatible: false, reason: 'Draft not found.' });
});

test('A13b / Q3: a draft is loaded exactly as saved, even if a selected id is no longer offered; nothing is cleaned on load', () => {
  localStorage.clear();
  const start = buildFilledTrip(synSpec(5, { routeTemplateId: 'syn_hub' }), B.data, { content: B.content });
  const trip = addAll(start, [['lx_base', 'sintra']]);
  const stale = structuredClone({ ...trip, history: [] });
  stale.routePlan.stops[0].selectedExcursionIds = ['sintra', 'withdrawn_item'];
  const id = saveDraftTrip(stale, 'stale menu');
  const loaded = loadDraftTrip(id);
  assert.equal(loaded.compatible, true);
  assert.deepEqual(loaded.trip, stale);
  assert.deepEqual(selections(loaded.trip), { lx_base: ['sintra', 'withdrawn_item'] });

  // The next rebuild reports the loss out loud instead of dropping it silently.
  const r = R.previewAdjustNights(loaded.trip, 'lx_base', +1, B.options);
  assert.equal(r.ok, true);
  const diff = r.proposals[0].diff;
  assert.deepEqual(diff.excursionsRemoved, [{ stopKey: 'lx_base', excursionId: 'withdrawn_item', reason: 'no_longer_offered' }]);
  assert.deepEqual(selections(r.proposals[0].trip), { lx_base: ['sintra'] });
});
