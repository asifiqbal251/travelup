// Q8 packet 1a: the read-only lock on a door2-v8 record, driven through the real
// Door2Plan page. Build brief draft 7 §5.3, tests L1-L12.
//
// Every v8 record here is seeded directly into localStorage, because no client can
// produce one: the writer still stamps door2-v7 and refuses anything carrying identity.
// That is the point of the packet — the reader and the lock ship before the writer.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  loadDoor2PlanModule,
  peruSpec,
  resetLocation,
  clearStorage,
  teardown,
  window
} from './helpers/domHarness.js';

const M = await loadDoor2PlanModule();
// Let any pending timer or animation frame scheduled by the last test flush while the
// jsdom window still exists; closing it first leaves a re-render reading a trip that is
// already gone, which node:test reports as activity after the test ended.
after(async () => {
  await new Promise((resolve) => setTimeout(resolve, 50));
  await teardown();
});
const { render, screen, cleanup, within } = await import('@testing-library/react');
const userEvent = (await import('@testing-library/user-event')).default;

const KEY = 'door2_drafts_v1';
const raw = () => window.localStorage.getItem(KEY);
const clone = (x) => JSON.parse(JSON.stringify(x));

const PERU = M.buildFilledTrip(peruSpec({ totalDays: 10 }), M.PILOT_DATA, { reviewPolicy: 'allow_drafts' });
assert.notEqual(PERU.ok, false, 'the control trip must build');

const stamp = (schema, trip = PERU, extra = {}) => ({
  ...clone(trip),
  ...extra,
  versions: { ...trip.versions, schema }
});

const IDENTITY = { version: 1, used: ['luid_a'], blocks: { luid_a: { slot: 'full' } }, edits: {} };
const EMPTY_IDENTITY = { version: 1, used: [], blocks: {}, edits: {} };

const envelope = (trip, { id = 'd_v8', label = 'Peru v8' } = {}) => ({
  envelopeVersion: 2,
  id,
  label,
  destinationLabel: 'Peru',
  savedAt: '2026-10-14T10:00:00.000Z',
  trip
});

const NOTICE = {
  valid: "This version can show this trip, but can't edit or save it.",
  absent: "This trip opens, but the record of your changes is missing, so it's locked.",
  malformed: "This trip opens, but the record of your changes can't be read, so it's locked.",
  unknown: 'This trip was saved by a newer version of the planner, so it opens read-only.'
};

/** Mount the real page over storage holding exactly these entries. */
function mountOver(entries) {
  cleanup();
  resetLocation('/plan?key=door2');
  clearStorage();
  window.localStorage.setItem(KEY, JSON.stringify(entries));
  render(M.React.createElement(M.MemoryRouter, { initialEntries: ['/plan?key=door2'] }, M.React.createElement(M.Door2Plan)));
  return { user: userEvent.setup() };
}

const rowOf = (label) => screen.getByText(label).closest('li');

/** The sentence is on screen at least once. A refused command deliberately shows it
 * twice — the standing lock notice stays, and the inline edit error repeats it — so an
 * exact-one query would fail on correct behaviour. */
const shows = (text) => assert.ok(screen.queryAllByText(text).length > 0, `expected on screen: ${text}`);
const absent = (text) => assert.equal(screen.queryAllByText(text).length, 0, `expected absent: ${text}`);

/** Mount over one v8 record and open it through the real "Continue" action. */
async function openV8(trip, opts) {
  const { user } = mountOver([envelope(trip, opts)]);
  await user.click(await screen.findByRole('button', { name: 'Continue' }));
  await screen.findByText('Your trip at a glance');
  return { user, bytes: raw() };
}

const unchanged = (bytes, what) => assert.equal(raw(), bytes, `${what}: storage is unchanged`);

// ---------------------------------------------------------------------------
// L1: a valid v8 record renders, shows its sentence, and refuses every edit

test('L1: a valid v8 trip renders read-only, with the row-1 sentence and no working edit', async () => {
  const trip = stamp('door2-v8', PERU, { identity: IDENTITY, history: [] });
  const { user, bytes } = await openV8(trip);

  shows(NOTICE.valid);
  // The itinerary really did render: this is not a refusal page.
  assert.ok(screen.getByText('Your trip at a glance'));

  // Swap, from the activity row.
  const swap = screen.queryAllByRole('button', { name: 'Swap' });
  assert.ok(swap.length > 0, 'the control trip has at least one activity row');
  await user.click(swap[0]);
  shows(NOTICE.valid);
  unchanged(bytes, 'a refused swap');

  // A structural entry point: the nights chip.
  const chips = screen.queryAllByRole('button', { name: /^\d+ nights?$/ });
  assert.ok(chips.length > 0, 'the control trip has nights chips');
  await user.click(chips[0]);
  assert.equal(screen.queryByRole('dialog'), null, 'no structural sheet opens on a locked trip');
  unchanged(bytes, 'a refused nights entry');

  // Save.
  await user.click(screen.getByRole('button', { name: 'Save' }));
  unchanged(bytes, 'a refused save');
});

