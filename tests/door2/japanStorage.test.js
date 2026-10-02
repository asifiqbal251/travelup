import { test } from 'node:test';
import assert from 'node:assert/strict';

// J10 (E3b): A13 on real Japan data. The real draftStorage.js against jsdom's
// localStorage (installed by domHarness); the page saves `{ ...trip, history: [] }`.
await import('./helpers/domHarness.js');
const { deleteDraftTrip, listDraftTrips, loadDraftTrip, saveDraftTrip } = await import('../../src/lib/door2/draftStorage.js');
const { tripFingerprint } = await import('../../src/lib/door2/fingerprint.js');
const { buildFilledTrip } = await import('../../src/lib/door2/planner.js');
const R = await import('../../src/lib/door2/restructure.js');

const spec = (totalDays) => ({
  originPlaceId: 'vancouver',
  destination: { kind: 'country', id: 'JP' },
  travelMonth: 10,
  totalDays,
  travellerType: 'couple',
  interests: [],
  pace: 'balanced',
  budget: 'mid',
  requiredPlaceIds: [],
  routeTemplateId: 'tokyo_city+kyoto@after_tokyo',
  stops: [],
  choices: { pinned: [], rejected: [], placed: [] }
});

function addAll(trip, picks) {
  return picks.reduce((t, [stopKey, id]) => {
    const r = R.previewAddExcursion(t, stopKey, id);
    assert.equal(r.ok, true, `${id}: ${JSON.stringify(r).slice(0, 200)}`);
    return R.applyProposal(t, r.proposals[0]).trip;
  }, trip);
}

const selections = (trip) =>
  Object.fromEntries(trip.routePlan.stops.filter((s) => s.selectedExcursionIds).map((s) => [s.key, s.selectedExcursionIds]));
const exBlocks = (trip) => trip.days.flatMap((d) => d.blocks.filter((b) => b.id.startsWith('ex:')));

test('J10: a Japan trip with a Tokyo and a Kyoto day trip saves, reloads identical, and deletes', () => {
  localStorage.clear();
  const trip = addAll(buildFilledTrip(spec(10)), [['tokyo_base', 'kamakura'], ['kyo_base', 'osaka']]);
  assert.deepEqual(selections(trip), { tokyo_base: ['kamakura'], kyo_base: ['osaka'] });
  assert.deepEqual(exBlocks(trip).filter((b) => b.id.endsWith(':site')).map((b) => b.id), ['ex:tokyo_base:kamakura:site', 'ex:kyo_base:osaka:site']);

  const saved = { ...trip, history: [] };
  const id = saveDraftTrip(saved, 'Tokyo and Kyoto with day trips');
  assert.equal(listDraftTrips().length, 1);

  const loaded = loadDraftTrip(id);
  assert.equal(loaded.compatible, true);
  // Since the Stage B writer cutover the stored copy is stamped door2-v7; nothing else differs.
  assert.deepEqual(loaded.trip, { ...saved, versions: { ...saved.versions, schema: 'door2-v7' } }, 'deep-equal after the JSON round trip, versions.schema aside');
  assert.equal(tripFingerprint(loaded.trip), tripFingerprint(trip));
  assert.deepEqual(selections(loaded.trip), { tokyo_base: ['kamakura'], kyo_base: ['osaka'] });
  assert.deepEqual(exBlocks(loaded.trip), exBlocks(trip));
  assert.deepEqual(R.listExcursionMenu(loaded.trip, 'kyo_base').map((m) => [m.excursionId, m.selected]), [['nara', false], ['osaka', true]]);

  deleteDraftTrip(id);
  assert.deepEqual(listDraftTrips(), []);
  assert.deepEqual(loadDraftTrip(id), { compatible: false, reason: 'Draft not found.' });
});
