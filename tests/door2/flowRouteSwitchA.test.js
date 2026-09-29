// B8a (route switch, no edits).
//
// Historical note: this file used to hang for ~60s and be SIGKILLed. That was
// NOT a leaked timer or handle. The old assertion `assert.equal(queryByText(...), null)`
// failed (see the totalDays note below), and node:assert then tried to
// build a diff of a jsdom HTMLElement vs null, which walks the whole jsdom
// window object graph and pins the CPU. Never pass a DOM node to
// assert.equal/deepEqual; use assert.ok(x === null, msg) so a failure is fast.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { loadDoor2PlanModule, mountAndBuildPeruViaIntake, teardown } from './helpers/domHarness.js';

const M = await loadDoor2PlanModule();
after(teardown);
const { screen } = await import('@testing-library/react');

test('B8a: switching route with no edits applies with no confirm prompt', async () => {
  // 14 days, not 10: at 10 days both offered "Peru classic ... Huaraz" alternatives
  // (9 stops) rebuild to "This trip can't be built yet / needs more days".
  // That is an app finding, reported separately; this test is about the
  // no-confirm path, so it uses a length where the alternative is buildable.
  const { user } = await mountAndBuildPeruViaIntake(M, { totalDays: 14 });

  const altButtons = screen.getAllByRole('button').filter((b) => /Peru classic/.test(b.textContent) && /stops/.test(b.textContent));
  assert.ok(altButtons.length > 0, 'at least one route alternative offered');
  await user.click(altButtons[0]);

  assert.ok(screen.queryByText('Switch to this route?') === null, 'no confirm prompt when there are no edits');
  await screen.findByText('Route changed');
  assert.ok(screen.queryByText(/can't be built yet/) === null, 'trip still valid after switching');
});
