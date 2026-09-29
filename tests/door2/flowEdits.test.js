// B4 (bounded edits) and B5 (nights) — driven through the real Door2Plan page.
//
// Pin/unpin has no UI in Door2Plan.jsx (edit.js exports pinActivity/
// unpinActivity, but the page never calls them), so B4's pin + blocked-swap
// steps are dropped here per the Peru-freeze decision (no new UI). The
// blocked-swap-on-pinned behaviour is already covered at the engine level by
// edit.test.js's "E4: pinActivity then swapActivity returns block_locked".
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { loadDoor2PlanModule, mountWithBuiltTrip, peruSpec, teardown } from './helpers/domHarness.js';

const M = await loadDoor2PlanModule();
after(teardown);
const { screen, within } = await import('@testing-library/react');

test('B4: two swaps through the page, then undo x2, restores the original trip (fingerprint + deep equality excluding history)', async () => {
  const spec = peruSpec({ totalDays: 10 });
  const { user, trip: originalTrip } = await mountWithBuiltTrip(M, spec);
  const scr = screen;

  const swapButtons = () => scr.getAllByText('Swap');
  assert.ok(swapButtons().length >= 2, 'trip has at least two activity blocks to swap');

  await user.click(swapButtons()[0]);
  await scr.findByText('Swapped');
  await user.click(swapButtons()[0]);
  await scr.findByText('Swapped');

  assert.ok(await scr.findByText('Undo last change'), 'undo control appears after edits');
  await user.click(scr.getByText('Undo last change'));
  await scr.findByText('Undone');
  await user.click(scr.getByText('Undo last change'));
  await scr.findByText('Undone');

  assert.equal(scr.queryByText('Undo last change'), null, 'undo control disappears once history is exhausted (fully rewound)');

  // Save the fully-undone trip and read it back to compare against the pristine build.
  await user.click(scr.getByRole('button', { name: 'Save' }));
  const saved = M.listDraftTrips()[0].trip;

  assert.equal(M.tripFingerprint(saved), M.tripFingerprint(originalTrip), 'fingerprint matches the pristine build');
  const strip = (t) => { const { history, ...rest } = t; return rest; };
  assert.deepEqual(strip(saved), strip(originalTrip), 'trip is byte-identical to the original with history excluded');
});

test('B5: nights +1 on a stop -> proposal matches what is applied -> undo restores the original', async () => {
  const spec = peruSpec({ totalDays: 10 });
  const { user, trip: originalTrip } = await mountWithBuiltTrip(M, spec);
  const scr = screen;

  await user.click(scr.getByText('3 nights')); // Cusco chip on the "trip at a glance" panel
  await user.click(await scr.findByText('More time here (+1 night)'));

  const proposalCards = await scr.findAllByText('Use this plan');
  assert.ok(proposalCards.length > 0, 'at least one proposal is shown');

  // The preview's own diff should say Cusco goes from 3 to 4 nights.
  const sheetText = scr.getByText('How this would look').closest('div').parentElement.textContent;
  assert.match(sheetText, /Cusco/);
  assert.match(sheetText, /4 nights/, 'proposal preview shows the new night count');

  await user.click(proposalCards[0]);
  await scr.findByText('Trip updated');

  const afterNights = scr.getByText(/\d+ days ·/).textContent;
  assert.match(afterNights, /Cusco 4 nights/, 'applied trip matches the previewed night count');

  await user.click(scr.getByText('Undo last change'));
  await scr.findByText('Undone');
  const restoredNights = scr.getByText(/\d+ days ·/).textContent;
  assert.match(restoredNights, /Cusco 3 nights/, 'undo restores the original night count');
});
