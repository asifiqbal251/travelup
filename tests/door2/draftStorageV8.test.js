import { test } from 'node:test';
import assert from 'node:assert/strict';

// Q8 packet 1a: the door2-v8 READER and its read-only lock, plus Rule B on the writer.
// Build brief claude/build-brief-q8-packet1a-v8-reader-and-lock-2026-10-14-draft7.md,
// tests M1-M9 (§5.1) and S1-S4 (§5.2). The DOM half (L1-L12) is in flowV8Lock.test.js.
//
// Packet 1a ships the reader only. No client can produce a door2-v8 record: the writer
// still stamps door2-v7, so every v8 fixture here is seeded directly into storage.
// Nothing in this file asserts that identity is valid — classification is structural,
// and D-B §4.2's coverage validation belongs to packet 1b.

import {
  DraftNotStorableError,
  deleteDraftTrip,
  listDraftTrips,
  loadDraftTrip,
  saveDraftTrip
} from '../../src/lib/door2/draftStorage.js';
import { schemaLockFor } from '../../src/lib/door2/tripLock.js';
import { PILOT_DATA, buildFilledTrip } from '../../src/lib/door2/planner.js';
import { SKELETON_FIXTURES } from './fixtures/skeletonFixtures.js';

const KEY = 'door2_drafts_v1';
const DRAFTS = { reviewPolicy: 'allow_drafts' };

const store = new Map();
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) };
const raw = () => store.get(KEY) ?? null;
const seed = (entries) => store.set(KEY, JSON.stringify(entries));
const json = (x) => JSON.parse(JSON.stringify(x));
const clone = (x) => JSON.parse(JSON.stringify(x));

const PERU = buildFilledTrip(SKELETON_FIXTURES.F2, PILOT_DATA, DRAFTS);
assert.notEqual(PERU.ok, false, 'F2 must build for these fixtures to mean anything');

const stamp = (t, schema) => ({ ...clone(t), versions: { ...t.versions, schema } });
const v7 = (t = PERU) => stamp({ ...t, history: [] }, 'door2-v7');
const v8 = (t = PERU) => stamp({ ...t, history: [] }, 'door2-v8');

const env = (trip, extra = {}) => ({
  envelopeVersion: 2,
  id: 'd_v8',
  label: 'Peru, 10 days',
  destinationLabel: 'Peru',
  savedAt: '2026-10-14T10:00:00.000Z',
  trip,
  ...extra
});

/** Reads, asserting that reading never changes a stored byte. */
function load(id) {
  const before = raw();
  const r = loadDraftTrip(id);
  listDraftTrips();
  assert.equal(raw(), before, `storage unchanged by reading ${id}`);
  return r;
}

const IDENTITY = { version: 1, used: ['luid_a'], blocks: { 'luid_a': { slot: 'full' } }, edits: {} };
const EMPTY_IDENTITY = { version: 1, used: [], blocks: {}, edits: {} };

const withIdentity = (trip, identity) => {
  const t = clone(trip);
  t.identity = identity;
  return t;
};

