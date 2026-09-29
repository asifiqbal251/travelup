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