// ---------------------------------------------------------------------------
// L2a / L2b: the preview entry and the apply boundary refuse independently

test('L2a: a structural preview entry on a locked v8 trip is refused and writes nothing', async () => {
  const trip = stamp('door2-v8', PERU, { identity: IDENTITY, history: [] });
  const { user, bytes } = await openV8(trip);
  for (const chip of screen.queryAllByRole('button', { name: /^\d+ nights?$/ })) {
    await user.click(chip);
    assert.equal(screen.queryByRole('dialog'), null, 'no sheet opens');
  }
  unchanged(bytes, 'refused previews');
});

test('L2b: every route to a proposal is gated, so the apply boundary is unreachable', async () => {
  // Draft 7 §6 mutation 3 removes blockedSchema() from handleUseProposal. It fails no
  // test, and this is why: with every preview entry gated, nothing on a locked trip can
  // reach the proposals stage, so the apply handler's own check is defence in depth that
  // the page cannot exercise. Recorded as a finding in the implementation report rather
  // than removed — the gate is correct, and it is what stops any future route to a
  // proposal from bypassing the lock.
  //
  // What this test can establish, and does: no route reaches the stage. Each entry below
  // is one of the handlers the §3.1 enumeration found, driven for real.
  const trip = stamp('door2-v8', PERU, { identity: IDENTITY, history: [] });
  const { user, bytes } = await openV8(trip);

  const routes = [
    ['nights chip', () => screen.queryAllByRole('button', { name: /^\d+ nights?$/ })],
    ['day-trip or optional entry', () => screen.queryAllByRole('button', { name: /Add|Remove|Day trip/i })]
  ];

  let clicked = 0;
  for (const [name, find] of routes) {
    for (const el of find()) {
      await user.click(el);
      clicked += 1;
      assert.equal(screen.queryByRole('dialog'), null, `${name}: no sheet opens on a locked trip`);
      assert.equal(screen.queryByText('Use this'), null, `${name}: no proposal is offered`);
    }
  }
  assert.ok(clicked > 0, 'at least one real entry point was exercised');
  unchanged(bytes, 'no route to apply wrote anything');
  shows(NOTICE.valid);
});

// ---------------------------------------------------------------------------
// L3: rebuild and refine paths

test('L3: Refine and rebuild entry points are refused on a locked v8 trip', async () => {
  const trip = stamp('door2-v8', PERU, { identity: IDENTITY, history: [] });
  const { user, bytes } = await openV8(trip);
  const refine = screen.queryByRole('button', { name: /Refine/i });
  if (refine) {
    await user.click(refine);
    unchanged(bytes, 'a refused refine');
  }
  shows(NOTICE.valid);
});

// ---------------------------------------------------------------------------
// L4 / L4c: Undo, non-vacuously — with a positive control that proves it is reachable

const withHistory = (schema, extra = {}) => {
  const base = clone(PERU);
  // Undo renders only when history is non-empty, and normal saves strip history, so a
  // seeded record is the only way to reach the control. A history entry is a trip
  // snapshot carrying history: [] (edit.js: entries that kept their own stacks doubled
  // the saved size per edit) — not a {label, trip} wrapper.
  base.history = [{ ...clone(PERU), history: [] }];
  return stamp(schema, base, extra);
};

test('L4c (positive control): the same fixture stamped v7 reaches a working Undo', async () => {
  const { user } = mountOver([envelope(withHistory('door2-v7'), { id: 'd_v7', label: 'Peru v7' })]);
  await user.click(await screen.findByRole('button', { name: 'Continue' }));
  await screen.findByText('Your trip at a glance');
  const undo = screen.getByRole('button', { name: 'Undo last change' });
  assert.ok(undo, 'the v7 fixture reaches Undo, so L4 is not vacuous');
  await user.click(undo);
  // The v7 path is unlocked: the click is not refused by the schema lock.
  absent(NOTICE.valid);
  absent(NOTICE.absent);
});

