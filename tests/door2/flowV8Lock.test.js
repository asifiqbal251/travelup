// Q8 packet 1a: the read-only lock on a door2-v8 record, driven through the real
// Door2Plan page. Build brief draft 7 §5.3, tests L1-L13.
//
// Every v8 record here is seeded directly into localStorage, because no client can
// produce one: the writer still stamps door2-v7 and refuses anything carrying identity.
//
// REVISED after the diff review of 7e85395 (R2). The first version of this file asserted
// that storage bytes were unchanged and that the standing lock notice was still on
// screen. Neither proves refusal: a bounded edit changes the in-memory itinerary and
// writes nothing, and the standing notice is present for the whole of a locked trip's
// life. Removing the real Swap guard left all 15 tests green. Every attempted edit below
// now asserts the ITINERARY ITSELF is unchanged, each with a v7 control proving the same
// action really does change it when the trip is not locked.
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

// The handler-exposed variant: it publishes the real component's handlers and state so
// L2b can call the apply boundary, which no UI route reaches on a locked trip.
const M = await loadDoor2PlanModule({ exposeHandlers: true });
after(async () => {
  await new Promise((resolve) => setTimeout(resolve, 50));
  await teardown();
});
const { render, screen, cleanup, within, act, fireEvent } = await import('@testing-library/react');
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

function mountOver(entries) {
  cleanup();
  resetLocation('/plan?key=door2');
  clearStorage();
  window.localStorage.setItem(KEY, JSON.stringify(entries));
  render(M.React.createElement(M.MemoryRouter, { initialEntries: ['/plan?key=door2'] }, M.React.createElement(M.Door2Plan)));
  return { user: userEvent.setup() };
}

const rowOf = (label) => screen.getByText(label).closest('li');

/** The sentence is on screen at least once. A refused command shows it twice — the
 * standing notice stays and the inline edit error repeats it — so an exact-one query
 * would fail on correct behaviour. */
const shows = (text) => assert.ok(screen.queryAllByText(text).length > 0, `expected on screen: ${text}`);
const absent = (text) => assert.equal(screen.queryAllByText(text).length, 0, `expected absent: ${text}`);

/**
 * What the traveller can actually see of the itinerary. This is the observable that
 * distinguishes a refused edit from a successful one: a bounded edit writes no storage,
 * so storage equality proves nothing, but it does change what is rendered.
 */
function itinerarySignature() {
  return Array.from(document.querySelectorAll('li'))
    .map((li) => li.textContent.trim())
    .filter((t) => t.length > 0)
    .join('\u001f');
}

/** The structural sheet's own close control; it exists only while a sheet is open.
 * StructureSheet has no dialog role, so role-based queries cannot see it. */
const sheetOpen = () => screen.queryAllByRole('button', { name: '×' }).length > 0;

async function openRecord(entries, label) {
  const { user } = mountOver(entries);
  await user.click(within(rowOf(label)).getByRole('button', { name: 'Continue' }));
  await screen.findByText('Your trip at a glance');
  return { user, bytes: raw(), before: itinerarySignature() };
}

const openV8 = (trip, opts) => openRecord([envelope(trip, opts)], opts?.label ?? 'Peru v8');

/** The complete active trip, history included, read from the real component. The
 * rendered itinerary is not enough on its own: an edit can leave every visible row
 * identical and still append an Undo snapshot (R2a). */
const activeSnapshot = () => clone(globalThis.__door2.activeTrip);
const activeUnchanged = (before, what) =>
  assert.deepStrictEqual(activeSnapshot(), before, `${what}: the active trip, history included, is unchanged`);

const unchanged = (bytes, what) => assert.equal(raw(), bytes, `${what}: storage is unchanged`);
const itineraryUnchanged = (before, what) =>
  assert.equal(itinerarySignature(), before, `${what}: the rendered itinerary is unchanged`);

// ---------------------------------------------------------------------------
// L0: the controls these tests drive really do work on an unlocked trip
//
// Without this, every "refused" assertion below could pass on a page where the action
// never worked at all. Each L-test that attempts an edit names its control here.

