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

const queryAlts = () =>
  screen.queryAllByRole('button').filter((b) => /Peru classic/.test(b.textContent) && /stops/.test(b.textContent));

test('B8a: switching route with no edits applies with no confirm prompt', async () => {
  // 14 days: at 10 days no alternative fits, so none is offered (see B8c).
  const { user } = await mountAndBuildPeruViaIntake(M, { totalDays: 14 });

  const altButtons = queryAlts();
  assert.ok(altButtons.length > 0, 'at least one route alternative offered');
  await user.click(altButtons[0]);

  assert.ok(screen.queryByText('Switch to this route?') === null, 'no confirm prompt when there are no edits');
  await screen.findByText('Route changed');
  assert.ok(screen.queryByText(/can't be built yet/) === null, 'trip still valid after switching');
});

test('B8c: at 10 days every offered alternative builds when clicked', async () => {
  const { user: first } = await mountAndBuildPeruViaIntake(M, { totalDays: 10 });
  // At 10 days no alternative currently fits, so count may be 0 (offering
  // none is correct). Anything that IS offered must build when clicked.
  const count = queryAlts().length;

  for (let i = 0; i < count; i++) {
    const { user } = i === 0 ? { user: first } : await mountAndBuildPeruViaIntake(M, { totalDays: 10 });
    const btns = queryAlts();
    assert.ok(btns.length === count, `same alternatives on fresh build (${btns.length} vs ${count})`);
    await user.click(btns[i]);
    await screen.findByText('Route changed');
    assert.ok(screen.queryByText(/can't be built yet/) === null, `alternative #${i} builds at 10 days`);
  }
});

test('B8c: at 14 days alternatives are still offered (filter does not hide everything)', async () => {
  await mountAndBuildPeruViaIntake(M, { totalDays: 14 });
  assert.ok(queryAlts().length > 0, 'alternatives offered at 14 days');
});