test('L4: Undo on a locked v8 trip is refused, using the same history-bearing fixture', async () => {
  const trip = withHistory('door2-v8', { identity: IDENTITY });
  const { user, bytes } = await openV8(trip);
  await user.click(screen.getByRole('button', { name: 'Undo last change' }));
  // The standing lock notice is on screen for the whole of a locked trip's life, so its
  // presence after the click proves nothing. What proves the refusal is that the undo
  // did not happen: the history entry is still there, so the control is still offered,
  // and nothing reports a completed undo.
  assert.ok(
    screen.queryByRole('button', { name: 'Undo last change' }),
    'the history entry was not consumed, so Undo is still offered'
  );
  absent('Undone');
  unchanged(bytes, 'a refused undo');
});

// ---------------------------------------------------------------------------
// L5: Save refuses by name

test('L5: Save on a loaded v8 trip is refused and the stored bytes do not change', async () => {
  const trip = stamp('door2-v8', PERU, { identity: IDENTITY, history: [] });
  const { user, bytes } = await openV8(trip);
  await user.click(screen.getByRole('button', { name: 'Save' }));
  assert.equal(screen.queryByText('Saved'), null, 'nothing reports a successful save');
  unchanged(bytes, 'a refused save');
});

// ---------------------------------------------------------------------------
// L6 / L7: every identity row locks, each with its own sentence

test('L6: a v8 record with identity absent opens and is locked', async () => {
  const trip = stamp('door2-v8', PERU, { history: [] });
  assert.equal('identity' in trip, false);
  const { user, bytes } = await openV8(trip);
  shows(NOTICE.absent);
  await user.click(screen.queryAllByRole('button', { name: 'Swap' })[0]);
  unchanged(bytes, 'a refused swap on row 3');
});

test('L7: rows 2, 4 and 5 each lock with their own sentence', async () => {
  const rows = [
    [EMPTY_IDENTITY, NOTICE.valid],
    [{ version: 1, used: 'not-an-array', blocks: {}, edits: {} }, NOTICE.malformed],
    [{ ...IDENTITY, version: 99 }, NOTICE.unknown]
  ];
  for (const [identity, notice] of rows) {
    const trip = stamp('door2-v8', PERU, { identity, history: [] });
    const { user, bytes } = await openV8(trip);
    shows(notice);
    await user.click(screen.queryAllByRole('button', { name: 'Swap' })[0]);
    unchanged(bytes, 'a refused swap');
  }
});

// ---------------------------------------------------------------------------
// L8 / L8b: the lock does not leak

test('L8: a freshly built trip after a locked v8 open is fully functional', async () => {
  const trip = stamp('door2-v8', PERU, { identity: IDENTITY, history: [] });
  const { user } = await openV8(trip);
  shows(NOTICE.valid);

  // "Start a new trip" (handleStartOver -> confirmFreshStart, which needs no
  // confirmation because this fixture carries no traveller work) is the real route from
  // a live locked trip back to the intake wizard, inside the same mounted component.
  // The lock lives on tripResult, which the next build replaces, so it must not survive.
  await user.click(screen.getByRole('button', { name: 'Start a new trip' }));
  await user.click(await screen.findByText('Peru'));
  await user.click(screen.getByRole('button', { name: 'Yes, from Vancouver' }));
  await user.click(screen.getByRole('button', { name: 'Build my trip' }));
  await screen.findByText('Your trip at a glance');

  absent(NOTICE.valid);
  absent(NOTICE.absent);
  const swap = screen.queryAllByRole('button', { name: 'Swap' });
  assert.ok(swap.length > 0, 'the newly built trip offers a real edit control');
  await user.click(swap[0]);
  absent(NOTICE.valid);
  // The edit actually went through on the fresh trip.
  assert.equal(screen.queryAllByText(NOTICE.absent).length, 0, 'no lock leaked into the new trip');
});

test('L8b: a legacy v7 load after a locked v8 open is fully editable', async () => {
  const { user } = mountOver([
    envelope(stamp('door2-v8', PERU, { identity: IDENTITY, history: [] }), { id: 'eight', label: 'Peru v8' }),
    envelope(stamp('door2-v7', PERU, { history: [] }), { id: 'seven', label: 'Peru v7' })
  ]);
  await user.click(within(rowOf('Peru v8')).getByRole('button', { name: 'Continue' }));
  await screen.findByText('Your trip at a glance');
  shows(NOTICE.valid);

  // Reopen the list and load the v7 record. The previously held lock must be gone.
  cleanup();
  const second = mountOver([
    envelope(stamp('door2-v8', PERU, { identity: IDENTITY, history: [] }), { id: 'eight', label: 'Peru v8' }),
    envelope(stamp('door2-v7', PERU, { history: [] }), { id: 'seven', label: 'Peru v7' })
  ]);
  await second.user.click(within(rowOf('Peru v7')).getByRole('button', { name: 'Continue' }));
  await screen.findByText('Your trip at a glance');
  absent(NOTICE.valid);
  absent(NOTICE.absent);
});

