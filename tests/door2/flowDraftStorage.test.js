// F4 persistence, Stage A.2 — the saved-trips list and Save, driven through the real
// Door2Plan page (build brief docs/build-brief-f4-stage-a2-compat-and-label-2026-10-02.md,
// tests 7–9, plus the §1 round-trip through the page's own Save handler).
// Stage B (docs/build-brief-f4-stage-b-writer-cutover-2026-10-02.md, test 13 and the page
// half of the new refusal tests): the writer cutover, the v5 refusal and the save-message tone.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  loadDoor2PlanModule,
  mountAndBuildPeruViaIntake,
  mountWithBuiltTrip,
  peruSpec,
  resetLocation,
  clearStorage,
  teardown,
  window
} from './helpers/domHarness.js';

const M = await loadDoor2PlanModule();
after(teardown);
const { render, screen, cleanup, within } = await import('@testing-library/react');
const userEvent = (await import('@testing-library/user-event')).default;

const KEY = 'door2_drafts_v1';
const raw = () => window.localStorage.getItem(KEY);
const UNREADABLE_PANEL = "Saved trips couldn't be read from this browser's storage.";
const SAVE_REFUSED = "Couldn't save — saved trips in this browser's storage can't be read, so nothing was changed.";

/** Mount the real page over storage holding exactly these bytes (null: no key). */
function mountOverStorage(bytes) {
  cleanup();
  resetLocation('/plan?key=door2');
  clearStorage();
  if (bytes !== null) window.localStorage.setItem(KEY, bytes);
  render(M.React.createElement(M.MemoryRouter, { initialEntries: ['/plan?key=door2'] }, M.React.createElement(M.Door2Plan)));
  return { user: userEvent.setup() };
}

const PERU = M.buildFilledTrip(peruSpec({ totalDays: 10 }), M.PILOT_DATA, { reviewPolicy: 'allow_drafts' });
const entry = (id, label, savedAt, extra = {}) => ({ id, label, savedAt, trip: { ...PERU, history: [] }, ...extra });
const rowOf = (text) => screen.getByText(text).closest('li');

test('A2.7: the storage-error panel renders when saved trips are unreadable, and the bytes stay', async () => {
  for (const bytes of ['{not json', '{"drafts":[]}', '']) {
    mountOverStorage(bytes);
    assert.ok(await screen.findByText(UNREADABLE_PANEL), JSON.stringify(bytes));
    assert.ok(screen.getByText('My saved trips'));
    assert.equal(screen.queryByRole('button', { name: 'Continue' }), null, 'no rows offered');
    assert.ok(screen.getByText('Peru'), 'the rest of the destination step still renders');
    assert.equal(raw(), bytes, `${JSON.stringify(bytes)} left byte for byte`);
  }
  // Readable storage shows no panel.
  mountOverStorage(JSON.stringify([entry('d_ok', 'Peru, 10 days', '2026-10-01T10:00:00.000Z')]));
  await screen.findByText('Peru, 10 days');
  assert.equal(screen.queryByText(UNREADABLE_PANEL), null);
});

test('A2.8: a draft with an object-valued label does not break the list; good drafts beside it render, open and delete', async () => {
  const bad = entry('d_bad', { name: 'Peru' }, '2026-10-02T10:00:00.000Z');
  const entries = [entry('d_a', 'Good A', '2026-10-03T10:00:00.000Z'), bad, entry('d_b', 'Good B', '2026-10-01T10:00:00.000Z')];
  const bytes = JSON.stringify(entries);
  const { user } = mountOverStorage(bytes);

  assert.ok(await screen.findByText('Good A'));
  assert.ok(screen.getByText('Good B'));
  assert.ok(screen.getByText('Untitled trip'), 'the object label falls back to a string');
  assert.equal(screen.getAllByRole('button', { name: 'Continue' }).length, 3);
  assert.equal(raw(), bytes, 'rendering the list writes nothing');

  await user.click(within(rowOf('Good A')).getByRole('button', { name: 'Delete' }));
  assert.equal(screen.queryByText('Good A'), null, 'deleted from the list');
  assert.deepStrictEqual(JSON.parse(raw()), JSON.parse(JSON.stringify([bad, entries[2]])), 'only Good A removed; the odd entry kept as stored');
  assert.deepStrictEqual(JSON.parse(raw())[0].label, { name: 'Peru' }, 'stored label not normalised');

  await user.click(within(rowOf('Good B')).getByRole('button', { name: 'Continue' }));
  assert.ok(await screen.findByText('Your trip at a glance'), 'a good draft beside it opens');
});

