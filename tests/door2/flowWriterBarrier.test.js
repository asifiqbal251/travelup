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

// ---------------------------------------------------------------------------
// Q8 PACKET 2: RULE W through the REAL PAGE — D-1 and D-2 of the build brief §7.2, read
// with binding clarifications B1.1–B1.7 (which govern where they differ from the brief).
//
// This is what satisfies standing rule 2, the testing gate (docs/adr/README.md): the save
// flow is an affected user flow, so DOM evidence is required here and not as a follow-up —
// the actual page, the real DOM, a real user click, the visible message, the itinerary and
// the stored state. Additions only: W-7 and W-8 above are untouched.
//
// No page source change and no new user-facing copy: an envelope refusal reuses the page's
// existing "Couldn't save" sentence, exactly as an identity refusal does.

const ENVELOPE_VERSION_LITERAL = 2;
const SUBSTITUTED_ID = 'SUBSTITUTED_ID';
const EXISTING_REFUSAL_TEXT = "Couldn't save — this trip is missing information needed to reopen it, so nothing was saved.";

/** Own presence and value of the three covered scalars, plus the own key list (B1.2). */
const captureEnvelope = (e) => ({
  ownKeys: Object.keys(e),
  scalars: Object.fromEntries(
    ['envelopeVersion', 'id', 'savedAt'].map((k) => [k, Object.hasOwn(e, k) ? { own: true, value: e[k] } : { own: false }])
  )
});

/**
 * A localStorage stand-in that COUNTS writes and delegates everything to the real one.
 * B1.4: unchanged bytes and an unchanged record count do not distinguish zero writes from
 * rewriting identical bytes, so the write count is asserted directly. The page itself never
 * touches localStorage — only draftStorage does — so any counted write is the writer's.
 *
 * globalThis.localStorage is swapped rather than window.localStorage patched: jsdom's
 * Storage is a legacy platform object whose named-property setter would turn an assignment
 * into a stored item. draftStorage resolves the free variable `localStorage` at call time,
 * so the swap reaches it and the prior descriptor is restored in a `finally`.
 */
function countingLocalStorage() {
  const real = window.localStorage;
  const counts = { writes: 0 };
  const wrapper = {
    getItem: (k) => real.getItem(k),
    setItem: (k, v) => {
      counts.writes += 1;
      return real.setItem(k, v);
    },
    removeItem: (k) => real.removeItem(k),
    clear: () => real.clear(),
    key: (i) => real.key(i),
    get length() {
      return real.length;
    }
  };
  return { counts, wrapper };
}

/**
 * The bounded inherited envelope hook, armed for ONE click.
 *
 * B1.1: it RETURNS an envelope copy with a changed `id` and an otherwise valid payload. It
 * does not throw, does not construct the expected refusal, does not patch or wrap the save
 * export, and does not manufacture the diagnostic — the reviewer's vacuity counterexample
 * was a hook that threw a test-made error and produced every symptom with no invariant in
 * the code at all. Every non-target frame returns `this` unchanged, so no other
 * JSON.stringify in the page or in React is altered.
 *
 * Installed as a NON-ENUMERABLE, CONFIGURABLE property; the prior descriptor is restored in
 * a `finally` (restored, not deleted) and hygiene is asserted afterwards.
 */
async function withArmedEnvelopeHook(transform, fn) {
  const priorToJSON = Object.getOwnPropertyDescriptor(Object.prototype, 'toJSON');
  const priorStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const priorConsoleError = console.error;
  const { counts, wrapper } = countingLocalStorage();
  const seen = { frames: 0, targets: 0, captured: null, original: null };
  const logged = [];

  Object.defineProperty(Object.prototype, 'toJSON', {
    value: function envelopeHook(key) {
      seen.frames += 1;
      const isEnvelope = key === '0' && this !== null && typeof this === 'object' && !Array.isArray(this) && this.envelopeVersion === ENVELOPE_VERSION_LITERAL;
      if (!isEnvelope) return this;
      seen.targets += 1;
      seen.original = captureEnvelope(this);
      const returned = transform(this);
      seen.captured = captureEnvelope(returned);
      return returned;
    },
    writable: true,
    enumerable: false,
    configurable: true
  });
  Object.defineProperty(globalThis, 'localStorage', { value: wrapper, configurable: true, writable: true });
  console.error = (...args) => logged.push(args);

  try {
    // ZERO SETUP ARMING (B1.3, C1): the page is already mounted and the draft already
    // opened, and nothing has reached the envelope frame.
    assert.equal(seen.targets, 0, 'the hook must not have fired during page setup');
    assert.equal(counts.writes, 0, 'and no write has been counted yet');
    await fn();
  } finally {
    if (priorToJSON) Object.defineProperty(Object.prototype, 'toJSON', priorToJSON);
    else delete Object.prototype.toJSON;
    if (priorStorage) Object.defineProperty(globalThis, 'localStorage', priorStorage);
    console.error = priorConsoleError;
  }
  return { seen, counts, logged };
}