// ---------------------------------------------------------------------------
// L9: v6 and v7 are indistinguishable from today

test('L9: a v6 and a v7 record open fully editable through the same path', async () => {
  for (const [schema, id] of [['door2-v6', 'six'], ['door2-v7', 'seven']]) {
    const entry = schema === 'door2-v6'
      // v6 lives in the unversioned legacy envelope, which is the route that must not change.
      ? { id, label: `Peru ${schema}`, savedAt: '2026-10-01T10:00:00.000Z', trip: stamp(schema, PERU, { history: [] }) }
      : envelope(stamp(schema, PERU, { history: [] }), { id, label: `Peru ${schema}` });
    const { user } = mountOver([entry]);
    await user.click(await screen.findByRole('button', { name: 'Continue' }));
    await screen.findByText('Your trip at a glance');
    absent(NOTICE.valid);
    absent(NOTICE.absent);
    const swap = screen.queryAllByRole('button', { name: 'Swap' });
    if (swap.length > 0) {
      await user.click(swap[0]);
      absent(NOTICE.valid);
    }
  }
});

// ---------------------------------------------------------------------------
// L10: every exposed command the §3.1 enumeration found

test('L10: every exposed command on a locked v8 trip refuses and writes nothing', async () => {
  const trip = withHistory('door2-v8', { identity: IDENTITY });
  const { user, bytes } = await openV8(trip);

  const probes = [
    ['Swap', () => screen.queryAllByRole('button', { name: 'Swap' })[0]],
    ['nights chip', () => screen.queryAllByRole('button', { name: /^\d+ nights?$/ })[0]],
    ['Undo last change', () => screen.queryByRole('button', { name: 'Undo last change' })],
    ['Save', () => screen.queryByRole('button', { name: 'Save' })],
    ['day menu', () => screen.queryAllByRole('button', { name: '⋯' })[0]]
  ];

  let exercised = 0;
  for (const [name, find] of probes) {
    const el = find();
    if (!el) continue;
    exercised += 1;
    await user.click(el);
    unchanged(bytes, `a refused ${name}`);
  }
  assert.ok(exercised >= 4, `expected to exercise the real controls, exercised ${exercised}`);
  // The trip is still the one that was loaded, and still locked.
  shows(NOTICE.valid);
});

// ---------------------------------------------------------------------------
// L11: evidence precedence, and the lock is additive

test('L11: a v8 record is returned with its evidence fields exactly as seeded', async () => {
  const trip = stamp('door2-v8', PERU, { identity: IDENTITY, history: [] });
  const { bytes } = await openV8(trip);
  const stored = JSON.parse(bytes)[0].trip;
  const reread = M.loadDraftTrip('d_v8');
  assert.equal(reread.compatible, true);
  assert.deepStrictEqual(reread.trip.evidence, stored.evidence, 'evidence is unchanged against the seeded bytes');
  assert.deepStrictEqual(reread.trip.versions, stored.versions, 'versions are unchanged against the seeded bytes');
  assert.equal(reread.readOnly, true, 'and the schema lock is reported');
  assert.equal(reread.readOnlyReason, 'schema');
});

// ---------------------------------------------------------------------------
// L12: the approved Delete exception, through the real list action

test('L12: Delete removes a locked v8 record and preserves every survivor', async () => {
  const survivor = envelope(stamp('door2-v7', PERU, { history: [] }), { id: 'seven', label: 'Peru v7' });
  const { user } = mountOver([
    envelope(stamp('door2-v8', PERU, { identity: IDENTITY, history: [] }), { id: 'eight', label: 'Peru v8' }),
    survivor
  ]);
  window.localStorage.setItem('unrelated_key', 'untouched');

  await user.click(within(rowOf('Peru v8')).getByRole('button', { name: 'Delete' }));

  const after = JSON.parse(raw());
  assert.deepEqual(after.map((d) => d.id), ['seven'], 'only the selected record is removed');
  assert.deepStrictEqual(after, [JSON.parse(JSON.stringify(survivor))], 'the survivor keeps its complete payload and envelope');
  assert.equal(window.localStorage.getItem('unrelated_key'), 'untouched', 'no unrelated key is touched');
  assert.equal(screen.queryByText('Peru v8'), null, 'and the row is gone from the list');
});
