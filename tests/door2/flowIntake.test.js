// B1 (intake -> build), B2 (duration_too_short recovery), B3 (required-place
// conflict recovery) and B11 (NYC/Tokyo smoke) — driven through the real
// Door2Plan page.
import { japanSpec } from './helpers/dayTrips.js';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { loadDoor2PlanModule, mountDoor2Plan, mountWithBuiltTrip, teardown } from './helpers/domHarness.js';

const M = await loadDoor2PlanModule();
after(teardown);
const { screen } = await import('@testing-library/react');
const userEvent = (await import('@testing-library/user-event')).default;

async function setDays(user, target) {
  let current = Number(screen.getByText(/\d+ days/).textContent.match(/\d+/)[0]);
  while (current < target) {
    await user.click(screen.getByRole('button', { name: '+' }));
    current += 1;
  }
  while (current > target) {
    await user.click(screen.getByRole('button', { name: '−' }));
    current -= 1;
  }
}

test('B1: Intake -> build (Peru, October, 10 days, couple)', async () => {
  const M2 = await loadDoor2PlanModule();
  await mountDoor2Plan(M2);
  const user = userEvent.setup();

  await user.click(await screen.findByText('Peru'));
  await user.click(await screen.findByText('October'));
  await setDays(user, 10);
  await user.click(screen.getByText('Couple'));
  await user.click(screen.getByRole('button', { name: 'Build my trip' }));

  assert.ok(await screen.findByText('Peru'), 'heading shows Peru');
  assert.match(screen.getByText(/\d+ days ·/).textContent, /^10 days ·/, '10 days shown');

  const glance = screen.getByText('Your trip at a glance').closest('div');
  const text = glance.textContent;
  assert.match(text, /Lima/);
  assert.match(text, /2 nights/);
  assert.match(text, /Cusco/);
  assert.match(text, /3 nights/);
  assert.match(text, /Aguas Calientes/);
  assert.match(text, /1 night(?!s)/);

  assert.ok(screen.queryByText(/can't be built yet/) === null, 'no failure panel');
  assert.ok(screen.queryByText(/Nothing curated for this slot/) === null, 'no content gaps');
  assert.ok(screen.queryByText(/Draft data/) === null, 'no stale-data banner (reviewed pilot data)');
  assert.ok(
    screen.getByText('Pilot preview — Peru and Eastern Canada itineraries. Other destinations are limited or not yet available.'),
    'footer names both pilot regions'
  );
});

test('B2: duration_too_short at 5 days offers "Add 3 days", which yields a valid 8-day trip', async () => {
  await mountDoor2Plan(M);
  const user = userEvent.setup();

  await user.click(await screen.findByText('Peru'));
  await setDays(user, 5);
  await user.click(screen.getByRole('button', { name: 'Build my trip' }));

  assert.ok(await screen.findByText(/can't be built yet/), 'failure panel shown');
  const addBtn = screen.getByRole('button', { name: /Add 3 days/ });
  await user.click(addBtn);

  assert.ok(await screen.findByText('Your trip at a glance'), 'trip built after extending');
  assert.match(screen.getByText(/\d+ days ·/).textContent, /^8 days ·/, '8-day trip');
  assert.ok(screen.queryByText(/can't be built yet/) === null, 'no more failure panel');
});

test('B3: required_place_conflict (Huaraz + Machu Picchu, 9 days) offers both remedies', async () => {
  await mountDoor2Plan(M);
  const user = userEvent.setup();

  await user.click(await screen.findByText('Peru'));
  await setDays(user, 9);
  await user.click(screen.getByRole('button', { name: 'Build my trip' }));
  await screen.findByText('Your trip at a glance');

  // Refine: require both Huaraz and Machu Picchu (Ollantaytambo carries the Machu Picchu excursion).
  await user.click(screen.getByRole('button', { name: 'Refine' }));
  await screen.findByText('Must include');
  await user.click(screen.getByRole('button', { name: 'Huaraz' }));
  await user.click(screen.getByRole('button', { name: 'Machu Picchu' }));
  await user.click(screen.getByRole('button', { name: 'Apply and rebuild' }));

  assert.ok(await screen.findByText(/can't be built yet/), 'required-place conflict surfaced as a failure');
  assert.ok(screen.getByRole('button', { name: /Add 2 days/ }), '"Add 2 days" offered');
  const dropBtn = screen.getByRole('button', { name: /Drop Huaraz/ });
  assert.ok(dropBtn, '"Drop Huaraz" offered');

  await user.click(dropBtn);
  await screen.findByText('Your trip at a glance');
  assert.match(screen.getByText(/\d+ days ·/).textContent, /^9 days ·/, 'still 9 days');
  const itinerarySummary = screen.getByText(/\d+ days ·/).textContent;
  assert.doesNotMatch(itinerarySummary, /Huaraz/, 'Huaraz dropped from the itinerary (may still be offered as an addable place)');
});

test('B3b: "Add 2 days" yields a valid trip 2 days longer, with both places kept', async () => {
  await mountDoor2Plan(M);
  const user = userEvent.setup();

  await user.click(await screen.findByText('Peru'));
  await setDays(user, 9);
  await user.click(screen.getByRole('button', { name: 'Build my trip' }));
  await screen.findByText('Your trip at a glance');

  await user.click(screen.getByRole('button', { name: 'Refine' }));
  await screen.findByText('Must include');
  await user.click(screen.getByRole('button', { name: 'Huaraz' }));
  await user.click(screen.getByRole('button', { name: 'Machu Picchu' }));
  await user.click(screen.getByRole('button', { name: 'Apply and rebuild' }));

  await screen.findByText(/can't be built yet/);
  await user.click(screen.getByRole('button', { name: /Add 2 days/ }));

  await screen.findByText('Your trip at a glance');
  assert.match(screen.getByText(/\d+ days ·/).textContent, /^11 days ·/, '9 + 2 = 11 days');
  const glanceText = screen.getByText('Your trip at a glance').closest('div').textContent;
  assert.match(glanceText, /Huaraz/, 'Huaraz kept');
});

test('B11a: NYC (US) builds a valid trip', async () => {
  await mountDoor2Plan(M);
  const user = userEvent.setup();
  await user.click(await screen.findByText('United States'));
  await user.click(screen.getByRole('button', { name: 'Build my trip' }));
  await screen.findByText('Your trip at a glance');
  assert.ok(screen.queryByText(/can't be built yet/) === null, 'NYC builds');
});

// Also J13 (E3b): the same build on the Japan family with its Kyoto spur and day-trip
// menus. Nothing is preselected, so the page shows the Tokyo-only trip.
test('B11b: Tokyo 10 days builds with no content gaps (E5-4)', async () => {
  await mountDoor2Plan(M);
  const user = userEvent.setup();
  await user.click(await screen.findByText('Japan'));
  await setDays(user, 10);
  await user.click(screen.getByRole('button', { name: 'Build my trip' }));
  await screen.findByText('Your trip at a glance');
  assert.ok(screen.queryByText(/can't be built yet/) === null, 'Tokyo builds (no thrown/failure)');
  const gaps = screen.queryAllByText(/Nothing curated for this slot yet/);
  assert.equal(gaps.length, 0, 'no content gaps after the E5-4 content pass');
});

// F5 no longer creates stretched Tokyo-only defaults; preserve the historical
// two-gap presentation check by opening that exact older trip through Continue.
test('B11c: saved Tokyo-only 18 days honestly shows its 2 known content gaps', async () => {
  await mountWithBuiltTrip(M, japanSpec(18));
  await screen.findByText('Your trip at a glance');
  assert.ok(screen.queryByText(/can't be built yet/) === null, 'Tokyo builds (no thrown/failure)');
  const gaps = screen.queryAllByText(/Nothing curated for this slot yet/);
  assert.equal(gaps.length, 2, 'exactly 2 honestly-shown content gaps, never hidden or papered over');
});
