// E3c C1: the traveller-facing day-trip picker on the real page (real clicks,
// queried by visible text). Japan is the only family with day-trip menus today.
import { mountAndChooseCore } from './helpers/f5Flows.js';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { loadDoor2PlanModule, teardown } from './helpers/domHarness.js';
import {
  addDayTrip,
  contentIds,
  dayTripHeadings,
  dayTripSection,
  exBlockIds,
  glanceDayTripRow,
  menuRow,
  savedTrip,
} from './helpers/dayTrips.js';

const M = await loadDoor2PlanModule();
after(teardown);
const { screen, within } = await import('@testing-library/react');

test('C1a: Japan 10 days offers Nikko and Kamakura from the Tokyo base, nothing chosen; adding Nikko goes through the preview card and lands in the itinerary and the glance', async () => {
  const { user } = await mountAndChooseCore(M, { destination: 'Japan', totalDays: 10 });

  assert.deepEqual(dayTripHeadings(), ['+ Add a day trip from Tokyo'], 'one section, for the one base with a menu');
  const section = dayTripSection('Tokyo');
  const rows = within(section).getAllByRole('button').map((b) => b.textContent);
  assert.equal(rows.length, 2, 'two rows');
  assert.match(rows[0], /^Nikko/, 'menu order: Nikko first');
  assert.match(rows[1], /^Kamakura/, 'then Kamakura');
  assert.match(rows[0], /About 4 hours there, plus travel/, 'hours on site, not a round trip');
  assert.match(rows[1], /About 6 hours there, plus travel/);
  assert.ok(within(section).getByText('Nothing is added until you choose it.'));
  assert.equal(screen.queryAllByText(/^Day trip: /).length, 0, 'nothing preselected');
  assert.ok(!document.body.textContent.includes('Tokyo → Nikko'), 'no Nikko leg before adding');

  await user.click(menuRow('Tokyo', 'Nikko'));
  assert.ok(await screen.findByText('How this would look'), 'the existing preview sheet');
  assert.ok(screen.getByText('Add a day trip to Nikko'), 'card header');
  assert.ok(screen.getByText('Adds a day trip to Nikko.'), 'the diff line (C5 on the page)');
  assert.ok(screen.getByRole('button', { name: 'Use this plan' }));
  assert.ok(screen.getByRole('button', { name: 'Keep my trip' }));
  assert.ok(!screen.queryByText(/^Day trip: /), 'nothing applied while previewing');

  await user.click(screen.getByRole('button', { name: 'Use this plan' }));
  assert.ok(screen.getByText('Day trip: Nikko'), 'glance shows the day trip');
  assert.ok(document.body.textContent.includes('Tokyo → Nikko'), 'the itinerary shows the Nikko day');
  assert.ok(screen.getByText('Undo last change'), 'undo covers it');
  const remaining = within(dayTripSection('Tokyo')).getAllByRole('button').map((b) => b.textContent);
  assert.equal(remaining.length, 1, 'only Kamakura left to add');
  assert.match(remaining[0], /^Kamakura/);
});

test('C1a (hub): with the Kyoto spur, Tokyo base and Kyoto each get a section and the 1-night Tokyo hub gets none', async () => {
  const { user } = await mountAndChooseCore(M, { destination: 'Japan', totalDays: 10 });
  await user.click(screen.getAllByRole('button').find((b) => b.textContent === 'KyotoAdd'));
  await user.click(await screen.findByRole('button', { name: 'Add Kyoto' }));
  await user.click((await screen.findAllByRole('button', { name: 'Use this plan' }))[0]);
  await screen.findByText('Trip updated');

  assert.deepEqual(
    dayTripHeadings(),
    ['+ Add a day trip from Tokyo', '+ Add a day trip from Kyoto'],
    'Tokyo appears once (base only, not the hub), then Kyoto'
  );
  const kyotoRows = within(dayTripSection('Kyoto')).getAllByRole('button').map((b) => b.textContent);
  assert.match(kyotoRows[0], /^Nara/);
  assert.match(kyotoRows[1], /^Osaka/);

  // Removing the spur while a Kyoto day trip is chosen says so before confirming (C5 on the page).
  await addDayTrip(user, 'Kyoto', 'Nara');
  await user.click(screen.getByRole('button', { name: '2 nights' }));
  await user.click(await screen.findByText('Remove Kyoto from your trip'));
  assert.ok(await screen.findByText('Your day trip to Nara goes with it.'), 'the preview names the day trip that goes');
  assert.ok(screen.getByText('Day trip: Nara'), 'nothing applied yet');
});

test('C1b: Remove previews and waits; "Keep my trip" leaves the trip identical; "Use this plan" removes it and the displaced activity comes back', async () => {
  const { user } = await mountAndChooseCore(M, { destination: 'Japan', totalDays: 10 });
  const t0 = await savedTrip(M, user);
  await addDayTrip(user, 'Tokyo', 'Nikko');
  const t1 = await savedTrip(M, user);
  assert.ok(exBlockIds(t1).length > 0, 'the day trip has its ex: blocks');
  const displaced = [...contentIds(t0)].filter((id) => !contentIds(t1).has(id));
  assert.ok(displaced.length > 0, 'adding displaced at least one activity');

  await user.click(within(glanceDayTripRow('Nikko')).getByRole('button', { name: 'Remove' }));
  assert.ok(await screen.findByText('Remove the day trip to Nikko'), 'removal preview card');
  assert.ok(screen.getByText('Day trip: Nikko'), 'still there while the preview is open');
  await user.click(screen.getByRole('button', { name: 'Keep my trip' }));
  assert.equal(screen.queryByText('Remove the day trip to Nikko'), null, 'preview closed');

  const t2 = await savedTrip(M, user);
  assert.equal(M.tripFingerprint(t2), M.tripFingerprint(t1), 'trip unchanged after "Keep my trip"');
  assert.deepEqual(exBlockIds(t2), exBlockIds(t1), 'ex: blocks still present');

  await user.click(within(glanceDayTripRow('Nikko')).getByRole('button', { name: 'Remove' }));
  await screen.findByText('Remove the day trip to Nikko');
  await user.click(screen.getByRole('button', { name: 'Use this plan' }));
  assert.equal(screen.queryByText('Day trip: Nikko'), null, 'gone from the glance');

  const t3 = await savedTrip(M, user);
  assert.deepEqual(exBlockIds(t3), [], 'ex: blocks gone');
  for (const id of displaced) assert.ok(contentIds(t3).has(id), `displaced activity ${id} is back`);
});