test('L0 (control): on a v7 record, Swap changes the itinerary and the sheet opens', async () => {
  const { user, before } = await openRecord(
    [envelope(stamp('door2-v7', PERU, { history: [] }), { id: 'seven', label: 'Peru v7' })],
    'Peru v7'
  );
  const swap = screen.queryAllByRole('button', { name: 'Swap' });
  assert.ok(swap.length > 0, 'the control trip offers Swap');
  await user.click(swap[0]);
  assert.notEqual(itinerarySignature(), before, 'Swap really does change the itinerary on v7');

  // And a structural entry really does open a sheet on v7.
  // Same preparation as L1 and L2a, so the comparison is like for like.
  await act(async () => { globalThis.__door2.setDeparture('confirmed'); });
  const chips = screen.queryAllByRole('button', { name: /^\d+ nights?$/ });
  assert.ok(chips.length > 0);
  await user.click(chips[0]);
  assert.ok(sheetOpen(), 'the structural sheet really does open on v7 once departure is confirmed');
});

// ---------------------------------------------------------------------------
// L1: a valid v8 record renders, shows its sentence, and no edit takes effect

test('L1: a valid v8 trip renders read-only and no attempted edit changes it', async () => {
  const trip = stamp('door2-v8', PERU, { identity: IDENTITY, history: [] });
  const { user, bytes, before } = await openV8(trip);

  shows(NOTICE.valid);
  assert.ok(screen.getByText('Your trip at a glance'), 'the itinerary really rendered');

  // Swap — the action whose guard removal left the whole first version of this file green.
  const swap = screen.queryAllByRole('button', { name: 'Swap' });
  assert.ok(swap.length > 0, 'the control trip offers Swap');
  await user.click(swap[0]);
  itineraryUnchanged(before, 'a refused swap');
  absent('Swapped');
  unchanged(bytes, 'a refused swap');

  // A structural entry point, with the departure consent already given so the schema
  // lock is the only thing left that can refuse.
  await act(async () => { globalThis.__door2.setDeparture('confirmed'); });
  const chips = screen.queryAllByRole('button', { name: /^\d+ nights?$/ });
  assert.ok(chips.length > 0);
  await user.click(chips[0]);
  assert.equal(sheetOpen(), false, 'no structural sheet opens on a locked trip');
  itineraryUnchanged(before, 'a refused nights entry');

  // Save.
  await user.click(screen.getByRole('button', { name: 'Save' }));
  absent('Saved');
  unchanged(bytes, 'a refused save');
});

// ---------------------------------------------------------------------------
// L2a / L2b: the preview entries and the apply boundary refuse independently

test('L2a: no route to a proposal opens on a locked v8 trip', async () => {
  const trip = stamp('door2-v8', PERU, { identity: IDENTITY, history: [] });
  const { user, bytes, before } = await openV8(trip);
  // Confirm the departure first. A reopened trip has no confirmation, so an ungated
  // chip would stop at the departure prompt and never reach the sheet — which would
  // make every assertion below pass with the schema rule removed.
  await act(async () => { globalThis.__door2.setDeparture('confirmed'); });
  let clicked = 0;
  for (const chip of screen.queryAllByRole('button', { name: /^\d+ nights?$/ })) {
    await user.click(chip);
    clicked += 1;
    assert.equal(sheetOpen(), false, 'no sheet opens');
    assert.equal(screen.queryAllByRole('button', { name: /^Use this/ }).length, 0, 'no proposal is offered');
  }
  assert.ok(clicked > 0, 'at least one real entry point was exercised');
  itineraryUnchanged(before, 'refused previews');
  unchanged(bytes, 'refused previews');
});

