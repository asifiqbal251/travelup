import { test } from 'node:test';
import assert from 'node:assert/strict';

// F4 persistence, Stage A: the draft READER. The writer is unchanged — it still emits
// no envelopeVersion — so these tests pin what the reader accepts, what it refuses
// and by what name, and that reading never changes a stored byte.
// Build brief docs/build-brief-f4-persistence-storage-guard-2026-10-02.md, tests 1–4,
// 6, 10, 11 and the read half of 12. Stage B (the writer) adds 5, 7, 8, 9, 13 and the
// write half of 12.

import { draftStorageStatus, listDraftTrips, loadDraftTrip, saveDraftTrip, upgradeV5toV6 } from '../../src/lib/door2/draftStorage.js';
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

// ---------------------------------------------------------------------------
// 1. Unversioned envelopes: today's path, unchanged

test('1: an unversioned v6 draft opens as saved; an unversioned v5 draft is upgraded as today', () => {
  store.clear();
  seed([legacy(PERU, { id: 'six' }), legacy(toV5(PERU), { id: 'five' })]);
  assert.deepStrictEqual(load('six'), { compatible: true, trip: json(PERU) });
  const five = load('five');
  assert.deepStrictEqual(five, upgradeV5toV6(json(toV5(PERU))), 'the existing upgrader, unchanged');
  assert.equal(five.compatible, true);
  assert.equal(five.trip.versions.schema, 'door2-v6');
  assert.deepStrictEqual(five.trip.days, json(PERU.days));
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
// 4. Invisibility: nothing the Stage-A writer produces is refused

test('4: every draft the current writer saves opens, through the unversioned path', () => {
  store.clear();
  const ids = [];
  for (const [name, t] of TRIPS) {
    const saved = { ...t, history: [] }; // as Door2Plan.jsx's handleSaveDraft passes it
    const id = saveDraftTrip(saved, `${name} label`);
    ids.push(id);
    const entry = JSON.parse(raw()).find((d) => d.id === id);
    assert.deepEqual(Object.keys(entry), ['id', 'label', 'savedAt', 'trip'], 'the Stage-A writer emits no envelopeVersion');
    const r = loadDraftTrip(id);
    assert.equal(r.compatible, true, `${name}: ${r.reason}`);
    assert.deepStrictEqual(r.trip, json(saved), `${name}: loaded as saved`);
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
  for (const id of ['v4', 'v2_v6', 'ev99', 'ev_null', 'short', 'missing']) {
    assert.equal(load(id).compatible, false, id);
  }
  for (const id of ['ok_v6', 'v5', 'ok_v7']) assert.equal(load(id).compatible, true, id);
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
