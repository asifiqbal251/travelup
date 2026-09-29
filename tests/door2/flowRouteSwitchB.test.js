// B8b (route switch after an edit -> F6 confirm) — see flowRouteSwitchA.test.js.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { loadDoor2PlanModule, mountAndBuildPeruViaIntake, teardown } from './helpers/domHarness.js';

const M = await loadDoor2PlanModule();
after(teardown);
const { screen } = await import('@testing-library/react');

function nightsButtonFor(placeName) {
  const nameSpan = screen.getAllByText(placeName).find((n) => n.tagName === 'SPAN');
  return nameSpan.parentElement.querySelector('button');
}

test('B8b: switching route after an edit shows the F6 confirm; "Keep my trip" preserves edits, "Switch route" discards them', async () => {
  // (1) content edit + "Keep my trip"
  {
    const { user } = await mountAndBuildPeruViaIntake(M, { totalDays: 10 });
    await user.click(screen.getAllByText('Swap')[0]);
    await screen.findByText('Swapped');
    const beforeGlance = screen.getByText('Your trip at a glance').closest('div').textContent;

    const altButtons = screen.getAllByRole('button').filter((b) => /Peru classic/.test(b.textContent) && /stops/.test(b.textContent));
    await user.click(altButtons[0]);

    assert.ok(await screen.findByText('Switch to this route?'), 'F6 confirm appears after a content edit');
    await user.click(screen.getByRole('button', { name: 'Keep my trip' }));
    assert.equal(screen.queryByText('Switch to this route?'), null, 'prompt closes');
    assert.ok(screen.getByText('Undo last change'), 'edit is still intact');
    const afterGlance = screen.getByText('Your trip at a glance').closest('div').textContent;
    assert.equal(afterGlance, beforeGlance, 'trip byte-identical to before the switch attempt');
  }

  // (2) structural edit + "Switch route"
  {
    const { user } = await mountAndBuildPeruViaIntake(M, { totalDays: 10 });
    await user.click(nightsButtonFor('Cusco'));
    await user.click(await screen.findByText('More time here (+1 night)'));
    await user.click((await screen.findAllByText('Use this plan'))[0]);
    await screen.findByText('Trip updated');
    assert.ok(screen.getByText('Undo last change'), 'structural edit recorded');

    const altButtons = screen.getAllByRole('button').filter((b) => /Peru classic/.test(b.textContent) && /stops/.test(b.textContent));
    await user.click(altButtons[0]);
    assert.ok(await screen.findByText('Switch to this route?'), 'F6 confirm appears after a structural edit too');
    await user.click(screen.getByRole('button', { name: 'Switch route' }));

    await screen.findByText('Route changed');
    assert.equal(screen.queryByText('Undo last change'), null, 'edits gone: rebuild has no history');
  }
});
