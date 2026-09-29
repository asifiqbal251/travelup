// C3b flows F4–F6: a direction switch after an edit, adding an optional on a
// reversed trip, and Peru still working beside Canada. F1–F3 are in
// flowCanadaA.test.js.
//
// Absence is asserted with assert.ok(x === null, msg), never
// assert.equal(node, null): see flowRouteSwitchA.test.js.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { loadDoor2PlanModule, mountAndBuildViaIntake, teardown } from './helpers/domHarness.js';

const M = await loadDoor2PlanModule();
after(teardown);
const { screen } = await import('@testing-library/react');

const glanceCard = () => screen.getByText('Your trip at a glance').closest('div');
const glanceStops = () => [...glanceCard().querySelectorAll('span.text-base.font-semibold')].map((s) => s.textContent);
const reverseButton = () => {
  const heading = screen.getByText('Another way to do this trip');
  return [...heading.parentElement.querySelectorAll('button')].find((b) => b.textContent.startsWith('Québec City to Toronto ·'));
};
/** Everything the page shows, minus the transient toast. */
const pageText = () => document.body.textContent.replace(/Swapped/g, '');

function nightsButtonFor(placeName) {
  const nameSpan = screen.getAllByText(placeName).find((n) => n.tagName === 'SPAN');
  return nameSpan.parentElement.querySelector('button');
}