test('L2b: the real apply handler refuses a locked trip, called directly', async () => {
  // No UI route reaches apply on a locked trip, because every preview entry is gated.
  // That makes the apply handler's own guard defence in depth — and the brief's §5.3
  // allows exercising it in a controlled harness rather than counting it untested. The
  // harness publishes the real component's handler; nothing about production changes.
  const proposal = M.previewAdjustNights(PERU, PERU.routePlan.stops[0].key, 1, { generatedAt: new Date().toISOString() });
  assert.equal(proposal.ok, true, 'the control proposal must build');
  assert.ok(proposal.proposals?.[0], 'and must carry a proposal');

  const trip = stamp('door2-v8', PERU, { identity: IDENTITY, history: [] });
  const { before } = await openV8(trip);

  const api = globalThis.__door2;
  assert.ok(api && typeof api.handleUseProposal === 'function', 'the harness seam is present');
  assert.ok(api.tripLock, 'the loaded trip really is schema-locked');
  const activeBefore = clone(api.activeTrip);

  // The departure consent is a separate gate; confirm it so the only thing left that can
  // refuse is the schema lock.
  await act(async () => { api.setDeparture('confirmed'); });
  await act(async () => { globalThis.__door2.handleUseProposal(proposal.proposals[0]); });

  assert.deepStrictEqual(clone(globalThis.__door2.activeTrip), activeBefore, 'the active trip is unchanged by a refused apply');
  itineraryUnchanged(before, 'a refused apply');
  absent('Trip updated');
});

// ---------------------------------------------------------------------------
// L3: Refine — the opener mounts an edit form built from the restored spec

// Asserted through the harness seam on the exposed state flag rather than by querying
// the DOM after a click. The Refine sheet is a full-screen overlay, and once it mounts
// any further DOM work hangs the harness — which turns a clean named failure into a
// file-level SIGKILL and hides which test caught the regression. Reading showRefine
// settles the question before anything can mount.
test('L3: Refine is refused on a locked v8 trip and the form never opens', async () => {
  const trip = stamp('door2-v8', PERU, { identity: IDENTITY, history: [] });
  await openV8(trip);
  const api = globalThis.__door2;
  assert.ok(api.tripLock, 'the loaded trip really is schema-locked');
  assert.equal(api.showRefine, false, 'the form starts closed');
  await act(async () => { api.handleOpenRefine(); });
  assert.equal(globalThis.__door2.showRefine, false, 'the refused opener never sets the form open');
  assert.equal(screen.queryByText('Must include'), null, 'and no form is on screen');
});

test('L3b (control): Refine opens the form on a v7 record', async () => {
  const { user } = await openRecord(
    [envelope(stamp('door2-v7', PERU, { history: [] }), { id: 'seven', label: 'Peru v7' })],
    'Peru v7'
  );
  await act(async () => { globalThis.__door2.handleOpenRefine(); });
  assert.equal(globalThis.__door2.showRefine, true, 'the opener really does work on v7, so L3 is not vacuous');
  assert.ok(screen.queryByText('Must include'), 'and the form is on screen');
});

// R1: an accepted v8 record whose restored form arrays are malformed must be refused by
// the reader, so the form can never be built from them even if a route to it appears.
test('L3c: malformed refine-form fields are refused by the reader, not left to crash', async () => {
  for (const field of ['interests', 'requiredPlaceIds']) {
    const trip = stamp('door2-v8', PERU, { identity: IDENTITY, history: [] });
    trip.spec[field] = {};
    mountOver([envelope(trip, { id: 'bad', label: 'Peru bad' })]);
    fireEvent.click(within(rowOf('Peru bad')).getByRole('button', { name: 'Continue' }));
    assert.equal(screen.queryByText('Your trip at a glance'), null, `spec.${field}: the itinerary never renders`);
  }
});

// ---------------------------------------------------------------------------
// L4 / L4c: Undo, with a control proving the fixture reaches it

const withHistory = (schema, extra = {}) => {
  const base = clone(PERU);
  // A history entry is a trip snapshot carrying history: [] (edit.js), not a
  // {label, trip} wrapper. Normal saves strip history, so only a seeded record reaches
  // the Undo control.
  base.history = [{ ...clone(PERU), history: [] }];
  return stamp(schema, base, extra);
};

test('L4c (control): the same fixture stamped v7 reaches a working Undo', async () => {
  const { user, before } = await openRecord(
    [envelope(withHistory('door2-v7'), { id: 'd_v7', label: 'Peru v7' })],
    'Peru v7'
  );
  const undo = screen.getByRole('button', { name: 'Undo last change' });
  await user.click(undo);
  // The history entry is consumed, so the control goes away: a real undo happened.
  assert.equal(screen.queryByRole('button', { name: 'Undo last change' }), null, 'the undo really took effect on v7');
  assert.equal(itinerarySignature(), before, 'and it restored the same itinerary, since the snapshot is identical');
});