const refusedByName = (r, pattern) => {
  assert.equal(r.compatible, false, `expected a refusal, got ${JSON.stringify(r).slice(0, 160)}`);
  assert.match(r.reason, /^"Peru" can't be reopened here — /, 'named from the envelope, never from inside trip');
  assert.match(r.reason, pattern);
};

const opensLocked = (r, identity) => {
  assert.equal(r.compatible, true, `expected an open, got ${r.reason}`);
  assert.equal(r.storedSchema, 'door2-v8');
  assert.equal(r.readOnly, true);
  assert.equal(r.readOnlyReason, 'schema');
  assert.equal(r.identity, identity);
  assert.ok(typeof r.readOnlyNotice === 'string' && r.readOnlyNotice !== '', 'carries a traveller-facing sentence');
  return r;
};

// ---------------------------------------------------------------------------
// M5 / M5b: rows 1-5 open read-only, classified correctly, nothing written

test('M5: a door2-v8 record opens read-only in every identity row, with its own sentence', () => {
  const rows = [
    ['valid', withIdentity(v8(), IDENTITY)],
    ['empty', withIdentity(v8(), EMPTY_IDENTITY)],
    ['absent', v8()],
    ['malformed', withIdentity(v8(), { version: 1, used: 'not-an-array', blocks: {}, edits: {} })],
    ['unknown_version', withIdentity(v8(), { ...IDENTITY, version: 99 })]
  ];
  const notices = new Set();
  for (const [expected, trip] of rows) {
    store.clear();
    seed([env(trip)]);
    const bytes = raw();
    const r = opensLocked(load('d_v8'), expected);
    assert.deepStrictEqual(r.trip, json(trip), `${expected}: returned exactly as saved, never repaired`);
    assert.equal(raw(), bytes, `${expected}: no write on a read-only open`);
    notices.add(r.readOnlyNotice);
  }
  // Rows 1 and 2 share a sentence; rows 3, 4 and 5 each have their own (mutation 7).
  assert.equal(notices.size, 4, 'the sentences are not interchangeable');
});

test('M5b: a real producer trip stamped v8, with no new block fields, still opens', () => {
  for (const [name, spec] of Object.entries(SKELETON_FIXTURES)) {
    const built = buildFilledTrip(spec, PILOT_DATA, DRAFTS);
    if (built.ok === false) continue;
    store.clear();
    seed([env(v8(built))]);
    const r = load('d_v8');
    assert.equal(r.compatible, true, `${name} must open: ${r.reason}`);
  }
});

test('M5c: real producer output including open blocks and gap days stays viewable', () => {
  const types = new Set(PERU.days.flatMap((d) => d.blocks).map((b) => b.type));
  assert.ok(types.size > 0, 'the control trip has blocks');
  for (const t of types) {
    assert.ok(['travel', 'open', 'rest', 'activity'].includes(t), `producer emitted an unadmitted type: ${t}`);
  }
  // A gap day is legitimate producer output and must not be refused.
  const gapped = v8();
  const block = gapped.days.flatMap((d) => d.blocks).find((b) => b.type === 'activity');
  if (block) {
    block.gap = true;
    delete block.activity;
    store.clear();
    seed([env(gapped)]);
    assert.equal(load('d_v8').compatible, true, 'a gap block carries no activity and must still open');
  }
});

// ---------------------------------------------------------------------------
// M6 / M6c / M6d: the render contract, refused by name before the page sees the trip

const renderCase = (label, mutate) => [label, mutate];

const RENDER_CASES = [
  renderCase('spec', (t) => { delete t.spec; }),
  renderCase('spec.stops', (t) => { delete t.spec.stops; }),
  renderCase('spec.stops', (t) => { t.spec.stops = { 0: { placeId: 'p', nights: 1 } }; }),
  renderCase('routePlan', (t) => { delete t.routePlan; }),
  renderCase('days.blocks', (t) => { t.days[0].blocks = ['not an object']; }),
  renderCase('days.blocks.activity', (t) => {
    const b = t.days.flatMap((d) => d.blocks).find((x) => x.type === 'activity');
    delete b.activity;
  }),
  renderCase('days.blocks.type.unsupported', (t) => { t.days[0].blocks[0].type = 'meal'; }),
  renderCase('days.blocks.startTime', (t) => { t.days[0].blocks[0].startTime = { h: 9 }; }),
  renderCase('days.blocks.placeId', (t) => { t.days[0].blocks[0].placeId = { id: 'lima' }; })
];

test('M6c: a v8 record that the page could not render is refused by name and kept', () => {
  for (const [field, mutate] of RENDER_CASES) {
    store.clear();
    const trip = v8();
    mutate(trip);
    seed([env(trip)]);
    const bytes = raw();
    const r = load('d_v8');
    refusedByName(r, /can't be shown by this version/);
    assert.match(r.reason, new RegExp(field.replace(/[.[\]]/g, '\\$&')), `names the failing field (${field})`);
    assert.equal(r.trip, undefined, 'the trip is never handed over');
    assert.equal(raw(), bytes, `${field}: refusing writes nothing`);
  }
});

// The four counterexamples the independent review found against draft 6's checks. Each
// value is ordinary serialisable JSON that passed every structural check and then made
// the real component throw "Objects are not valid as a React child".
test('M6c-1: an object-valued activity.summary is refused before rendering', () => {
  store.clear();
  const trip = v8();
  trip.days.flatMap((d) => d.blocks).find((b) => b.type === 'activity').activity.summary = { unexpected: 'object' };
  seed([env(trip)]);
  refusedByName(load('d_v8'), /activity\.summary/);
});

test('M6c-2: an object-valued activity.foodNote is refused before rendering', () => {
  store.clear();
  const trip = v8();
  trip.days.flatMap((d) => d.blocks).find((b) => b.type === 'activity').activity.foodNote = { unexpected: 'object' };
  seed([env(trip)]);
  refusedByName(load('d_v8'), /activity\.foodNote/);
});

test('M6c-3: an object-valued routePlan.optionals is refused before rendering', () => {
  store.clear();
  const trip = v8();
  trip.routePlan.optionals = { huaraz: { optionalId: 'huaraz' } };
  seed([env(trip)]);
  refusedByName(load('d_v8'), /routePlan\.optionals/);
});

test('M6c-4: malformed travel display values are refused before rendering', () => {
  const cases = [
    ['transport.arriveTime', (tr) => { tr.arriveTime = { at: '14:00' }; }],
    ['transport.arriveDayNumber', (tr) => { tr.arriveDayNumber = '2'; }],
    ['transport.toPlaceId', (tr) => { tr.toPlaceId = { id: 'cusco' }; }],
    ['transport.overnight', (tr) => { tr.overnight = 'yes'; }]
  ];
  for (const [field, mutate] of cases) {
    store.clear();
    const trip = v8();
    const travel = trip.days.flatMap((d) => d.blocks).find((b) => b.type === 'travel' && b.transport);
    assert.ok(travel, 'the control trip has a travel block with transport');
    mutate(travel.transport);
    seed([env(trip)]);
    refusedByName(load('d_v8'), new RegExp(field.replace('.', '\\.')));
  }
});

test('M6c-5: a non-array selectedExcursionIds is refused (listExcursionMenu would throw)', () => {
  store.clear();
  const trip = v8();
  trip.routePlan.stops[0].selectedExcursionIds = { 0: 'sintra' };
  seed([env(trip)]);
  refusedByName(load('d_v8'), /selectedExcursionIds/);
});

test('M6d: an envelope version other than 2 is refused even on a valid v8 payload', () => {
  for (const ev of [1, 3, '2', null, 2.5]) {
    store.clear();
    seed([env(withIdentity(v8(), IDENTITY), { envelopeVersion: ev })]);
    refusedByName(load('d_v8'), /saved in a format this version doesn't recognise/);
  }
});

test('M6: malformed evidence on a v8 record is refused by name, as it already is on v7', () => {
  store.clear();
  const trip = v8();
  trip.evidence = { rulesetVersion: 'nope', generatedAt: 'not-a-date', entries: [] };
  seed([env(trip)]);
  refusedByName(load('d_v8'), /saved evidence is incomplete/);
});

// ---------------------------------------------------------------------------
// M6b: records that match two rows at once resolve by the stated precedence

test('M6b: precedence — structure before evidence, evidence before identity', () => {
  // Unrenderable and identity-absent: the render failure wins.
  store.clear();
  const both = v8();
  delete both.spec.stops;
  seed([env(both)]);
  refusedByName(load('d_v8'), /can't be shown by this version/);

  // Malformed evidence and missing identity: the evidence refusal wins, and the record
  // is never reported as an identity row.
  store.clear();
  const ev = v8();
  ev.evidence = { rulesetVersion: 'nope', generatedAt: 'x', entries: [] };
  seed([env(ev)]);
  const r = load('d_v8');
  refusedByName(r, /saved evidence is incomplete/);
  assert.equal(r.identity, undefined, 'a refused record carries no identity classification');

  // Wrong envelope version and an otherwise valid v8 payload: the envelope wins.
  store.clear();
  seed([env(withIdentity(v8(), IDENTITY), { envelopeVersion: 3 })]);
  refusedByName(load('d_v8'), /saved in a format this version doesn't recognise/);
});

// ---------------------------------------------------------------------------
// M1b / M9: the legacy contract, unchanged

test('M1b: a v6 and a v7 record keep their exact existing result shape', () => {
  store.clear();
  const six = { ...clone(PERU) };
  seed([
    { id: 'six', label: 'Peru, 10 days', savedAt: '2026-10-01T10:00:00.000Z', trip: six },
    env(v7(), { id: 'seven' })
  ]);
  // No classification keys are added to a legacy result: draftUpgrade.test.js asserts
  // this shape exactly, and mutation 10 is what proves it stays enforced.
  assert.deepStrictEqual(load('six'), { compatible: true, trip: json(six) });
  assert.deepStrictEqual(load('seven'), { compatible: true, trip: json(v7()) });
});

test('M9: schemaLockFor returns no lock for a legacy result, and a lock only for v8', () => {
  store.clear();
  seed([env(v7(), { id: 'seven' }), env(v8(), { id: 'eight' })]);
  assert.equal(schemaLockFor(loadDraftTrip('seven')), null, 'a v7 open carries no schema lock');
  assert.equal(schemaLockFor({ compatible: false, reason: 'x' }), null, 'a refusal carries no lock');
  assert.equal(schemaLockFor(null), null);
  assert.equal(schemaLockFor(undefined), null);
  const lock = schemaLockFor(loadDraftTrip('eight'));
  assert.equal(lock.schema, 'door2-v8');
  assert.equal(lock.identity, 'absent');
});

// ---------------------------------------------------------------------------
// S1-S4: the writer, independently of the page

const refusesToStore = (fn, check) => {
  const before = raw();
  assert.throws(fn, (err) => {
    assert.ok(err instanceof DraftNotStorableError, `expected DraftNotStorableError, got ${err?.name}`);
    assert.equal(err.check, check);
    return true;
  });
  assert.equal(raw(), before, 'a refused save writes nothing');
};

test('S1: the writer refuses every identity-bearing trip and leaves storage untouched', () => {
  store.clear();
  seed([env(v7(), { id: 'kept' })]);
  for (const identity of [IDENTITY, EMPTY_IDENTITY, { version: 1, used: 'bad', blocks: {}, edits: {} }, { version: 99 }]) {
    refusesToStore(() => saveDraftTrip(withIdentity(clone(PERU), identity), 'Peru, 10 days', 'Peru'), 'identity');
  }
  assert.deepEqual(JSON.parse(raw()).map((d) => d.id), ['kept'], 'the surviving record is untouched');
});

// The one case Rule B cannot catch: there is no identity key to refuse, so the schema
// allowlist is the only thing standing between a v8 payload and a v7 restamp.
test('S2: a door2-v8 trip carrying no identity at all is refused by the schema allowlist', () => {
  store.clear();
  refusesToStore(() => saveDraftTrip(v8(), 'Peru, 10 days', 'Peru'), 'schema');
});

test('S3: presence, not truthiness — every present identity value refuses', () => {
  store.clear();
  // {} and [] are truthy; null, 0, false, '' and an explicit undefined are falsey. All
  // seven are a present key and must refuse. `if (trip.identity)` would pass five of them.
  for (const value of [{}, [], null, 0, false, '', undefined]) {
    const trip = clone(PERU);
    trip.identity = value;
    assert.ok('identity' in trip, 'the key is present whatever the value');
    refusesToStore(() => saveDraftTrip(trip, 'Peru, 10 days', 'Peru'), 'identity');
  }
});

test('S4: a legacy identity-free trip still saves as door2-v7, exactly as today', () => {
  store.clear();
  const id = saveDraftTrip(clone(PERU), 'Peru, 10 days', 'Peru');
  const stored = JSON.parse(raw()).find((d) => d.id === id);
  assert.equal(stored.envelopeVersion, 2);
  assert.equal(stored.trip.versions.schema, 'door2-v7', 'the writer still stamps v7, never v8');
  assert.equal('identity' in stored.trip, false, 'no identity is created anywhere in packet 1a');
  assert.equal(loadDraftTrip(id).compatible, true, 'and it reopens');
});

// ---------------------------------------------------------------------------
// L12 at the storage layer: the approved Delete exception

test('L12: deleting a locked v8 record removes only it and preserves every survivor', () => {
  store.clear();
  const survivors = [env(v7(), { id: 'keep_v7' }), env(withIdentity(v8(), IDENTITY), { id: 'keep_v8' })];
  seed([env(v8(), { id: 'target' }), ...survivors]);
  store.set('unrelated_key', 'untouched');

  deleteDraftTrip('target');

  const after = JSON.parse(raw());
  assert.deepEqual(after.map((d) => d.id), ['keep_v7', 'keep_v8'], 'only the selected record is gone');
  // Parsed-value equality, not byte equality: serialisation may legitimately change the
  // representation of the records it keeps while preserving every one of them.
  assert.deepStrictEqual(after, json(survivors), 'survivors keep their complete payload and envelope values');
  assert.equal(store.get('unrelated_key'), 'untouched', 'no unrelated storage key is touched');
  assert.equal(loadDraftTrip('keep_v8').compatible, true, 'and a surviving locked record still opens');
});