test('A2.9: Save over storage that became unreadable surfaces the storage failure and leaves the bytes unchanged', async () => {
  const { user } = await mountWithBuiltTrip(M, peruSpec({ totalDays: 10 }));
  // Storage was readable when the page mounted, so the mount-time panel never fired;
  // the save itself must find the store unreadable.
  window.localStorage.setItem(KEY, '{not json');
  await user.click(screen.getByRole('button', { name: 'Save' }));
  assert.ok(await screen.findByText(SAVE_REFUSED));
  assert.equal(screen.queryByText('Saved'), null);
  assert.equal(raw(), '{not json', 'original bytes untouched');

  // Once storage reads again, Save works.
  window.localStorage.setItem(KEY, '[]');
  await user.click(screen.getByRole('button', { name: 'Save' }));
  await screen.findByText('Saved');
  assert.equal(M.listDraftTrips().length, 1);
});

test('A2.1 (page): a v2/door2-v7 draft opened on the page saves through Save and reopens', async () => {
  const v7 = { ...PERU, history: [], versions: { ...PERU.versions, schema: 'door2-v7' } };
  const seeded = { envelopeVersion: 2, id: 'd_v7', label: 'Peru from v7', destinationLabel: 'Peru', savedAt: '2026-10-02T10:00:00.000Z', trip: v7 };
  const { user } = mountOverStorage(JSON.stringify([seeded]));
  await screen.findByText('Peru from v7');
  await user.click(within(rowOf('Peru from v7')).getByRole('button', { name: 'Continue' }));
  await screen.findByText('Your trip at a glance');
  const glance = screen.getByText(/\d+ days ·/).textContent;

  await user.click(screen.getByRole('button', { name: 'Save' }));
  await screen.findByText('Saved');
  const saved = JSON.parse(raw()).find((d) => d.id !== 'd_v7');
  assert.equal(saved.envelopeVersion, 2, 'kept in envelope version 2');
  assert.equal(saved.trip.versions.schema, 'door2-v7');

  await user.click(screen.getByText('Start a new trip'));
  await screen.findByText('Peru');
  // Newest first: the row just saved.
  await user.click(screen.getAllByRole('button', { name: 'Continue' })[0]);
  await screen.findByText('Your trip at a glance');
  assert.equal(screen.queryByText(/can't be reopened here/), null, 'no refusal');
  assert.equal(screen.getByText(/\d+ days ·/).textContent, glance, 'same itinerary');
});

// ---------------------------------------------------------------------------
// Stage B — test 13 and the page half of the writer's refusals

const SAVE_NOT_STORABLE = "Couldn't save — this trip is missing information needed to reopen it, so nothing was saved.";
const SAVE_FAILED = "Couldn't save — storage may be full.";
const V5_REFUSED = (name) =>
  `"${name}" can't be reopened here — it was saved in an older trip format that this version no longer opens. The saved trip has not been deleted.`;
const saveMessage = (text) => screen.getByText(text).className;

test('13a: build -> Save -> reopen through the page keeps the itinerary and choices; stored as envelope 2 / door2-v7 with destinationLabel', async () => {
  const { user } = await mountAndBuildPeruViaIntake(M, { totalDays: 10 });
  await user.click(screen.getAllByText('Swap')[0]);
  await screen.findByText('Swapped');
  const glance = screen.getByText(/\d+ days ·/).textContent;

  await user.click(screen.getByRole('button', { name: 'Save' }));
  await screen.findByText('Saved');
  const [first] = JSON.parse(raw());
  const date = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  assert.deepEqual(Object.keys(first), ['envelopeVersion', 'id', 'label', 'destinationLabel', 'savedAt', 'trip']);
  assert.equal(first.envelopeVersion, 2);
  assert.equal(first.trip.versions.schema, 'door2-v7');
  assert.equal(first.destinationLabel, 'Peru');
  assert.equal(first.label, `Peru · 10 days · ${date}`, "autoLabel's string is unchanged");
  assert.equal(first.trip.spec.choices.placed.length, 1, 'the swap is recorded in the saved choices');

  await user.click(screen.getByText('Start a new trip'));
  await screen.findByText(first.label);
  await user.click(within(rowOf(first.label)).getByRole('button', { name: 'Continue' }));
  await screen.findByText('Your trip at a glance');
  assert.equal(screen.queryByText(/can't be reopened here/), null);
  assert.equal(screen.getByText(/\d+ days ·/).textContent, glance, 'same itinerary on reopen');

  // Saving the reopened (in-memory v7) trip stores the same trip again.
  await user.click(screen.getByRole('button', { name: 'Save' }));
  await screen.findByText('Saved');
  const second = JSON.parse(raw()).find((d) => d.id !== first.id);
  assert.deepStrictEqual(second.trip.days, first.trip.days, 'itinerary intact');
  assert.deepStrictEqual(second.trip.spec.choices, first.trip.spec.choices, 'choices intact');
  assert.deepStrictEqual(second.trip, first.trip, 'the whole trip intact');
});

test('13b: a door2-v5 draft is refused per draft through Continue, with the compatibility wording, and stays listed and stored', async () => {
  const { routePlan, ...noRoutePlan } = PERU;
  const v5 = entry('d_v5', 'Peru, 10 days (old)', '2026-09-20T10:00:00.000Z', {
    trip: { ...noRoutePlan, history: [], versions: { ...PERU.versions, schema: 'door2-v5' } }
  });
  const v6 = entry('d_v6', 'Peru, 10 days', '2026-10-01T10:00:00.000Z');
  const bytes = JSON.stringify([v5, v6]);
  const { user } = mountOverStorage(bytes);

  await screen.findByText('Peru, 10 days (old)');
  await user.click(within(rowOf('Peru, 10 days (old)')).getByRole('button', { name: 'Continue' }));
  assert.ok(await screen.findByText(V5_REFUSED('Peru, 10 days (old)')), 'refusal shown on that draft');
  assert.ok(within(rowOf('Peru, 10 days (old)')).getByText(V5_REFUSED('Peru, 10 days (old)')), 'in its own row');
  assert.equal(screen.queryByText('Your trip at a glance'), null, 'not opened');
  assert.ok(screen.getByText('Peru, 10 days (old)'), 'still listed');
  assert.equal(raw(), bytes, 'nothing deleted or rewritten');

  // The v6 draft beside it still opens.
  await user.click(within(rowOf('Peru, 10 days')).getByRole('button', { name: 'Continue' }));
  assert.ok(await screen.findByText('Your trip at a glance'));
});

test('13c: "Saved" renders teal; each save failure renders rose', async () => {
  const { user } = await mountWithBuiltTrip(M, peruSpec({ totalDays: 10 }));
  await user.click(screen.getByRole('button', { name: 'Save' }));
  await screen.findByText('Saved');
  assert.match(saveMessage('Saved'), /\btext-teal\b/);
  assert.doesNotMatch(saveMessage('Saved'), /text-rose-400/);

  // Unreadable storage.
  window.localStorage.setItem(KEY, '{not json');
  await user.click(screen.getByRole('button', { name: 'Save' }));
  await screen.findByText(SAVE_REFUSED);
  assert.match(saveMessage(SAVE_REFUSED), /\btext-rose-400\b/);
  assert.doesNotMatch(saveMessage(SAVE_REFUSED), /text-teal/);

  // A write that throws (e.g. quota).
  window.localStorage.setItem(KEY, '[]');
  const proto = Object.getPrototypeOf(window.localStorage);
  const realSet = proto.setItem;
  proto.setItem = function () {
    throw new window.DOMException('full', 'QuotaExceededError');
  };
  try {
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByText(SAVE_FAILED);
  } finally {
    proto.setItem = realSet;
  }
  assert.match(saveMessage(SAVE_FAILED), /\btext-rose-400\b/);
  assert.equal(raw(), '[]');
});

test('B1 (page): a legacy v6 draft missing warnings opens, but Save refuses it in rose, writes nothing, and logs the field', async () => {
  const { warnings, ...noWarnings } = PERU;
  const bytes = JSON.stringify([entry('d_nowarn', 'Peru, no warnings', '2026-10-01T10:00:00.000Z', { trip: { ...noWarnings, history: [] } })]);
  const { user } = mountOverStorage(bytes);
  await screen.findByText('Peru, no warnings');
  await user.click(within(rowOf('Peru, no warnings')).getByRole('button', { name: 'Continue' }));
  await screen.findByText('Your trip at a glance');

  const logged = [];
  const realError = console.error;
  console.error = (...args) => logged.push(args);
  try {
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByText(SAVE_NOT_STORABLE);
  } finally {
    console.error = realError;
  }
  assert.match(saveMessage(SAVE_NOT_STORABLE), /\btext-rose-400\b/);
  assert.equal(screen.queryByText('Saved'), null);
  assert.doesNotMatch(SAVE_NOT_STORABLE, /warnings/, 'the field name is not shown to the traveller');
  assert.ok(logged.some((args) => /warnings/.test(String(args[0]))), 'the field name is logged for diagnosis');
  assert.equal(raw(), bytes, 'storage byte-identical');
});