test('D-1: a SUCCESSFUL save through the real page still works on this build — the click appends exactly one record, the complete prior entry span is retained byte for byte as stored TEXT, "Saved" appears, and what it wrote reopens', async () => {
  const { user } = await mountWithBuiltTrip(M, peruSpec({ totalDays: 10 }));

  const before = window.localStorage.getItem(KEY);
  assert.equal(JSON.parse(before).length, 1, 'the setup draft is the only record');
  // B1.7: the prior-entry check compares the RAW ENTRY SPAN, not a parsed object. The store
  // is the outer brackets and this one entry, so the span is exactly what sits between them.
  const priorSpan = before.slice(1, -1);
  assert.ok(priorSpan.startsWith('{') && priorSpan.endsWith('}'), 'the prior span is one complete entry');

  await user.click(screen.getByRole('button', { name: 'Save' }));
  await screen.findByText('Saved');

  const after = window.localStorage.getItem(KEY);
  const stored = JSON.parse(after);
  assert.equal(stored.length, 2, 'the page really appended a record');
  // THE BYTE CLAIM, as stored text: the prior entry's complete span is still there,
  // character for character, immediately after the opening bracket.
  assert.equal(after.slice(1, 1 + priorSpan.length), priorSpan, 'the complete prior entry span is byte-identical as stored text');
  assert.equal(after[1 + priorSpan.length], ',', 'and the new record was appended after it, not spliced into it');
  assert.ok(after.startsWith(`[${priorSpan},`), 'stated the other way round, as a prefix of the new bytes');
  assert.ok(after.endsWith(']'), 'and the array still closes');

  assert.equal(stored[1].envelopeVersion, ENVELOPE_VERSION_LITERAL);
  assert.equal(stored[1].trip.versions.schema, 'door2-v7');
  assert.equal(Object.hasOwn(stored[1], 'id'), true, 'the new record carries its id as an OWN property');
  assert.equal(M.loadDraftTrip(stored[1].id).compatible, true, 'what it wrote reopens');
});

