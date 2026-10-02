import { test } from 'node:test';
import assert from 'node:assert/strict';

// F4 persistence, Stage A: the draft READER. These tests pin what the reader accepts,
// what it refuses and by what name, and that reading never changes a stored byte.
// Build brief docs/build-brief-f4-persistence-storage-guard-2026-10-02.md, tests 1–4,
// 6, 10, 11 and the read half of 12. Stage B (the writer) adds 5, 7, 8, 9, 13 and the
// write half of 12.
//
// Stage A.2 (docs/build-brief-f4-stage-a2-compat-and-label-2026-10-02.md, tests A2.1–A2.6)
// narrowly changes the writer: a door2-v7 payload is saved in envelope version 2 so it
// reopens, and a save over unreadable storage is refused.
//
// Stage B (docs/build-brief-f4-stage-b-writer-cutover-2026-10-02.md) is the writer cutover:
// every save is envelope version 2 with a door2-v7 payload, stamped on a copy and checked
// with the reader's own shape check before anything is written; door2-v5 is refused on
// read, by name, and kept in storage. Tests 1, 4, 10, A2.1 and A2.2 were rewritten to that
// contract; tests 5, 7, 8, 9, the write half of 12 and B1–B5 are new.

import {
  DraftNotStorableError,
  DraftStorageUnreadableError,
  deleteDraftTrip,
  draftDisplayLabel,
  draftStorageStatus,
  listDraftTrips,
  loadDraftTrip,
  saveDraftTrip
} from '../../src/lib/door2/draftStorage.js';
import { pinActivity, swapActivity } from '../../src/lib/door2/edit.js';
import { compileFamilies } from '../../src/lib/door2/families.js';
import { PILOT_DATA, buildFilledTrip } from '../../src/lib/door2/planner.js';
import { applyProposal, previewAddExcursion, previewAdjustNights } from '../../src/lib/door2/restructure.js';
import { SKELETON_FIXTURES } from './fixtures/skeletonFixtures.js';
import { synBundle, synSpec } from './helpers/syntheticHub.js';

const KEY = 'door2_drafts_v1';
const DRAFTS = { reviewPolicy: 'allow_drafts' };

const store = new Map();
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) };
const raw = () => store.get(KEY) ?? null;
const seed = (entries) => store.set(KEY, JSON.stringify(entries));
const json = (x) => JSON.parse(JSON.stringify(x));

const must = (r) => {
  assert.equal(r.ok, true, JSON.stringify(r).slice(0, 200));
  return r.trip;
};

/** Every trip shape the page can hand to saveDraftTrip: built, edited, restructured, with day trips. */
function realTrips() {
  const trips = [];
  for (const [name, spec] of Object.entries(SKELETON_FIXTURES)) {
    const t = buildFilledTrip(spec, PILOT_DATA, DRAFTS);
    if (t.ok === false) continue; // a failure result, which the page never offers to save
    trips.push([name, t]);
  }
  const peru = buildFilledTrip(SKELETON_FIXTURES.F2, PILOT_DATA, DRAFTS);
  trips.push(['F2 swapped and pinned', must(pinActivity(must(swapActivity(peru, 'op:pc_cusco:d1')), 'op:pc_cusco:d2'))]);
  const longer = previewAdjustNights(peru, 'pc_cusco', 1, DRAFTS);
  trips.push(['F2 cusco +1 night', must(applyProposal(peru, longer.proposals[0]))]);
  const B = synBundle(compileFamilies);
  const hub = buildFilledTrip(synSpec(9, { routeTemplateId: 'syn_hub+spur@after_base' }), B.data, { content: B.content });
  const added = previewAddExcursion(hub, 'lx_base', 'sintra', B.options);
  trips.push(['synthetic hub with a day trip', must(applyProposal(hub, added.proposals[0]))]);
  return trips;
}
const TRIPS = realTrips();
const PERU = TRIPS.find(([n]) => n === 'F2')[1];

const stampV7 = (t) => ({ ...t, versions: { ...t.versions, schema: 'door2-v7' } });
const toV5 = (t) => {
  const { routePlan, ...rest } = t;
  return { ...rest, versions: { ...t.versions, schema: 'door2-v5' }, history: [] };
};
const legacy = (trip, extra = {}) => ({ id: 'd_legacy', label: 'Peru, 10 days', savedAt: '2026-10-01T10:00:00.000Z', trip, ...extra });
const v2 = (trip, extra = {}) => ({
  envelopeVersion: 2,
  id: 'd_v2',
  label: 'Peru, 10 days',
  destinationLabel: 'Peru',
  savedAt: '2026-10-02T10:00:00.000Z',
  trip,
  ...extra
});

/** loadDraftTrip and listDraftTrips, asserting neither changes a stored byte (test 10). */
function load(id) {
  const before = raw();
  const r = loadDraftTrip(id);
  listDraftTrips();
  assert.equal(raw(), before, `storage unchanged by reading ${id}`);
  return r;
}

const UNREADABLE = "Saved trips couldn't be read from this browser's storage.";
const V5_REFUSED = (name) =>
  `"${name}" can't be reopened here — it was saved in an older trip format that this version no longer opens. The saved trip has not been deleted.`;

// ---------------------------------------------------------------------------
// 1. Unversioned envelopes: v6 unchanged; v5 refused by name since Stage B

test('1: an unversioned v6 draft opens as saved; an unversioned v5 draft is refused by name and stays stored', () => {
  store.clear();
  seed([legacy(PERU, { id: 'six' }), legacy(toV5(PERU), { id: 'five' })]);
  const bytes = raw();
  assert.deepStrictEqual(load('six'), { compatible: true, trip: json(PERU) });
  // Was: upgraded on read to door2-v6 by upgradeV5toV6. Stage B: a compatibility change, not a loss.
  assert.deepStrictEqual(load('five'), { compatible: false, reason: V5_REFUSED('Peru, 10 days') });
  assert.ok(listDraftTrips().some((d) => d.id === 'five'), 'the v5 draft is still listed');
  assert.equal(raw(), bytes, 'the v5 entry is still stored, byte for byte');
});

