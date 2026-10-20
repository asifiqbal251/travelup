import { test, after } from 'node:test';
import assert from 'node:assert/strict';

// Q8 packet 2, stage A: the DOM half of the recursive writer barrier — W-7 and W-8 of
// draft 3 §4, driven through the real bundled Door2Plan page with real user clicks.
// The engine and storage half (W-1 to W-6, W-9 to W-11) is in writerBarrier.test.js.
//
// Standing rule 2, the testing gate (docs/adr/README.md): the save flow IS an affected
// user flow for reader-admitted inputs, so both kinds of evidence are required. W-8 is
// the DOM half; H4 (live browser, fixture-seeded, isolated profile) is the owner's.
//
// No page source changes and no new UI: the refusal reuses the existing "Couldn't save"
// message, and W-8 reaches it by clicking the page's own Save button.

import { clearStorage, loadDoor2PlanModule, mountWithBuiltTrip, peruSpec, resetLocation, teardown, window } from './helpers/domHarness.js';

const M = await loadDoor2PlanModule();
after(teardown);
const { render, screen, cleanup } = await import('@testing-library/react');
const userEvent = (await import('@testing-library/user-event')).default;

const KEY = 'door2_drafts_v1';
const DRAFTS = { reviewPolicy: 'allow_drafts' };

test('W-7: the real-page SUCCESSFUL save still works — Save appends a second record and leaves the first exactly as it was', async () => {
  const { user } = await mountWithBuiltTrip(M, peruSpec({ totalDays: 10 }));

  const before = window.localStorage.getItem(KEY);
  assert.equal(JSON.parse(before).length, 1, 'the setup draft is the only record');

  await user.click(screen.getByRole('button', { name: 'Save' }));
  await screen.findByText('Saved');

  const stored = JSON.parse(window.localStorage.getItem(KEY));
  assert.equal(stored.length, 2, 'the page really appended a record');
  assert.deepStrictEqual(stored[0], JSON.parse(before)[0], 'and the original record is untouched — the save is append-only');
  assert.equal(stored[1].envelopeVersion, 2);
  assert.equal(stored[1].trip.versions.schema, 'door2-v7');
  assert.equal(M.loadDraftTrip(stored[1].id).compatible, true, 'what it wrote reopens');
});

test('W-8: the real-page REFUSAL flow — a reader-admitted v7 record carrying a nested reserved key opens, Save is actionable, the existing "Couldn\'t save" message appears, the stored bytes are unchanged and the itinerary stays viewable', async () => {
  cleanup();
  resetLocation('/plan?key=door2');
  clearStorage();

  // The record the ordinary page CAN carry to the writer: a genuine saved v7 envelope,
  // then a reserved key planted on a branch that is neither the root nor history. No
  // current build produces one; the reader admits it, and handleSaveDraft's
  // `{ ...t, history: [] }` closes only the history branch, so `extra` reaches the writer.
  const trip = M.buildFilledTrip(peruSpec({ totalDays: 10 }), M.PILOT_DATA, DRAFTS);
  M.saveDraftTrip(trip, 'Nested identity', 'Peru');
  const list = JSON.parse(window.localStorage.getItem(KEY));
  assert.equal(list.length, 1, 'exactly one seeded record');
  list[0].trip.extra = { nested: [{ identity: { version: 1, used: [], blocks: {}, edits: {} } }] };
  window.localStorage.setItem(KEY, JSON.stringify(list));
  const bytesBefore = window.localStorage.getItem(KEY);

  // It really is reader-admitted, and reading it changes no byte.
  const admitted = M.loadDraftTrip(list[0].id);
  assert.equal(admitted.compatible, true, `the record must OPEN: ${admitted.reason ?? ''}`);
  assert.equal(window.localStorage.getItem(KEY), bytesBefore, 'reading changed nothing');

  render(M.React.createElement(M.MemoryRouter, { initialEntries: ['/plan?key=door2'] }, M.React.createElement(M.Door2Plan)));
  const user = userEvent.setup();

  // THE DRAFT OPENS, through the page's own "Continue".
  await user.click(await screen.findByText('Continue'));
  await screen.findByText('Your trip at a glance');

  // SAVE IS ACTIONABLE. The refusal is the writer's, not a disabled control's.
  const saveButton = screen.getByRole('button', { name: 'Save' });
  assert.equal(saveButton.disabled, false, 'Save is actionable, not disabled');

  // The page's catch logs the diagnosis; capture it rather than letting it print, and
  // assert it names the identity check — which is also how we know which guard fired.
  const logged = [];
  const realError = console.error;
  console.error = (...args) => logged.push(args.map(String).join(' '));
  try {
    await user.click(saveButton);
    await screen.findByText(/Couldn't save/);
  } finally {
    console.error = realError;
  }

  assert.ok(
    logged.some((line) => line.includes('trip not storable (identity: door2-v8)')),
    `the page diagnosed the identity refusal; logged: ${JSON.stringify(logged)}`
  );
  // The EXISTING message, unchanged — no new wording and no new UI.
  assert.ok(screen.getByText("Couldn't save — this trip is missing information needed to reopen it, so nothing was saved."));
  // NO success acknowledgement.
  assert.equal(screen.queryByText('Saved'), null, 'no "Saved" acknowledgement appears');
  // THE BYTES. The original record is exactly as it was.
  assert.equal(window.localStorage.getItem(KEY), bytesBefore, 'the original stored bytes are unchanged');
  assert.equal(JSON.parse(window.localStorage.getItem(KEY)).length, 1, 'and nothing was appended');
  // THE ITINERARY REMAINS VIEWABLE. A refused save is not a broken page.
  assert.ok(screen.getByText('Your trip at a glance'), 'the itinerary is still shown');
  assert.ok(screen.getAllByText(/\d+ days/).length > 0, 'and still describes the trip');
});