test('D-2: an ARMED save through the real page — clicking the page\'s own Save produces the EXISTING "Couldn\'t save" sentence, no "Saved", zero new records, zero counted writes, byte-identical stored bytes, the itinerary still rendered, and a diagnostic naming the ENVELOPE check', async () => {
  const { user } = await mountWithBuiltTrip(M, peruSpec({ totalDays: 10 }));

  const bytesBefore = window.localStorage.getItem(KEY);
  assert.equal(JSON.parse(bytesBefore).length, 1, 'exactly one record before the click');
  const saveButton = screen.getByRole('button', { name: 'Save' });
  assert.equal(saveButton.disabled, false, 'Save is actionable — the refusal is the writer\'s, not a disabled control\'s');

  const protoNamesBefore = Object.getOwnPropertyNames(Object.prototype);
  const protoToJSONBefore = Object.getOwnPropertyDescriptor(Object.prototype, 'toJSON');
  const storageDescriptorBefore = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const consoleErrorBefore = console.error;

  // The fixture RETURNS a value: an envelope copy with a changed id and an untouched
  // payload. Nothing here throws, and nothing here names the refusal.
  const { seen, counts, logged } = await withArmedEnvelopeHook(
    (envelope) => ({ ...envelope, id: SUBSTITUTED_ID }),
    async () => {
      await user.click(saveButton);
      await screen.findByText(/Couldn't save/);
    }
  );

  // HYGIENE, after restoration.
  assert.deepStrictEqual(Object.getOwnPropertyNames(Object.prototype), protoNamesBefore, 'Object.prototype gained and lost no keys');
  assert.deepStrictEqual(Object.getOwnPropertyDescriptor(Object.prototype, 'toJSON'), protoToJSONBefore, 'and its toJSON descriptor is exactly as it was');
  assert.equal(Object.hasOwn(Object.prototype, 'toJSON'), false, 'with no leftover hook');
  assert.deepStrictEqual(Object.getOwnPropertyDescriptor(globalThis, 'localStorage'), storageDescriptorBefore, 'the globalThis.localStorage descriptor is exactly as it was before arming');
  assert.equal(console.error, consoleErrorBefore, 'and console.error is the same function reference it was');

  // NON-VACUITY (B1.2): the hook really reached the envelope frame, and the frame it
  // returned really carried the covered id alteration — matched against the writer's own
  // envelope, with own-property checks.
  assert.ok(seen.targets > 0, `the hook must reach the envelope frame; targets=${seen.targets}`);
  assert.ok(seen.frames > seen.targets, 'and it ran on non-target frames too, every one of which returned `this`');
  assert.equal(seen.original.scalars.id.own, true, 'the writer assembled an own id');
  assert.ok(/^d2draft_\d+_/.test(seen.original.scalars.id.value), `and it was this writer's generated id: ${seen.original.scalars.id.value}`);
  assert.equal(seen.captured.scalars.id.own, true, 'the returned frame still carries an own id');
  assert.equal(seen.captured.scalars.id.value, SUBSTITUTED_ID, 'but a substituted one — the alteration really happened');
  assert.notEqual(seen.captured.scalars.id.value, seen.original.scalars.id.value, 'and it differs from what was assembled');
  assert.deepStrictEqual(seen.captured.ownKeys, seen.original.ownKeys, 'while every other own envelope key is as assembled');
  assert.equal(seen.captured.scalars.envelopeVersion.value, ENVELOPE_VERSION_LITERAL, 'envelopeVersion untouched');
  assert.equal(seen.captured.scalars.savedAt.value, seen.original.scalars.savedAt.value, 'savedAt untouched');

  // COUNT THE WRITES (B1.4). This is the primary claim; the bytes and the count below stay
  // but cannot by themselves distinguish zero writes from rewriting identical bytes.
  assert.equal(counts.writes, 0, `the refused save performed ZERO writes; counted ${counts.writes}`);

  // THE EXISTING MESSAGE, unchanged — no new wording and no new UI.
  assert.ok(screen.getByText(EXISTING_REFUSAL_TEXT), 'the page shows its existing refusal sentence');
  // NO success acknowledgement.
  assert.equal(screen.queryByText('Saved'), null, 'no "Saved" acknowledgement appears');
  // THE BYTES, and the record count.
  assert.equal(window.localStorage.getItem(KEY), bytesBefore, 'the stored bytes are byte-identical');
  assert.equal(JSON.parse(window.localStorage.getItem(KEY)).length, 1, 'and no record was appended');
  // THE ITINERARY REMAINS VIEWABLE. A refused save is not a broken page.
  assert.ok(screen.getByText('Your trip at a glance'), 'the itinerary is still shown');
  assert.ok(screen.getAllByText(/\d+ days/).length > 0, 'and still describes the trip');

  // THE DISCRIMINATOR. The page shows the same sentence for an identity refusal and for
  // this one, so without this the test could not tell the new refusal from the existing
  // one — the existing identity-error DOM test (W-8) is NOT evidence that this check was
  // reached. The logged ERROR OBJECT is asserted too, as a supporting witness (B1.5).
  const lines = logged.map((args) => args.map(String).join(' '));
  assert.ok(
    lines.some((line) => line.includes('Door2Plan: trip not storable (envelope: door2-v7)')),
    `the diagnostic must name the ENVELOPE check; logged: ${JSON.stringify(lines)}`
  );
  assert.equal(lines.some((line) => line.includes('identity: door2-v8')), false, 'and it is not the identity refusal');
  // The bundle re-exports the writer's functions but not its error class, and the DOM
  // harness is not one of this round's authorized paths, so the logged object is identified
  // by its own frozen name rather than by instanceof across the bundle boundary.
  const loggedError = logged.map((args) => args[1]).find((e) => e instanceof Error && e.name === 'DraftNotStorableError');
  assert.ok(loggedError, 'the page logged the error object alongside the sentence');
  assert.equal(loggedError.check, 'envelope', 'the logged object carries the new check');
  assert.equal(loggedError.field, 'id', 'and the violated field, which the sentence deliberately does not show');
  assert.equal(loggedError.schema, 'door2-v7');
  assert.equal(
    loggedError.message,
    'The record this save assembled was not the record it was about to write (id), so nothing was saved.',
    'with the owner-confirmed message'
  );
});