test('L4: Undo on a locked v8 trip is refused', async () => {
  const trip = withHistory('door2-v8', { identity: IDENTITY });
  const { user, bytes } = await openV8(trip);
  await user.click(screen.getByRole('button', { name: 'Undo last change' }));
  // The standing notice is always on screen, so what proves the refusal is that the
  // history entry was not consumed and no undo was reported.
  assert.ok(screen.queryByRole('button', { name: 'Undo last change' }), 'the history entry survived, so Undo is still offered');
  absent('Undone');
  unchanged(bytes, 'a refused undo');
});

// ---------------------------------------------------------------------------
// L5: Save

test('L5: Save on a loaded v8 trip is refused and the stored bytes do not change', async () => {
  const trip = stamp('door2-v8', PERU, { identity: IDENTITY, history: [] });
  const { user, bytes } = await openV8(trip);
  await user.click(screen.getByRole('button', { name: 'Save' }));
  absent('Saved');
  unchanged(bytes, 'a refused save');
});

// ---------------------------------------------------------------------------
// L6 / L7: every identity row locks, each with its own sentence

test('L6: a v8 record with identity absent opens, is locked, and no edit takes effect', async () => {
  const trip = stamp('door2-v8', PERU, { history: [] });
  assert.equal('identity' in trip, false);
  const { user, bytes, before } = await openV8(trip);
  shows(NOTICE.absent);
  await user.click(screen.queryAllByRole('button', { name: 'Swap' })[0]);
  itineraryUnchanged(before, 'a refused swap on row 3');
  unchanged(bytes, 'a refused swap on row 3');
});

test('L7: rows 2, 4 and 5 each lock with their own sentence and refuse edits', async () => {
  const rows = [
    [EMPTY_IDENTITY, NOTICE.valid],
    [{ version: 1, used: 'not-an-array', blocks: {}, edits: {} }, NOTICE.malformed],
    [{ ...IDENTITY, version: 99 }, NOTICE.unknown]
  ];
  for (const [identity, notice] of rows) {
    const trip = stamp('door2-v8', PERU, { identity, history: [] });
    const { user, bytes, before } = await openV8(trip);
    shows(notice);
    await user.click(screen.queryAllByRole('button', { name: 'Swap' })[0]);
    itineraryUnchanged(before, 'a refused swap');
    unchanged(bytes, 'a refused swap');
  }
});

// ---------------------------------------------------------------------------
// L8 / L8b: the lock does not leak — both transitions on ONE component instance

test('L8: a trip built after a locked v8 open is fully functional, same instance', async () => {
  const trip = stamp('door2-v8', PERU, { identity: IDENTITY, history: [] });
  const { user } = await openV8(trip);
  shows(NOTICE.valid);

  // "Start a new trip" (handleStartOver -> confirmFreshStart; no confirmation is needed
  // because this fixture carries no traveller work) is the real route from a live locked
  // trip back to intake, inside the same mounted component.
  await user.click(screen.getByRole('button', { name: 'Start a new trip' }));
  await user.click(await screen.findByText('Peru'));
  await user.click(screen.getByRole('button', { name: 'Yes, from Vancouver' }));
  await user.click(screen.getByRole('button', { name: 'Build my trip' }));
  await screen.findByText('Your trip at a glance');

  absent(NOTICE.valid);
  absent(NOTICE.absent);
  // "Fully functional" has to mean an edit actually lands, not just that no sentence shows.
  const fresh = itinerarySignature();
  const swap = screen.queryAllByRole('button', { name: 'Swap' });
  assert.ok(swap.length > 0, 'the newly built trip offers a real edit control');
  await user.click(swap[0]);
  assert.notEqual(itinerarySignature(), fresh, 'the edit really landed on the fresh trip');
});

