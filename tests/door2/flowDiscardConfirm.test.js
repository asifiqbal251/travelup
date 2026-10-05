// E3c C4: a rebuild that would throw away the traveller's work (edits or day
// trips) asks first. Covers route switch (C4a) and Refine (C4b) on the real page.
import { mountAndChooseCore } from './helpers/f5Flows.js';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { loadDoor2PlanModule, mountAndBuildViaIntake, teardown } from './helpers/domHarness.js';
import { addDayTrip, japanSpec, mountWithSavedTrip, routeAlternativeButtons, savedTrip } from './helpers/dayTrips.js';

const M = await loadDoor2PlanModule();
after(teardown);
const { screen } = await import('@testing-library/react');
const R = await import('../../src/lib/door2/restructure.js');

const DAY_TRIP_SWITCH_BODY = "This will replace your trip, and your day trips won't carry over.";
const REFINE_BODY_DAY_TRIPS = "Refining rebuilds it from scratch. You'll lose your edits and day trips.";
const REFINE_BODY_EDITS = "Refining rebuilds it from scratch. You'll lose your edits.";

async function openRefineAndApply(user) {
  await user.click(screen.getByRole('button', { name: 'Refine' }));
  await screen.findByText('Make it yours');
  await user.click(screen.getByRole('button', { name: 'Apply and rebuild' }));
}

test('C4a: switching route with a day trip selected confirms first and says the day trips go; "Keep my trip" keeps it identical; "Switch route" replaces it', async () => {
  const { user } = await mountAndBuildViaIntake(M, { destination: 'Japan', totalDays: 10 });
  await addDayTrip(user, 'Tokyo', 'Nikko');
  const t1 = await savedTrip(M, user);

  const [alt] = routeAlternativeButtons();
  assert.ok(alt, 'Japan 10 days offers another route');
  await user.click(alt);
  assert.ok(await screen.findByText('Switch to a different route'), 'confirm appears');
  assert.ok(screen.getByText(DAY_TRIP_SWITCH_BODY), 'wording names the day trips');

  await user.click(screen.getByRole('button', { name: 'Keep my trip' }));
  assert.equal(screen.queryByText('Switch to a different route'), null, 'confirm closed');
  assert.ok(screen.getByText('Day trip: Nikko'), 'day trip still there');
  const t2 = await savedTrip(M, user);
  assert.equal(M.tripFingerprint(t2), M.tripFingerprint(t1), 'trip identical after "Keep my trip"');

  await user.click(routeAlternativeButtons()[0]);
  await screen.findByText('Switch to a different route');
  await user.click(screen.getByRole('button', { name: 'Switch route' }));
  await screen.findByText('Route changed');
  assert.equal(screen.queryByText('Day trip: Nikko'), null, 'the day trip did not carry over');
  assert.equal(screen.queryByText('Undo last change'), null, 'a rebuild has no history');
});

test('C4b: Refine with a day trip selected confirms first; "Keep my trip" keeps the trip identical; "Rebuild" rebuilds it', async () => {
  const { user } = await mountAndBuildViaIntake(M, { destination: 'Japan', totalDays: 10 });
  await addDayTrip(user, 'Tokyo', 'Nikko');
  const t1 = await savedTrip(M, user);

  await openRefineAndApply(user);
  assert.ok(await screen.findByText('Refine your trip'), 'confirm appears before the rebuild');
  assert.ok(screen.getByText(REFINE_BODY_DAY_TRIPS), 'wording names edits and day trips');

  await user.click(screen.getByRole('button', { name: 'Keep my trip' }));
  assert.equal(screen.queryByText('Refine your trip'), null, 'confirm closed');
  assert.ok(screen.getByText('Day trip: Nikko'), 'day trip still there');
  assert.ok(screen.getByText('Undo last change'), 'edit history still there');
  const t2 = await savedTrip(M, user);
  assert.equal(M.tripFingerprint(t2), M.tripFingerprint(t1), 'trip identical after "Keep my trip"');

  await openRefineAndApply(user);
  await screen.findByText('Refine your trip');
  await user.click(screen.getByRole('button', { name: 'Rebuild' }));
  assert.equal(screen.queryByText('Refine your trip'), null, 'confirm closed');
  assert.ok(screen.getByText('Your trip at a glance'), 'trip rebuilt');
  assert.equal(screen.queryByText('Day trip: Nikko'), null, 'day trip gone after the rebuild');
  assert.equal(screen.queryByText('Undo last change'), null, 'edits gone after the rebuild');
});

test('C4b: Refine with no edits and no day trips rebuilds straight away, with no dialog', async () => {
  const { user } = await mountAndBuildViaIntake(M, { destination: 'Japan', totalDays: 10 });
  await openRefineAndApply(user);
  assert.equal(screen.queryByText('Refine your trip'), null, 'no dialog on the common path');
  assert.equal(screen.queryByText('Make it yours'), null, 'refine sheet closed');
  assert.ok(screen.getByText('Your trip at a glance'), 'trip rebuilt');
});

test('C4b: Refine after only an edit (no day trips) confirms with the edits-only wording', async () => {
  const { user } = await mountAndChooseCore(M, { destination: 'Japan', totalDays: 10 });
  await user.click(screen.getByRole('button', { name: '8 nights' }));
  await user.click(await screen.findByText('More time here (+1 night)'));
  await user.click((await screen.findAllByRole('button', { name: 'Use this plan' }))[0]);
  await screen.findByText('Trip updated');
  await openRefineAndApply(user);
  assert.ok(await screen.findByText('Refine your trip'));
  assert.ok(screen.getByText(REFINE_BODY_EDITS), 'edits-only wording');
  assert.equal(screen.queryByText(/day trips/), null, 'does not mention day trips that do not exist');
});

test('C4b: a reloaded draft with a day trip (empty history) still confirms before Refine rebuilds it', async () => {
  const base = M.buildFilledTrip(japanSpec(10), M.PILOT_DATA, { reviewPolicy: 'allow_drafts' });
  const preview = R.previewAddExcursion(base, 'tokyo_base', 'nikko');
  assert.equal(preview.ok, true);
  const withDayTrip = R.applyProposal(base, preview.proposals[0]).trip;

  const { user } = await mountWithSavedTrip(M, withDayTrip);
  assert.equal(screen.queryByText('Undo last change'), null, 'history is empty after a reload');
  const t1 = await savedTrip(M, user);
  assert.deepEqual(t1.routePlan.stops.find((s) => s.key === 'tokyo_base').selectedExcursionIds, ['nikko'], 'the reloaded trip carries its day trip');

  await openRefineAndApply(user);
  assert.ok(await screen.findByText('Refine your trip'), 'confirm appears even with no history');
  await user.click(screen.getByRole('button', { name: 'Keep my trip' }));
  assert.ok(screen.getByText('Day trip: Nikko'), 'still there');
  const t2 = await savedTrip(M, user);
  assert.equal(M.tripFingerprint(t2), M.tripFingerprint(t1), 'trip identical after "Keep my trip"');
});
