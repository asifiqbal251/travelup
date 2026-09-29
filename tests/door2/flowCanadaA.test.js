// C3b flows F1–F3: Eastern Canada from intake, its route alternatives, and a
// direction switch with no edits. F4–F6 are in flowCanadaB.test.js (split per
// file for the same reason as flowStructure / flowRouteSwitch).
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
/** Place names down the glance card, in trip order (stops with nights only). */
const glanceStops = () => [...glanceCard().querySelectorAll('span.text-base.font-semibold')].map((s) => s.textContent);
const altButtons = () => {
  const heading = screen.queryByText('Another way to do this trip');
  return heading ? [...heading.parentElement.querySelectorAll('button')] : [];
};
const altName = (button) => button.querySelector('span').textContent.split(' · ')[0];
const altStops = (button) => button.querySelectorAll('span')[1].textContent.split(' → ');

test('F1: intake → Canada → 10 days → Build my trip renders a real trip', async () => {
  await mountAndBuildViaIntake(M, { destination: 'Canada', totalDays: 10 });
  assert.ok(screen.queryByText(/can't be built yet/) === null, 'no failure banner');
  assert.deepEqual(glanceStops(), ['Toronto', 'Montréal', 'Québec City'], 'the canonical corridor is the default');
  assert.ok(screen.getByText(/10 days ·/), 'a 10-day itinerary');
});

test('F2: the route alternatives are distinguishable, and each builds when clicked', async () => {
  const first = await mountAndBuildViaIntake(M, { destination: 'Canada', totalDays: 10 });
  const names = altButtons().map(altName);
  assert.ok(names.length > 0, 'alternatives offered at 10 days');
  assert.equal(new Set(names).size, names.length, `no two alternatives share a name: ${names.join(' | ')}`);
  // Each name says which way it runs, and the stops shown under it agree.
  for (const button of altButtons()) {
    const [, from, to] = altName(button).match(/^(.+?) to (.+?)(?:, with .*)?$/) ?? [];
    const stops = altStops(button);
    assert.ok(from && to, `"${altName(button)}" names a direction`);
    assert.equal(stops[0], from, `"${altName(button)}" starts where its name says`);
    assert.equal(stops[stops.length - 1], to, `"${altName(button)}" ends where its name says`);
  }

  for (let i = 0; i < names.length; i++) {
    const { user } = i === 0 ? first : await mountAndBuildViaIntake(M, { destination: 'Canada', totalDays: 10 });
    const button = altButtons().find((b) => altName(b) === names[i]);
    assert.ok(button, `"${names[i]}" offered again on a fresh build`);
    const expected = altStops(button);
    await user.click(button);
    await screen.findByText('Route changed');
    assert.ok(screen.queryByText(/can't be built yet/) === null, `"${names[i]}" builds at 10 days`);
    assert.deepEqual(glanceStops(), expected, `"${names[i]}" is the trip now shown`);
  }
});

test('F3: switching to the reverse direction with no edits applies at once and reverses the stops', async () => {
  const { user } = await mountAndBuildViaIntake(M, { destination: 'Canada', totalDays: 10 });
  const before = glanceStops();
  const reverse = altButtons().find((b) => altName(b) === 'Québec City to Toronto');
  assert.ok(reverse, 'the reverse direction is offered');
  await user.click(reverse);

  assert.ok(screen.queryByText('Switch to this route?') === null, 'no confirm sheet when there are no edits');
  await screen.findByText('Route changed');
  assert.ok(screen.queryByText(/can't be built yet/) === null, 'trip still valid');
  assert.deepEqual(glanceStops(), [...before].reverse(), 'stop order reversed on screen');
  assert.deepEqual(glanceStops(), ['Québec City', 'Montréal', 'Toronto']);
});