test('L8b: a v7 record opened after a locked v8, on the same component instance, is editable', async () => {
  const entries = [
    envelope(stamp('door2-v8', PERU, { identity: IDENTITY, history: [] }), { id: 'eight', label: 'Peru v8' }),
    envelope(stamp('door2-v7', PERU, { history: [] }), { id: 'seven', label: 'Peru v7' })
  ];
  const { user } = mountOver(entries);
  await user.click(within(rowOf('Peru v8')).getByRole('button', { name: 'Continue' }));
  await screen.findByText('Your trip at a glance');
  shows(NOTICE.valid);

  // Back to intake and open the v7 record WITHOUT remounting, so the previously held
  // lock has to be cleared by the page rather than by a fresh component.
  await user.click(screen.getByRole('button', { name: 'Start a new trip' }));
  await user.click(within(rowOf('Peru v7')).getByRole('button', { name: 'Continue' }));
  await screen.findByText('Your trip at a glance');

  absent(NOTICE.valid);
  absent(NOTICE.absent);
  const before = itinerarySignature();
  const swap = screen.queryAllByRole('button', { name: 'Swap' });
  assert.ok(swap.length > 0);
  await user.click(swap[0]);
  assert.notEqual(itinerarySignature(), before, 'the v7 record really is editable after the locked open');
});

test('L8c (clean-mount control): a v7 record opens editable in a fresh mount', async () => {
  const { user, before } = await openRecord(
    [envelope(stamp('door2-v7', PERU, { history: [] }), { id: 'seven', label: 'Peru v7' })],
    'Peru v7'
  );
  await user.click(screen.queryAllByRole('button', { name: 'Swap' })[0]);
  assert.notEqual(itinerarySignature(), before, 'editable from a clean mount too');
});

// ---------------------------------------------------------------------------
// L9: v6 and v7 are indistinguishable from today

test('L9: a v6 and a v7 record open fully editable through the same path', async () => {
  for (const [schema, id] of [['door2-v6', 'six'], ['door2-v7', 'seven']]) {
    const entry = schema === 'door2-v6'
      // v6 lives in the unversioned legacy envelope, the route that must not change.
      ? { id, label: `Peru ${schema}`, savedAt: '2026-10-01T10:00:00.000Z', trip: stamp(schema, PERU, { history: [] }) }
      : envelope(stamp(schema, PERU, { history: [] }), { id, label: `Peru ${schema}` });
    const { user, before } = await openRecord([entry], `Peru ${schema}`);
    absent(NOTICE.valid);
    absent(NOTICE.absent);
    const swap = screen.queryAllByRole('button', { name: 'Swap' });
    assert.ok(swap.length > 0, `${schema}: offers Swap`);
    await user.click(swap[0]);
    assert.notEqual(itinerarySignature(), before, `${schema}: the edit really landed`);
  }
});

// ---------------------------------------------------------------------------
// L10: every exposed command, each with an observable outcome

// Narrowed after R2b: this covers the controls reachable directly from the results
// screen. The two day-menu commands are carried by L13 and L14, which follow them
// through to the action rather than counting a menu click.
test('L10: the results-screen controls on a locked v8 trip refuse observably', async () => {
  const trip = withHistory('door2-v8', { identity: IDENTITY });
  const { user, bytes, before } = await openV8(trip);

  const dayMenus = screen.queryAllByRole('button', { name: /^Day \d+ options$/ });
  assert.ok(dayMenus.length > 0, 'the day menu is found by its accessible name, not its glyph');

  const probes = [
    ['Swap', () => screen.queryAllByRole('button', { name: 'Swap' })[0]],
    ['nights chip', () => screen.queryAllByRole('button', { name: /^\d+ nights?$/ })[0]],
    ['Undo last change', () => screen.queryByRole('button', { name: 'Undo last change' })],
    ['Save', () => screen.queryByRole('button', { name: 'Save' })],
    ['Refine', () => screen.queryByRole('button', { name: 'Refine' })],
    ['day menu', () => dayMenus[0]]
  ];

  let exercised = 0;
  for (const [name, find] of probes) {
    const el = find();
    assert.ok(el, `${name}: the control is present, so the probe is not vacuous`);
    exercised += 1;
    if (name === 'Refine') fireEvent.click(el); else await user.click(el);
    itineraryUnchanged(before, `a refused ${name}`);
    unchanged(bytes, `a refused ${name}`);
  }
  assert.equal(exercised, probes.length, 'every enumerated control was exercised');

  // The day menu itself opens, because it is a display toggle rather than a command.
  // Its commands are covered by L13 (Make lighter) and L14 (Swap with another day),
  // which assert the full active trip instead of only the rendered rows.
  assert.ok(screen.queryByRole('button', { name: 'Make lighter' }), 'the day menu really did open');
});