// ---------------------------------------------------------------------------
// 2. envelopeVersion 2 + door2-v7 opens, for every real trip shape

test('2: envelopeVersion 2 with a door2-v7 payload opens, returned exactly as saved', () => {
  for (const [name, t] of TRIPS) {
    store.clear();
    const stored = stampV7({ ...t, history: [] });
    seed([v2(stored)]);
    const r = load('d_v2');
    assert.equal(r.compatible, true, `${name}: ${r.reason}`);
    assert.deepStrictEqual(r.trip, json(stored), `${name}: not rebuilt or repaired`);
  }
  // history and contentGaps are not required.
  store.clear();
  const { history, contentGaps, ...bare } = stampV7(PERU);
  seed([v2(bare)]);
  assert.equal(load('d_v2').compatible, true);
});

// ---------------------------------------------------------------------------
// 3. Refusals, by name

const refusedAs = (r, pattern) => {
  assert.equal(r.compatible, false);
  assert.match(r.reason, /^"Peru" can't be reopened here — /, 'named from the envelope');
  assert.match(r.reason, pattern);
};

test('3a: envelopeVersion 2 refuses any payload schema but door2-v7', () => {
  for (const schema of ['door2-v6', 'door2-v5', 'door2-v8', undefined]) {
    store.clear();
    seed([v2({ ...PERU, versions: { ...PERU.versions, schema } })]);
    refusedAs(load('d_v2'), /saved format and trip version don't match/);
  }
  store.clear();
  seed([v2(null)]);
  refusedAs(load('d_v2'), /saved format and trip version don't match/);
});

test('3b: an envelopeVersion other than exactly 2 is refused, whatever the payload', () => {
  for (const ev of [3, 99, 'banana', null, 0, 1, '2', 2.5, -2, [2], { v: 2 }]) {
    for (const trip of [stampV7(PERU), PERU, toV5(PERU)]) {
      store.clear();
      seed([v2(trip, { envelopeVersion: ev })]);
      refusedAs(load('d_v2'), /saved in a format this version doesn't recognise/);
    }
  }
});

// One case per required field (brief §3). Each mutates a fresh v7 copy.
const SHAPE_CASES = [
  ['trip', () => 'not a trip'],
  ['versions.schema', (t) => { t.versions = 'door2-v7'; }],
  ['versions.engine', (t) => { delete t.versions.engine; }],
  ['versions.content', (t) => { t.versions.content = 1; }],
  ['versions.routeData', (t) => { t.versions.routeData = null; }],
  ['versions.bufferRuleset', (t) => { t.versions.bufferRuleset = { id: 'x' }; }],
  ['spec', (t) => { t.spec = []; }],
  ['spec.totalDays', (t) => { t.spec.totalDays = 0; }],
  ['spec.totalDays', (t) => { t.spec.totalDays = 10.5; }],
  ['spec.totalDays', (t) => { t.spec.totalDays = '10'; }],
  ['spec.destination', (t) => { delete t.spec.destination; }],
  ['spec.destination', (t) => { t.spec.destination = null; }],
  ['spec.choices', (t) => { t.spec.choices = null; }],
  ['spec.choices.pinned', (t) => { delete t.spec.choices.pinned; }],
  ['spec.choices.rejected', (t) => { t.spec.choices.rejected = {}; }],
  ['spec.choices.placed', (t) => { t.spec.choices.placed = 'x'; }],
  ['routePlan', (t) => { delete t.routePlan; }],
  ['routePlan.variantId', (t) => { t.routePlan.variantId = null; }],
  ['routePlan.stops', (t) => { t.routePlan.stops = []; }],
  ['routePlan.stops', (t) => { t.routePlan.stops = {}; }],
  ['routePlan.stops', (t) => { t.routePlan.stops[1] = null; }],
  ['routePlan.stops.key', (t) => { delete t.routePlan.stops.at(-1).key; }],
  ['routePlan.stops.placeId', (t) => { t.routePlan.stops[0].placeId = 7; }],
  ['routePlan.stops.nights', (t) => { t.routePlan.stops[0].nights = 1.5; }],
  ['routePlan.stops.nights', (t) => { delete t.routePlan.stops[0].nights; }],
  ['routePlan.connectionIds', (t) => { t.routePlan.connectionIds = null; }],
  ['routePlan.minDays', (t) => { t.routePlan.minDays = '8'; }],
  ['routePlan.maxDays', (t) => { t.routePlan.maxDays = null; }],
  ['days', (t) => { t.days = {}; }],
  ['days', (t) => { t.days[3] = null; }],
  ['days.length', (t) => { t.days.pop(); }],
  ['days.length', (t) => { t.spec.totalDays = 11; }],
  ['days.dayNumber', (t) => { delete t.days.at(-1).dayNumber; }],
  ['days.blocks', (t) => { t.days[0].blocks = null; }],
  ['days.blocks', (t) => { t.days[0].blocks.push(null); }],
  ['days.blocks.id', (t) => { delete t.days[2].blocks[0].id; }],
  ['days.blocks.type', (t) => { t.days.at(-1).blocks.at(-1).type = 3; }],
  ['status', (t) => { delete t.status; }],
  ['warnings', (t) => { t.warnings = null; }]
];

test('3c: a door2-v7 payload failing the shape check is refused, naming the field', () => {
  for (const [field, mutate] of SHAPE_CASES) {
    store.clear();
    const t = json(stampV7(PERU));
    const out = mutate(t);
    seed([v2(out === undefined ? t : out)]);
    const r = load('d_v2');
    const expected = field === 'trip' || field === 'versions.schema' ? /saved format and trip version don't match/ : /saved trip is incomplete/;
    refusedAs(r, expected);
    if (field !== 'trip' && field !== 'versions.schema') {
      assert.ok(r.reason.endsWith(`(${field}).`), `${field}: ${r.reason}`);
    }
  }
});

test('3d: the shape check refuses without repairing — a short trip is not rescheduled', () => {
  store.clear();
  const t = json(stampV7(PERU));
  t.days.pop();
  seed([v2(t)]);
  refusedAs(load('d_v2'), /\(days\.length\)\.$/);
  assert.equal(JSON.parse(raw())[0].trip.days.length, 9, 'stored payload untouched');
});

// ---------------------------------------------------------------------------
// 4. Invisibility: nothing the Stage-B writer produces is refused by the Stage-B reader

test('4: every draft the current writer saves opens — always envelope version 2 with a door2-v7 payload', () => {
  store.clear();
  const ids = [];
  for (const [name, t] of TRIPS) {
    const saved = { ...t, history: [] }; // as Door2Plan.jsx's handleSaveDraft passes it
    const id = saveDraftTrip(saved, `${name} label`);
    ids.push(id);
    const entry = JSON.parse(raw()).find((d) => d.id === id);
    // Was: ['id', 'label', 'savedAt', 'trip'] — the Stage-A writer emitted no envelopeVersion.
    assert.deepEqual(Object.keys(entry), ['envelopeVersion', 'id', 'label', 'savedAt', 'trip'], 'the Stage-B writer always emits envelope 2');
    assert.equal(entry.envelopeVersion, 2);
    const r = loadDraftTrip(id);
    assert.equal(r.compatible, true, `${name}: ${r.reason}`);
    assert.deepStrictEqual(r.trip, json(stampV7(saved)), `${name}: loaded as saved, stamped door2-v7`);
  }
  // Also with the session history left in (the writer stores whatever it's handed).
  const withHistory = TRIPS.find(([n]) => n === 'F2 cusco +1 night')[1];
  assert.ok(withHistory.history.length > 0);
  assert.equal(loadDraftTrip(saveDraftTrip(withHistory, 'with history')).compatible, true);

  assert.deepEqual(new Set(listDraftTrips().map((d) => d.id)), new Set([...ids, JSON.parse(raw()).at(-1).id]));
  assert.equal(draftStorageStatus(), 'ok');
});

// ---------------------------------------------------------------------------
// 6. Refusals name the draft from envelope metadata only

test('6: a refusal names the draft from destinationLabel, then label, then savedAt — never from inside trip', () => {
  const marked = json(stampV7(PERU));
  marked.id = 'SENTINEL_trip_id';
  marked.spec.destination = { kind: 'country', id: 'SENTINEL_destination' };
  marked.routePlan.variantId = 'SENTINEL_variant';
  marked.label = 'SENTINEL_label';
  marked.destinationLabel = 'SENTINEL_destinationLabel';
  const badShape = { ...marked, warnings: 'SENTINEL_warnings' };
  const badSchema = { ...marked, versions: { ...marked.versions, schema: 'SENTINEL_schema' } };

  const cases = [
    [{ envelopeVersion: 99, trip: marked }],
    [{ envelopeVersion: 2, trip: badSchema }],
    [{ envelopeVersion: 2, trip: badShape }]
  ];
  const names = [
    [{ destinationLabel: 'Japan', label: 'Japan, 14 days' }, '"Japan" can\'t be reopened here'],
    [{ destinationLabel: undefined, label: 'Japan, 14 days' }, '"Japan, 14 days" can\'t be reopened here'],
    [{ destinationLabel: '', label: '' }, '"The draft saved 2026-10-02T10:00:00.000Z" can\'t be reopened here'],
    [{ destinationLabel: 42, label: null }, '"The draft saved 2026-10-02T10:00:00.000Z" can\'t be reopened here']
  ];
  for (const [extra] of cases) {
    for (const [meta, opening] of names) {
      store.clear();
      seed([v2(extra.trip, { ...meta, envelopeVersion: extra.envelopeVersion })]);
      const r = load('d_v2');
      assert.equal(r.compatible, false);
      assert.ok(r.reason.startsWith(opening), r.reason);
      assert.doesNotMatch(r.reason, /SENTINEL/, 'nothing from inside trip');
    }
  }
});

test("6b: the unversioned path keeps today's message, unchanged", () => {
  store.clear();
  seed([legacy({ ...PERU, versions: { ...PERU.versions, schema: 'door2-v4' } }), legacy({ nope: true }, { id: 'junk' })]);
  assert.deepStrictEqual(load('d_legacy'), { compatible: false, reason: 'Built with schema "door2-v4" — can\'t be reopened here.' });
  assert.deepStrictEqual(load('junk'), { compatible: false, reason: 'Built with schema "unknown" — can\'t be reopened here.' });
  // An unversioned door2-v7 payload is not accepted: v7 belongs to envelope version 2 only.
  store.clear();
  seed([legacy(stampV7(PERU))]);
  assert.deepStrictEqual(load('d_legacy'), { compatible: false, reason: 'Built with schema "door2-v7" — can\'t be reopened here.' });
});

// ---------------------------------------------------------------------------
// 10. Refusing a draft leaves storage unchanged (byte-compared)

test('10: refused loads leave every stored byte as it was', () => {
  store.clear();
  const entries = [
    legacy(PERU, { id: 'ok_v6' }),
    legacy({ ...PERU, versions: { ...PERU.versions, schema: 'door2-v4' } }, { id: 'v4' }),
    legacy(toV5(PERU), { id: 'v5' }),
    v2(stampV7(PERU), { id: 'ok_v7' }),
    v2(PERU, { id: 'v2_v6' }),
    v2(stampV7(PERU), { id: 'ev99', envelopeVersion: 99 }),
    v2(stampV7(PERU), { id: 'ev_null', envelopeVersion: null }),
    v2({ ...stampV7(PERU), days: [] }, { id: 'short' })
  ];
  // Deliberately odd but valid JSON formatting: a rewrite would normalise it.
  const bytes = JSON.stringify(entries, null, 3);
  store.set(KEY, bytes);
  // 'v5' was in the opening list until Stage B; it is now refused (and, as every id here, left stored).
  for (const id of ['v4', 'v5', 'v2_v6', 'ev99', 'ev_null', 'short', 'missing']) {
    assert.equal(load(id).compatible, false, id);
  }
  for (const id of ['ok_v6', 'ok_v7']) assert.equal(load(id).compatible, true, id);
  assert.equal(raw(), bytes);
});

// ---------------------------------------------------------------------------
// 11. Malformed entries never hide readable drafts

const GOOD = () => [legacy(PERU, { id: 'good_v6', savedAt: '2026-10-01T09:00:00.000Z' }), v2(stampV7(PERU), { id: 'good_v7', savedAt: '2026-10-02T09:00:00.000Z' })];
const MALFORMED = [
  ['a null entry', null],
  ['an entry missing savedAt', { id: 'no_saved_at', label: 'x', trip: PERU }],
  ['an entry with a null savedAt', { id: 'null_saved_at', label: 'x', savedAt: null, trip: PERU }],
  ['an entry with a numeric savedAt', { id: 'num_saved_at', label: 'x', savedAt: 20261002, trip: PERU }],
  ['an entry missing id', { label: 'x', savedAt: '2026-10-03T00:00:00.000Z', trip: PERU }],
  ['a number', 42],
  ['a string', 'draft'],
  ['an array', [{ id: 'nested', savedAt: '2026-10-03T00:00:00.000Z' }]],
  ['true', true]
];

test('11: a malformed entry in first, middle or last position never stops the others listing and opening', () => {
  for (const [what, bad] of MALFORMED) {
    for (const position of ['first', 'middle', 'last']) {
      store.clear();
      const [a, b] = GOOD();
      const entries = position === 'first' ? [bad, a, b] : position === 'middle' ? [a, bad, b] : [a, b, bad];
      seed(entries);
      const before = raw();
      let listed;
      assert.doesNotThrow(() => (listed = listDraftTrips()), `${what}, ${position}`);
      assert.deepEqual(listed.map((d) => d.id), ['good_v7', 'good_v6'], `${what}, ${position}: newest first, malformed skipped`);
      assert.equal(load('good_v6').compatible, true, `${what}, ${position}`);
      assert.equal(load('good_v7').compatible, true, `${what}, ${position}`);
      assert.equal(raw(), before, `${what}, ${position}: the malformed entry is left in storage`);
      assert.equal(draftStorageStatus(), 'ok');
    }
  }
});

test('11b: several malformed entries together, plus a well-formed unsupported one, still leave the good drafts usable', () => {
  store.clear();
  const [a, b] = GOOD();
  const unsupported = v2(stampV7(PERU), { id: 'future', envelopeVersion: 3, savedAt: '2026-10-03T00:00:00.000Z' });
  seed([null, a, ...MALFORMED.map(([, m]) => m), unsupported, b, null]);
  assert.deepEqual(listDraftTrips().map((d) => d.id), ['future', 'good_v7', 'good_v6'], 'the unsupported draft is listed, to be refused on open');
  refusedAs(load('future'), /saved in a format this version doesn't recognise/);
  assert.equal(load('good_v6').compatible, true);
  assert.equal(load('good_v7').compatible, true);
  // A malformed entry is not openable by id either.
  assert.deepStrictEqual(load('no_saved_at'), { compatible: false, reason: 'Draft not found.' });
});

// ---------------------------------------------------------------------------
// 12 (read half). An unreadable store is reported, not read as empty, and its bytes stay

test('12 (read): an unreadable store is reported as such and its bytes are preserved', () => {
  for (const bytes of ['{"this is not valid json', '{"drafts":[]}', 'null', '42', '"text"', 'true', '']) {
    store.clear();
    store.set(KEY, bytes);
    assert.equal(draftStorageStatus(), 'unreadable', JSON.stringify(bytes));
    assert.deepEqual(listDraftTrips(), []);
    assert.deepStrictEqual(loadDraftTrip('anything'), { compatible: false, reason: UNREADABLE });
    assert.equal(raw(), bytes, `${JSON.stringify(bytes)} is still there, byte for byte`);
  }
});

test('12 (read): a storage read that throws is unreadable, not empty', () => {
  const real = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: () => {
      throw new Error('SecurityError');
    }
  };
  try {
    assert.equal(draftStorageStatus(), 'unreadable');
    assert.deepEqual(listDraftTrips(), []);
    assert.deepStrictEqual(loadDraftTrip('x'), { compatible: false, reason: UNREADABLE });
  } finally {
    globalThis.localStorage = real;
  }
});

test('12 (read): empty is not unreadable', () => {
  store.clear();
  assert.equal(draftStorageStatus(), 'empty');
  assert.deepEqual(listDraftTrips(), []);
  assert.deepStrictEqual(loadDraftTrip('x'), { compatible: false, reason: 'Draft not found.' });
  store.set(KEY, '[]');
  assert.equal(draftStorageStatus(), 'ok');
  assert.deepEqual(listDraftTrips(), []);
});

test('11c: deleting beside a malformed entry never throws and leaves the malformed entry stored', () => {
  seed([legacy(PERU, { id: 'd_good' }), null]);
  assert.doesNotThrow(() => deleteDraftTrip('d_good'));
  assert.deepEqual(JSON.parse(raw()), [null], 'the good draft is gone, the null entry is still there');
  assert.deepEqual(listDraftTrips(), []);

  const before = raw();
  assert.doesNotThrow(() => deleteDraftTrip('d_absent'));
  assert.equal(raw(), before, 'deleting an absent id changes no stored byte');
});

// ---------------------------------------------------------------------------
// Stage A.2. A2.1–A2.3: a draft the reader accepts can be saved again and reopened.

// As Door2Plan.jsx's handleSaveDraft passes it: a shallow copy, so copy.versions === active.versions.
// The page always passes a destinationLabel; the two-argument form stays valid (test B5).
const pageSave = (active, label, destinationLabel) => saveDraftTrip({ ...active, history: [] }, label, destinationLabel);
const KEYS_WITH_DESTINATION = ['envelopeVersion', 'id', 'label', 'destinationLabel', 'savedAt', 'trip'];
const KEYS_WITHOUT_DESTINATION = ['envelopeVersion', 'id', 'label', 'savedAt', 'trip'];
const entryOf = (id) => JSON.parse(raw()).find((d) => d.id === id);

test('A2.1: a v2/door2-v7 draft loads, saves and reopens, still in envelope version 2, itinerary, choices and warnings intact', () => {
  for (const [name, t] of TRIPS) {
    store.clear();
    const stored = stampV7({ ...t, history: [] });
    seed([v2(stored)]);
    const loaded = loadDraftTrip('d_v2');
    assert.equal(loaded.compatible, true, `${name}: ${loaded.reason}`);

    const id = pageSave(loaded.trip, 'Peru, 10 days', 'Peru');
    const entry = entryOf(id);
    // Was: ['envelopeVersion', 'id', 'label', 'savedAt', 'trip'] — Stage B adds destinationLabel (§3).
    assert.deepEqual(Object.keys(entry), KEYS_WITH_DESTINATION, name);
    assert.equal(entry.destinationLabel, 'Peru', name);
    assert.equal(entry.envelopeVersion, 2, name);
    assert.equal(entry.trip.versions.schema, 'door2-v7', `${name}: payload neither stamped nor downgraded`);
    assert.deepStrictEqual(entry.trip, json(loaded.trip), `${name}: payload stored as handed in`);

    assert.ok(listDraftTrips().some((d) => d.id === id), `${name}: listed`);
    const reopened = loadDraftTrip(id);
    assert.equal(reopened.compatible, true, `${name}: ${reopened.reason}`);
    assert.deepStrictEqual(reopened.trip.days, json(stored.days), `${name}: itinerary`);
    assert.deepStrictEqual(reopened.trip.spec.choices, json(stored.spec.choices), `${name}: choices`);
    assert.deepStrictEqual(reopened.trip.warnings, json(stored.warnings), `${name}: warnings`);
    assert.deepStrictEqual(reopened.trip, json(stored), `${name}: the whole trip`);
  }
});

test('A2.1b: a reopened v7 trip edited in the session still saves to a draft that reopens', () => {
  store.clear();
  seed([v2(stampV7({ ...PERU, history: [] }))]);
  const edited = must(pinActivity(must(swapActivity(loadDraftTrip('d_v2').trip, 'op:pc_cusco:d1')), 'op:pc_cusco:d2'));
  const reopened = loadDraftTrip(pageSave(edited, 'edited'));
  assert.equal(reopened.compatible, true, reopened.reason);
  assert.deepStrictEqual(reopened.trip, json({ ...edited, history: [] }));
});

// Was: "a newly built v6 trip still saves in the legacy envelope … the default format is
// unchanged" (legacy envelope, v6 payload). Stage B inverts it: v7 is now the default.
test('A2.2: a newly built v6 trip saves in envelope version 2 with a door2-v7 payload, reopens, and the active trip is still v6', () => {
  store.clear();
  for (const [name, t] of TRIPS) {
    assert.equal(t.versions.schema, 'door2-v6', `${name} is built as v6`);
    const id = pageSave(t, `${name} label`, 'Peru');
    const entry = entryOf(id);
    assert.deepEqual(Object.keys(entry), KEYS_WITH_DESTINATION, name);
    assert.equal(entry.envelopeVersion, 2, name);
    assert.equal(entry.trip.versions.schema, 'door2-v7', name);
    const r = loadDraftTrip(id);
    assert.equal(r.compatible, true, `${name}: ${r.reason}`);
    assert.deepStrictEqual(r.trip, json(stampV7({ ...t, history: [] })), name);
    assert.equal(t.versions.schema, 'door2-v6', `${name}: the active trip is still v6 after saving`);
  }
});

test('A2.3: saving a v7 trip does not mutate the active trip', () => {
  store.clear();
  seed([v2(stampV7({ ...PERU, history: [] }))]);
  const active = loadDraftTrip('d_v2').trip;
  const versions = active.versions;
  const snapshot = structuredClone(active);
  pageSave(active, 'Peru, 10 days');
  assert.equal(active.versions, versions, 'same versions object');
  assert.equal(active.versions.schema, 'door2-v7');
  assert.deepStrictEqual(active, snapshot, 'nothing on the active trip changed');
});

// ---------------------------------------------------------------------------
// A2.4: any stored label yields a string at the display boundary; the entry is not touched

test('A2.4: object, missing, empty and non-string labels display as a safe string; storage is unchanged', () => {
  const cases = [
    [{ name: 'Peru' }, 'Untitled trip'],
    [['Peru'], 'Untitled trip'],
    [undefined, 'Untitled trip'],
    [null, 'Untitled trip'],
    ['', 'Untitled trip'],
    ['   ', 'Untitled trip'],
    [42, 'Untitled trip'],
    [true, 'Untitled trip'],
    ['Peru, 10 days', 'Peru, 10 days']
  ];
  for (const [label, shown] of cases) {
    store.clear();
    const entry = legacy(PERU, { id: 'odd' });
    if (label === undefined) delete entry.label;
    else entry.label = label;
    seed([entry, legacy(PERU, { id: 'good', label: 'Good trip', savedAt: '2026-09-30T10:00:00.000Z' })]);
    const before = raw();
    const listed = listDraftTrips();
    assert.deepEqual(listed.map((d) => d.id), ['odd', 'good'], `${JSON.stringify(label)}: both listed`);
    const displayed = listed.map(draftDisplayLabel);
    assert.deepEqual(displayed, [shown, 'Good trip'], JSON.stringify(label));
    assert.ok(displayed.every((s) => typeof s === 'string'));
    assert.deepStrictEqual(listed[0].label, label, 'the listed entry still carries its stored label');
    assert.equal(raw(), before, `${JSON.stringify(label)}: stored bytes unchanged`);
  }
});

// ---------------------------------------------------------------------------
// A2.5–A2.6: a save checks current storage and refuses over an unreadable store

/** Wraps setItem so a test can tell whether a write was attempted at all. */
function countingWrites() {
  const real = globalThis.localStorage;
  let writes = 0;
  globalThis.localStorage = { getItem: real.getItem, setItem: (k, v) => (writes++, real.setItem(k, v)) };
  return { writes: () => writes, restore: () => (globalThis.localStorage = real) };
}

test('A2.5: saving over unreadable storage refuses, writes nothing and leaves the bytes byte-identical', () => {
  for (const bytes of ['{not json', '{"this is not valid json', '{"drafts":[]}', 'null', '42', '"text"', 'true', '']) {
    for (const trip of [PERU, stampV7(PERU)]) {
      store.clear();
      store.set(KEY, bytes);
      const w = countingWrites();
      try {
        assert.throws(() => saveDraftTrip({ ...trip, history: [] }, 'Peru, 10 days'), DraftStorageUnreadableError, JSON.stringify(bytes));
        assert.equal(w.writes(), 0, `${JSON.stringify(bytes)}: no write attempted`);
      } finally {
        w.restore();
      }
      assert.equal(raw(), bytes, `${JSON.stringify(bytes)}: original bytes still there`);
      assert.equal(draftStorageStatus(), 'unreadable');
    }
  }
});

test('A2.5b: a save checks current storage, not an earlier reading', () => {
  store.clear();
  pageSave(PERU, 'first');
  assert.equal(draftStorageStatus(), 'ok');
  store.set(KEY, '{not json'); // corrupted after the status was last read
  assert.throws(() => pageSave(PERU, 'second'), DraftStorageUnreadableError);
  assert.equal(raw(), '{not json');
  store.set(KEY, '[]'); // and readable again
  assert.equal(loadDraftTrip(pageSave(PERU, 'third')).compatible, true);
});

test('A2.5c: a storage read that throws refuses the save without writing', () => {
  const real = globalThis.localStorage;
  let writes = 0;
  globalThis.localStorage = {
    getItem: () => {
      throw new Error('SecurityError');
    },
    setItem: () => writes++
  };
  try {
    assert.throws(() => saveDraftTrip(PERU, 'Peru'), DraftStorageUnreadableError);
    assert.equal(writes, 0);
  } finally {
    globalThis.localStorage = real;
  }
});

test('A2.6: saving over readable storage still works, and an empty store saves normally', () => {
  store.clear();
  assert.equal(draftStorageStatus(), 'empty');
  const first = pageSave(PERU, 'first');
  assert.deepEqual(JSON.parse(raw()).map((d) => d.id), [first], 'an empty store gets a one-entry list');

  const existing = [legacy(PERU, { id: 'kept_v6' }), v2(stampV7(PERU), { id: 'kept_v7' }), null];
  seed(existing);
  const second = pageSave(PERU, 'second');
  const after = JSON.parse(raw());
  assert.deepStrictEqual(after.slice(0, 3), json(existing), 'existing entries, malformed included, kept as they were');
  assert.equal(after[3].id, second);
  for (const id of ['kept_v6', 'kept_v7', second]) assert.equal(loadDraftTrip(id).compatible, true, id);

  store.set(KEY, '[]');
  assert.equal(loadDraftTrip(pageSave(PERU, 'third')).compatible, true, "a stored '[]' saves normally");
});

// ---------------------------------------------------------------------------
// Stage B: the writer cutover (build brief docs/build-brief-f4-stage-b-writer-cutover-2026-10-02.md §7)

/** Runs fn while capturing what saveDraftTrip handed to JSON.stringify (the in-memory list it wrote). */
function capturingWrite(fn) {
  const real = JSON.stringify;
  let written = null;
  JSON.stringify = (v, ...rest) => {
    if (Array.isArray(v)) written = v;
    return real(v, ...rest);
  };
  try {
    return { result: fn(), written: () => written };
  } finally {
    JSON.stringify = real;
  }
}

/** Asserts fn throws DraftNotStorableError with this check (and field, for a shape failure),
 * attempts no write, and leaves the stored bytes exactly as they were. */
function refusesToStore(fn, check, field, what) {
  const before = raw();
  const w = countingWrites();
  try {
    assert.throws(fn, (err) => {
      assert.ok(err instanceof DraftNotStorableError, `${what}: ${err}`);
      assert.equal(err.name, 'DraftNotStorableError');
      assert.equal(err.check, check, what);
      if (field) assert.equal(err.field, field, what);
      return true;
    });
    assert.equal(w.writes(), 0, `${what}: no write attempted`);
  } finally {
    w.restore();
  }
  assert.equal(raw(), before, `${what}: stored bytes unchanged`);
}

test('5: Stage B writes envelope 2 + door2-v7; door2-v6 still opens; door2-v5 is refused by name and kept byte for byte', () => {
  store.clear();
  const v5 = legacy(toV5(PERU), { id: 'v5', label: 'Old Peru trip' });
  const v6 = legacy(PERU, { id: 'v6', savedAt: '2026-09-30T10:00:00.000Z' });
  seed([v5, v6]);
  const v5Bytes = JSON.stringify(v5);

  const id = pageSave(PERU, 'Peru, 10 days', 'Peru');
  const entry = entryOf(id);
  assert.equal(entry.envelopeVersion, 2);
  assert.equal(entry.trip.versions.schema, 'door2-v7');
  assert.equal(load(id).compatible, true);

  assert.deepStrictEqual(load('v6'), { compatible: true, trip: json(PERU) }, 'door2-v6 still opens as saved');

  const r = load('v5');
  assert.deepStrictEqual(r, { compatible: false, reason: V5_REFUSED('Old Peru trip') });
  assert.match(r.reason, /no longer opens/);
  assert.match(r.reason, /has not been deleted/);
  assert.ok(listDraftTrips().some((d) => d.id === 'v5'), 'the v5 draft is still listed');
  assert.equal(JSON.stringify(JSON.parse(raw()).find((d) => d.id === 'v5')), v5Bytes, 'the v5 entry is still stored, byte for byte');

  // Every other unsupported legacy schema keeps today's message.
  store.clear();
  seed([legacy({ ...PERU, versions: { ...PERU.versions, schema: 'door2-v4' } })]);
  assert.deepStrictEqual(load('d_legacy'), { compatible: false, reason: 'Built with schema "door2-v4" — can\'t be reopened here.' });
});

test('7: the round trip preserves everything — versions.schema is the only difference, across every real trip', () => {
  for (const [name, t] of TRIPS) {
    store.clear();
    const handed = { ...t, history: [] };
    const loaded = loadDraftTrip(pageSave(t, `${name} label`, 'Peru'));
    assert.equal(loaded.compatible, true, `${name}: ${loaded.reason}`);
    const before = json(handed);
    const after = loaded.trip;
    assert.deepEqual(Object.keys(after).sort(), Object.keys(before).sort(), `${name}: same fields`);
    for (const key of Object.keys(before)) {
      if (key === 'versions') continue;
      assert.deepStrictEqual(after[key], before[key], `${name}: ${key}`);
    }
    const { schema: was, ...versionsBefore } = before.versions;
    const { schema: now, ...versionsAfter } = after.versions;
    assert.deepStrictEqual(versionsAfter, versionsBefore, `${name}: versions other than schema`);
    assert.deepEqual([was, now], ['door2-v6', 'door2-v7'], name);
    // Named explicitly, as the brief asks.
    assert.deepStrictEqual(after.spec.choices, before.spec.choices, `${name}: spec.choices`);
    for (const k of ['pinned', 'rejected', 'placed']) assert.ok(Array.isArray(after.spec.choices[k]), `${name}: choices.${k}`);
    assert.deepStrictEqual(after.days, before.days, `${name}: days`);
    assert.deepStrictEqual(after.warnings, before.warnings, `${name}: warnings`);
    assert.deepStrictEqual(after.routePlan, before.routePlan, `${name}: routePlan`);
  }
});

test('8: saving does not mutate the active trip — the stamp is on a copy with a fresh versions object', () => {
  for (const [name, t] of TRIPS) {
    store.clear();
    const active = structuredClone(t);
    const versions = active.versions;
    const snapshot = structuredClone(active);
    const { written } = capturingWrite(() => pageSave(active, 'Peru, 10 days', 'Peru'));
    const stored = written().at(-1).trip;
    assert.equal(stored.versions.schema, 'door2-v7', name);
    assert.equal(active.versions.schema, 'door2-v6', `${name}: the active trip is still v6`);
    assert.notEqual(stored.versions, active.versions, `${name}: stored.versions is not the active trip's versions object`);
    assert.equal(active.versions, versions, `${name}: the active trip keeps its own versions object`);
    assert.deepStrictEqual(active, snapshot, `${name}: nothing on the active trip changed`);
  }
});

// The reader as it was at ec0d8fa (before Stage A): unversioned entries only, envelopeVersion
// ignored, door2-v5 upgraded and door2-v6 opened. Pinned here so a later change to the real
// reader can't make this test pass by accident.
const PRE_STAGE_A_SCHEMAS = ['door2-v5', 'door2-v6'];
function preStageALoad(entries, id) {
  const entry = entries.find((d) => d.id === id);
  if (!entry) return { compatible: false, reason: 'Draft not found.' };
  const schema = entry.trip?.versions?.schema;
  if (!PRE_STAGE_A_SCHEMAS.includes(schema)) {
    return { compatible: false, reason: `Built with schema "${schema ?? 'unknown'}" — can't be reopened here.` };
  }
  return { compatible: true, trip: entry.trip };
}

test('9: a pre-Stage-A reader refuses every Stage-B record — an old tab refuses, never misreads', () => {
  store.clear();
  const ids = TRIPS.map(([name, t]) => pageSave(t, `${name} label`, 'Peru'));
  const entries = JSON.parse(raw());
  for (const id of ids) {
    assert.deepStrictEqual(preStageALoad(entries, id), { compatible: false, reason: 'Built with schema "door2-v7" — can\'t be reopened here.' }, id);
    assert.equal(loadDraftTrip(id).compatible, true, `${id}: the current reader opens it`);
  }
  // Control: the replica still opens what it opened then.
  assert.equal(preStageALoad([legacy(PERU)], 'd_legacy').compatible, true);
});

test('12 (write): saving over an unreadable store refuses, writes nothing and leaves the bytes byte-identical', () => {
  for (const bytes of ['{"this is not valid json', '{"drafts":[]}']) {
    for (const trip of [PERU, stampV7(PERU)]) {
      store.clear();
      store.set(KEY, bytes);
      const w = countingWrites();
      try {
        assert.throws(() => pageSave(trip, 'Peru, 10 days', 'Peru'), DraftStorageUnreadableError, bytes);
        assert.equal(w.writes(), 0, `${bytes}: no write attempted`);
      } finally {
        w.restore();
      }
      assert.equal(raw(), bytes, `${bytes}: byte-identical`);
    }
  }
  // Readability is checked before the trip: an unstorable trip over unreadable storage is
  // reported as the storage failure.
  store.clear();
  store.set(KEY, '{"drafts":[]}');
  assert.throws(() => pageSave(toV5(PERU), 'x'), DraftStorageUnreadableError);
  assert.equal(raw(), '{"drafts":[]}');
});

test('B1 (amendment 1): a malformed door2-v6 input — one the legacy reader opens today — is refused, not written', () => {
  const { routePlan, ...noRoutePlan } = PERU;
  const { warnings, ...noWarnings } = PERU;
  for (const [field, trip] of [['routePlan', noRoutePlan], ['warnings', noWarnings]]) {
    // Today's legacy reader opens it (no shape check on the unversioned path)...
    store.clear();
    seed([legacy(trip)]);
    assert.equal(load('d_legacy').compatible, true, `${field}: the legacy reader opens it`);
    // ...but stamped v7 it would not reopen, so the writer refuses it, over empty and non-empty storage.
    for (const existing of [null, [legacy(PERU, { id: 'kept' })]]) {
      store.clear();
      if (existing) seed(existing);
      refusesToStore(() => pageSave(trip, 'Peru, 10 days', 'Peru'), 'shape', field, `v6 missing ${field}`);
    }
  }
});

test('B2 (amendment 1): a malformed input is refused whether it arrives as door2-v6 or already door2-v7', () => {
  for (const base of ['door2-v6', 'door2-v7']) {
    for (const [field, mutate] of SHAPE_CASES) {
      store.clear();
      seed([legacy(PERU, { id: 'kept' })]);
      const t = base === 'door2-v7' ? json(stampV7(PERU)) : json(PERU);
      const out = mutate(t);
      const trip = out === undefined ? t : out;
      // 'trip' and 'versions.schema' leave no readable schema, so they fail the input-schema check.
      const schemaLevel = field === 'trip' || field === 'versions.schema';
      refusesToStore(() => pageSave(trip, 'Peru, 10 days', 'Peru'), schemaLevel ? 'schema' : 'shape', schemaLevel ? null : field, `${base} ${field}`);
    }
  }
});

test('B3 (finding 3): an ineligible schema is refused — door2-v5 included — and nothing is appended', () => {
  store.clear();
  seed([legacy(PERU, { id: 'kept' })]);
  const cases = [
    ['door2-v5', toV5(PERU)],
    ['door2-v4', { ...PERU, versions: { ...PERU.versions, schema: 'door2-v4' } }],
    ['door2-v8', { ...PERU, versions: { ...PERU.versions, schema: 'door2-v8' } }],
    ['undefined', { ...PERU, versions: { ...PERU.versions, schema: undefined } }],
    ['undefined', { ...PERU, versions: undefined }],
    ['undefined', null]
  ];
  for (const [schema, trip] of cases) {
    refusesToStore(() => saveDraftTrip(trip, 'Peru, 10 days', 'Peru'), 'schema', null, schema);
    try {
      saveDraftTrip(trip, 'x');
    } catch (err) {
      assert.equal(err.schema, schema);
    }
  }
  assert.deepEqual(JSON.parse(raw()).map((d) => d.id), ['kept']);
});

test('B4: every trip in the TRIPS table passes the writer\'s candidate check (stop condition 4)', () => {
  store.clear();
  for (const [name, t] of TRIPS) assert.doesNotThrow(() => pageSave(t, name, 'Peru'), name);
  assert.equal(listDraftTrips().length, TRIPS.length);
});

test('B5 (amendment 5): without a usable destinationLabel the key is left out entirely; the draft reopens and a refusal names it from label', () => {
  const absent = [['two arguments'], ['undefined', undefined], ['null', null], ['empty', ''], ['number', 42], ['object', { name: 'Peru' }]];
  for (const [what, ...third] of absent) {
    store.clear();
    const id = saveDraftTrip({ ...PERU, history: [] }, 'Peru, 10 days', ...third);
    const bytes = raw();
    assert.doesNotMatch(bytes, /destinationLabel/, `${what}: not written as undefined, null or ''`);
    const entry = entryOf(id);
    assert.equal(Object.hasOwn(entry, 'destinationLabel'), false, what);
    assert.deepEqual(Object.keys(entry), KEYS_WITHOUT_DESTINATION, what);
    assert.equal(loadDraftTrip(id).compatible, true, `${what}: reopens`);

    // Make that writer-produced record unopenable and check the refusal names it from label.
    seed([{ ...entry, envelopeVersion: 99 }]);
    assert.ok(load(id).reason.startsWith('"Peru, 10 days" can\'t be reopened here'), what);
  }
  // With it, the key sits between label and savedAt and names a refusal.
  store.clear();
  const id = pageSave(PERU, 'Peru, 10 days', 'Peru');
  const entry = entryOf(id);
  assert.deepEqual(Object.keys(entry), KEYS_WITH_DESTINATION);
  seed([{ ...entry, envelopeVersion: 99 }]);
  assert.ok(load(id).reason.startsWith('"Peru" can\'t be reopened here'));
});
