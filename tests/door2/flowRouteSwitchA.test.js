// B8a (route switch, no edits) — see flowStructure.test.js's header comment:
// running B8a and B8b as two `test()` entries in the same process reliably
// hangs this jsdom+esbuild harness (each is fine alone or combined into a
// single test() body). Kept as separate files so each gets its own process.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { loadDoor2PlanModule, mountAndBuildPeruViaIntake, teardown } from './helpers/domHarness.js';

const M = await loadDoor2PlanModule();
after(teardown);
const { screen } = await import('@testing-library/react');

test('B8a: switching route with no edits applies with no confirm prompt', async () => {
  const { user } = await mountAndBuildPeruViaIntake(M, { totalDays: 10 });

  const altButtons = screen.getAllByRole('button').filter((b) => /Peru classic/.test(b.textContent) && /stops/.test(b.textContent));
  assert.ok(altButtons.length > 0, 'at least one route alternative offered');
  await user.click(altButtons[0]);

  assert.equal(screen.queryByText('Switch to this route?'), null, 'no confirm prompt when there are no edits');
  await screen.findByText('Route changed');
  assert.equal(screen.queryByText(/can't be built yet/), null, 'trip still valid after switching');
});