// ---------------------------------------------------------------------------
// L13 / L14: the two day-menu commands the previous L10 never actually proved
//
// R2a and R2b from the diff review of 482bcaf. Removing either guard left all 799
// committed tests green: L10 exercised Make lighter on Day 1, which in the Peru fixture
// holds only a travel block, so an unguarded run changed nothing visible while still
// appending an Undo snapshot; and L10 opened a day menu without ever selecting "Swap
// with another day" or confirming a target. Both now assert the complete active trip,
// and both have a v7 control proving the command really does land when unlocked.

const dayMenuButton = (dayNumber) => screen.getByRole('button', { name: `Day ${dayNumber} options` });

/** The day whose menu L13 uses: the first with an activity, so Make lighter has
 * something to act on, plus Day 1, which has none. Both are exercised. */
function firstActivityDay(trip) {
  const day = trip.days.find((d) => d.blocks.some((b) => b.type === 'activity'));
  assert.ok(day, 'the control trip has a day with an activity');
  return day.dayNumber;
}

test('L13c (control): Make lighter really lands on v7, even when no block changes', async () => {
  const { user } = await openRecord(
    [envelope(stamp('door2-v7', PERU, { history: [] }), { id: 'seven', label: 'Peru v7' })],
    'Peru v7'
  );
  const before = activeSnapshot();
  assert.equal(before.history.length, 0, 'starts with no history');

  // Day 1 in this fixture is travel-only: the engine completes the edit and appends an
  // Undo snapshot while leaving every day identical. That is precisely the case whose
  // invisibility hid the missing guard.
  await user.click(dayMenuButton(1));
  await user.click(screen.getByRole('button', { name: 'Make lighter' }));
  const after = activeSnapshot();
  assert.equal(after.history.length, before.history.length + 1, 'history grew, so the command ran');
  assert.deepStrictEqual(after.days, before.days, 'and it changed no day, which is why the itinerary alone proves nothing');
});

test('L13: Make lighter on a locked v8 trip leaves the whole active trip unchanged', async () => {
  const trip = stamp('door2-v8', PERU, { identity: IDENTITY, history: [] });
  const { user, bytes } = await openV8(trip);
  const before = activeSnapshot();

  // The travel-only day, where only the full snapshot can tell refusal from success.
  await user.click(dayMenuButton(1));
  const lighter1 = screen.getByRole('button', { name: 'Make lighter' });
  await user.click(lighter1);
  activeUnchanged(before, 'a refused Make lighter on a travel-only day');

  // And a day that really does have an activity to drop.
  const day = firstActivityDay(before);
  await user.click(dayMenuButton(day));
  await user.click(screen.getByRole('button', { name: 'Make lighter' }));
  activeUnchanged(before, `a refused Make lighter on day ${day}`);

  absent('Day lightened');
  unchanged(bytes, 'a refused Make lighter');
});

test('L14c (control): Swap with another day really lands on v7, through confirmation', async () => {
  const { user } = await openRecord(
    [envelope(stamp('door2-v7', PERU, { history: [] }), { id: 'seven', label: 'Peru v7' })],
    'Peru v7'
  );
  const before = activeSnapshot();

  await user.click(dayMenuButton(5));
  await user.click(screen.getByRole('button', { name: 'Swap with another day' }));
  await screen.findByText('Swap Day 5 with…');
  const target = screen.getByRole('button', { name: 'Day 6' });
  await user.click(target);

  const after = activeSnapshot();
  assert.notDeepStrictEqual(after.days, before.days, 'the days really were swapped on v7');
  assert.equal(after.history.length, before.history.length + 1, 'and the command appended a snapshot');
});

