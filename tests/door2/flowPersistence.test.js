// B9 (save/reload/delete) and B10 (stale preview) — driven through the real
// Door2Plan page.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { loadDoor2PlanModule, mountWithBuiltTrip, peruSpec, teardown } from './helpers/domHarness.js';

const M = await loadDoor2PlanModule();
after(teardown);
const { screen } = await import('@testing-library/react');

test('B9: save (with edits) -> start over -> load -> delete, same itinerary including the edits (undo history is not persisted)', async () => {
  const { user, trip: originalTrip } = await mountWithBuiltTrip(M, peruSpec({ totalDays: 10 }));

  // Make an edit: swap + make a day lighter.
  await user.click(screen.getAllByText('Swap')[0]);
  await screen.findByText('Swapped');
  const menuButtons = screen.getAllByRole('button', { name: /options/ });
  await user.click(menuButtons[0]);
  await user.click(await screen.findByText('Make lighter'));

  const editedGlance = screen.getByText(/\d+ days ·/).textContent;

  await user.click(screen.getByRole('button', { name: 'Save' }));
  await screen.findByText('Saved');

  await user.click(screen.getByText('Start a new trip'));
  await screen.findByText('Peru'); // back at the destination step

  // Two drafts now exist (the initial "Test trip" from setup, and this
  // test's own save); listDraftTrips sorts newest-first, so "Continue" on
  // the first row loads the one just saved.
  await user.click(screen.getAllByRole('button', { name: 'Continue' })[0]);

  await screen.findByText('Your trip at a glance');
  const reloadedGlance = screen.getByText(/\d+ days ·/).textContent;
  assert.equal(reloadedGlance, editedGlance, 'reloaded trip matches the edited trip (same itinerary summary)');
  // F1: a draft is a saved plan, not an editing session; history is stripped on save (undo works only within a session).
  assert.ok(screen.queryByText('Undo last change') === null, 'reloaded draft carries no undo history');
  assert.equal(M.listDraftTrips()[0].trip.history.length, 0, 'the stored draft holds no history');

  // Delete every saved draft and confirm the list clears (in-memory and localStorage).
  await user.click(screen.getByText('Start a new trip'));
  await screen.findByText('Peru');
  let deleteButtons = screen.queryAllByRole('button', { name: 'Delete' });
  assert.ok(deleteButtons.length > 0, 'at least one saved draft listed');
  for (const btn of screen.getAllByRole('button', { name: 'Delete' })) {
    await user.click(btn);
  }
  assert.ok(screen.queryByRole('button', { name: 'Delete' }) === null, 'no drafts left in the UI');
  assert.equal(M.listDraftTrips().length, 0, 'no drafts left in localStorage');
});

test('B10: applying a stale structural preview is refused and does not mutate the trip', async () => {
  const { user } = await mountWithBuiltTrip(M, peruSpec({ totalDays: 10 }));

  // Open a structural proposal (add Huaraz) but don't apply it yet.
  await user.click(await screen.findByText('Huaraz & the Cordillera Blanca'));
  await user.click(await screen.findByText('Add Huaraz & the Cordillera Blanca'));
  const useButtons = await screen.findAllByText('Use this plan');
  assert.ok(useButtons.length > 0, 'proposal shown');

  // Change the trip another way *without closing the sheet* (jsdom doesn't
  // enforce the overlay's visual occlusion of the background, so the
  // background "Swap" button is still a real, mounted DOM node reachable by
  // the test — this is the only way to reach applyProposal's staleness guard
  // through the compiled page's own handlers rather than calling
  // restructure.js directly; a real mouse in a real browser couldn't click
  // through the modal here). See the report for this caveat.
  await user.click(screen.getAllByText('Swap')[0]);
  await screen.findByText('Swapped');

  // Now try to apply the now-stale proposal.
  await user.click(useButtons[0]);

  assert.ok(
    await screen.findByText('Your trip changed since this preview. Take another look before applying it.'),
    'stale-preview message shown'
  );
  const itinerarySummary = screen.getByText(/\d+ days ·/).textContent;
  assert.doesNotMatch(itinerarySummary, /Huaraz/, 'stale proposal was not applied');

  // Closing and reopening gets a fresh, non-stale proposal that applies fine.
  await user.click(screen.getByText('×'));
  await user.click(await screen.findByText('Huaraz & the Cordillera Blanca'));
  await user.click(await screen.findByText('Add Huaraz & the Cordillera Blanca'));
  await user.click((await screen.findAllByText('Use this plan'))[0]);
  await screen.findByText('Trip updated');
  assert.match(screen.getByText('Your trip at a glance').closest('div').textContent, /Huaraz/, 'fresh preview applies');
});

// H6: Peru drafts saved before C3a (variant ids gained '#direction' and routePlan.directionId
// was added for reversible families only) must still open. peru-pre-c3a.json pins the sha256 of
// pre-C3a trips, so a trip whose hash matches IS byte-identical to what such a draft holds.
const GOLDEN = JSON.parse(readFileSync(new URL('./fixtures/peru-pre-c3a.json', import.meta.url), 'utf8'));
const sha = (x) => createHash('sha256').update(JSON.stringify(x)).digest('hex');
// Key order matters to the hash: same spec shape (and order) as reversible.test.js's peruSpec.
const preC3aSpec = (totalDays, routeTemplateId) => ({
  originPlaceId: 'vancouver', destination: { kind: 'country', id: 'PE' }, travelMonth: 10, totalDays,
  travellerType: 'couple', interests: [], pace: 'balanced', budget: 'mid', requiredPlaceIds: [],
  routeTemplateId, stops: [], choices: { pinned: [], rejected: [], placed: [] }
});

for (const variantId of ['peru_classic', 'peru_classic+huaraz@after_lima_in']) {
  test(`H6: a pre-C3a Peru draft on ${variantId} loads compatible, renders and edits`, async () => {
    const totalDays = variantId === 'peru_classic' ? 10 : 12;
    const { user, trip } = await mountWithBuiltTrip(M, preC3aSpec(totalDays, variantId));
    assert.equal(sha(trip), GOLDEN.trips[`${variantId}:${totalDays}`], 'the saved trip is byte-identical to a pre-C3a trip');
    assert.equal('directionId' in trip.routePlan, false, 'no direction, as before C3a');
    assert.equal(trip.routePlan.variantId, variantId);

    const loaded = M.loadDraftTrip(M.listDraftTrips()[0].id);
    assert.equal(loaded.compatible, true);
    assert.deepEqual(loaded.trip, JSON.parse(JSON.stringify(trip)), 'loaded exactly as saved');

    assert.ok(screen.queryByText(/can't be built yet/) === null, 'renders');
    assert.ok(screen.getByText('Your trip at a glance'));
    if (variantId !== 'peru_classic') assert.ok(screen.getAllByText('Huaraz').length > 0, 'Huaraz stop shown');
    await user.click(screen.getAllByText('Swap')[0]);
    await screen.findByText('Swapped');
  });
}