test('F4: after an edit, switching direction asks first; "Keep my trip" changes nothing, "Switch route" rebuilds', async () => {
  const { user } = await mountAndBuildViaIntake(M, { destination: 'Canada', totalDays: 10 });
  await user.click(screen.getAllByText('Swap')[0]);
  await screen.findByText('Swapped');
  const before = pageText();

  await user.click(reverseButton());
  assert.ok(await screen.findByText('Switch to this route?'), 'confirm sheet appears after an edit');
  await user.click(screen.getByRole('button', { name: 'Keep my trip' }));
  assert.ok(screen.queryByText('Switch to this route?') === null, 'sheet closes');
  assert.ok(screen.getByText('Undo last change'), 'the edit is still there');
  assert.equal(pageText(), before, 'trip identical to before the switch attempt');
  assert.deepEqual(glanceStops(), ['Toronto', 'Montréal', 'Québec City']);

  await user.click(reverseButton());
  assert.ok(await screen.findByText('Switch to this route?'), 'asked again on the second attempt');
  await user.click(screen.getByRole('button', { name: 'Switch route' }));
  await screen.findByText('Route changed');
  assert.ok(screen.queryByText('Undo last change') === null, 'rebuild cleared the history');
  assert.ok(screen.queryByText(/can't be built yet/) === null, 'trip valid');
  assert.deepEqual(glanceStops(), ['Québec City', 'Montréal', 'Toronto'], 'now the reverse direction');
});

test('F5: on a reversed trip, adding Ottawa puts it between Montréal and Toronto and keeps the direction', async () => {
  const { user } = await mountAndBuildViaIntake(M, { destination: 'Canada', totalDays: 10 });
  await user.click(reverseButton());
  await screen.findByText('Route changed');
  assert.deepEqual(glanceStops(), ['Québec City', 'Montréal', 'Toronto']);

  await user.click(await screen.findByText('Ottawa'));
  await user.click(await screen.findByText('Add Ottawa'));
  const after = screen.getByText('After').closest('div').textContent;
  assert.match(after, /Québec City.*Montréal.*Ottawa.*Toronto/, 'proposal shows Ottawa on the reversed corridor');
  await user.click((await screen.findAllByText('Use this plan'))[0]);
  await screen.findByText('Trip updated');

  assert.ok(screen.queryByText(/can't be built yet/) === null, 'trip valid');
  assert.deepEqual(glanceStops(), ['Québec City', 'Montréal', 'Ottawa', 'Toronto'], 'Ottawa added, still Québec City to Toronto');
});

test('F6: Peru still builds from intake, and Huaraz can be added and removed', async () => {
  const { user } = await mountAndBuildViaIntake(M, { destination: 'Peru', totalDays: 10 });
  assert.ok(screen.queryByText(/can't be built yet/) === null, 'Peru builds');
  assert.equal(glanceStops()[0], 'Lima');

  await user.click(await screen.findByText('Huaraz & the Cordillera Blanca'));
  await user.click(await screen.findByText('Add Huaraz & the Cordillera Blanca'));
  await user.click((await screen.findAllByText('Use this plan'))[0]);
  await screen.findByText('Trip updated');
  assert.ok(glanceStops().includes('Huaraz'), 'Huaraz added');
  assert.ok(screen.queryByText(/can't be built yet/) === null, 'trip valid with Huaraz');

  await user.click(nightsButtonFor('Huaraz'));
  await user.click(await screen.findByText(/Remove Huaraz.*from your trip/));
  await user.click((await screen.findAllByText('Use this plan'))[0]);
  await screen.findByText('Trip updated');
  assert.ok(!glanceStops().includes('Huaraz'), 'Huaraz removed');
  assert.ok(screen.queryByText(/can't be built yet/) === null, 'trip valid after removal');
});

// ADR-002 graduation question 1: does reconciliation by stable block id hold for a
// MID-ROUTE insertion? B12a/c use a nights change and B12b a removal; F5 adds Ottawa
// to a trip with no prior edit, so nothing was at risk. Here an edit already exists
// at a stop the insertion does not touch.
const sectionOf = (placeName) => {
  const h3 = screen.getAllByRole('heading', { level: 3 }).find((h) => h.textContent.startsWith(`${placeName} ·`));
  assert.ok(h3, `${placeName} section is on the page`);
  return h3.parentElement;
};
/** Activity titles at one stop, in page order. */
const titlesAt = (placeName) =>
  [...sectionOf(placeName).querySelectorAll('button')]
    .filter((b) => b.textContent === 'Swap')
    .map((b) => b.parentElement.querySelector('p.font-medium').textContent);

test('F7: an activity swapped at Québec City survives adding Ottawa mid-route; undoing both restores the original byte-identical', async () => {
  const { user } = await mountAndBuildViaIntake(M, { destination: 'Canada', totalDays: 10 });
  assert.deepEqual(glanceStops(), ['Toronto', 'Montréal', 'Québec City']);
  const strip = (t) => { const { history, ...rest } = t; return rest; };

  await user.click(screen.getByRole('button', { name: 'Save' }));
  const original = M.listDraftTrips()[0].trip;
  const beforeTitles = titlesAt('Québec City');
  assert.ok(beforeTitles.length > 0, 'Québec City has activities to swap');

  // Swap the first Québec City activity: Ottawa's insertion (between Toronto and Montréal) does not touch that stop.
  await user.click([...sectionOf('Québec City').querySelectorAll('button')].find((b) => b.textContent === 'Swap'));
  await screen.findByText('Swapped');
  const swappedTitles = titlesAt('Québec City');
  assert.notEqual(swappedTitles[0], beforeTitles[0], 'the swap changed the first Québec City activity');

  await user.click(await screen.findByText('Ottawa'));
  await user.click(await screen.findByText('Add Ottawa'));
  await user.click((await screen.findAllByText('Use this plan'))[0]);
  await screen.findByText('Trip updated');
  assert.ok(screen.queryByText(/can't be built yet/) === null, 'trip valid after the insertion');
  assert.deepEqual(glanceStops(), ['Toronto', 'Ottawa', 'Montréal', 'Québec City'], 'Ottawa sits mid-route');

  const afterTitles = titlesAt('Québec City');
  assert.equal(afterTitles[0], swappedTitles[0], `the swapped Québec City activity "${swappedTitles[0]}" must survive the insertion (got "${afterTitles[0]}")`);
  // The insertion takes a night from Québec City (2 to 1), so its later block goes; the swapped first block is the one that must remain.
  assert.ok(afterTitles.length <= swappedTitles.length, 'the insertion cannot add Québec City content');

  await user.click(screen.getByText('Undo last change'));
  await screen.findByText('Undone');
  await user.click(screen.getByText('Undo last change'));
  await screen.findByText('Undone');
  await user.click(screen.getByRole('button', { name: 'Save' }));
  const restored = M.listDraftTrips()[0].trip;
  assert.deepEqual(strip(restored), strip(original), 'byte-identical to before the swap and the insertion');
});

// H7: the route-switch warning is not just for swaps; a structural edit puts history in the same state.
test('F4b: after a structural edit (adding Ottawa), switching direction also asks first', async () => {
  const { user } = await mountAndBuildViaIntake(M, { destination: 'Canada', totalDays: 10 });
  await user.click(await screen.findByText('Ottawa'));
  await user.click(await screen.findByText('Add Ottawa'));
  await user.click((await screen.findAllByText('Use this plan'))[0]);
  await screen.findByText('Trip updated');
  assert.deepEqual(glanceStops(), ['Toronto', 'Ottawa', 'Montréal', 'Québec City']);

  await user.click(reverseButton());
  assert.ok(await screen.findByText('Switch to this route?'), 'confirm sheet appears after a structural edit');
  await user.click(screen.getByRole('button', { name: 'Keep my trip' }));
  assert.deepEqual(glanceStops(), ['Toronto', 'Ottawa', 'Montréal', 'Québec City'], 'Keep my trip changes nothing');
  assert.ok(screen.getByText('Undo last change'), 'the edit is still there');
});