test('L14: the day-swap confirmation on a locked v8 trip is refused', async () => {
  const trip = stamp('door2-v8', PERU, { identity: IDENTITY, history: [] });
  const { user, bytes } = await openV8(trip);
  const before = activeSnapshot();

  // The menu and the picker are display surfaces, so they open; the confirmation is the
  // command, and it is what must refuse.
  await user.click(dayMenuButton(5));
  await user.click(screen.getByRole('button', { name: 'Swap with another day' }));
  await screen.findByText('Swap Day 5 with…');
  const target = screen.getByRole('button', { name: 'Day 6' });
  assert.ok(target, 'the confirmation really is reachable, so this is not vacuous');
  await user.click(target);

  activeUnchanged(before, 'a refused day swap');
  absent('Day 5 and Day 6 swapped');
  unchanged(bytes, 'a refused day swap');
});

// ---------------------------------------------------------------------------
// L11: evidence precedence, with evidence that is actually unsupported

/** Structurally acceptable evidence at a ruleset this build does not know: the trip
 * stays viewable under the existing evidence explanation. */
function withUnsupportedEvidence(schema, extra = {}) {
  const t = stamp(schema, PERU, extra);
  t.evidence = { rulesetVersion: 'future@2', generatedAt: '2026-10-14T12:00:00.000Z', entries: [] };
  t.versions = { ...t.versions, connectionEvidence: 'future@2' };
  return t;
}

test('L11: on a v8 trip that is also evidence-read-only, the evidence reason is reported first', async () => {
  const trip = withUnsupportedEvidence('door2-v8', { identity: IDENTITY, history: [] });
  const reread = (() => {
    window.localStorage.setItem(KEY, JSON.stringify([envelope(trip)]));
    return M.loadDraftTrip('d_v8');
  })();
  assert.equal(reread.compatible, true, 'unsupported-but-structural evidence stays viewable');
  assert.equal(reread.evidenceReadOnly, true, 'and is reported as evidence-read-only');
  assert.equal(reread.readOnly, true, 'while the schema lock is still set');
  assert.equal(reread.readOnlyReason, 'schema', 'and is never cancelled by the evidence result');

  const { user, before } = await openV8(trip);
  // Both standing notices are shown.
  shows(reread.evidenceNotice);
  shows(NOTICE.valid);

  // A bounded command must report the EXISTING evidence explanation, not the schema one.
  await user.click(screen.queryAllByRole('button', { name: 'Swap' })[0]);
  itineraryUnchanged(before, 'a refused swap');
  const inline = Array.from(document.querySelectorAll('p.text-rose-400')).map((n) => n.textContent.trim());
  assert.ok(inline.length > 0, 'a refusal was reported inline');
  assert.ok(
    inline.some((t) => t === reread.evidenceNotice),
    `the inline refusal is the evidence explanation, not the schema one. Got: ${JSON.stringify(inline)}`
  );
});

test('L11b: malformed evidence on a v8 record is refused outright, not opened read-only', async () => {
  const trip = stamp('door2-v8', PERU, { identity: IDENTITY, history: [] });
  trip.evidence = { rulesetVersion: 'nope', generatedAt: 'not-a-date', entries: [] };
  const { user } = mountOver([envelope(trip, { id: 'bad', label: 'Peru bad' })]);
  await user.click(within(rowOf('Peru bad')).getByRole('button', { name: 'Continue' }));
  assert.equal(screen.queryByText('Your trip at a glance'), null, 'it never opens');
  assert.ok(screen.getByText(/saved evidence is incomplete/), 'refused by name for evidence');
});

test('L11c: a loaded v8 trip is returned with its evidence and versions exactly as seeded', async () => {
  const trip = stamp('door2-v8', PERU, { identity: IDENTITY, history: [] });
  const { bytes } = await openV8(trip);
  const stored = JSON.parse(bytes)[0].trip;
  const reread = M.loadDraftTrip('d_v8');
  assert.equal(reread.compatible, true);
  assert.deepStrictEqual(reread.trip.evidence, stored.evidence, 'evidence unchanged against the seeded bytes');
  assert.deepStrictEqual(reread.trip.versions, stored.versions, 'versions unchanged against the seeded bytes');
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
