import { test } from 'node:test';
import assert from 'node:assert/strict';

// Q8 packet 2, stage A: the RECURSIVE WRITER BARRIER on saveDraftTrip.
// Build brief docs/briefs/q8-p2-stage-a/build-brief-q8-packet2-stage-a-writer-barrier-
// 2026-10-20-draft3.md as clarified by approval-addendum-…-clarifications-2026-10-20.md,
// tests W-1 to W-6 and W-9 to W-11 (§4). The DOM half (W-7, W-8) is in
// flowWriterBarrier.test.js. Governing contract: decision-record-q8-packet2-persistence-
// contract-2026-10-19-APPROVED.md §§3.2-3.3.
//
// The contract: a candidate carrying a reserved identity key ANYWHERE in its payload —
// arrays, history snapshots and branches unrelated to either alike — cannot be written
// under door2-v6 or door2-v7. It refuses by name, writes nothing, and leaves the stored
// bytes exactly as they were. Nothing is stripped, normalised or repaired to make a save
// succeed, and the input is never mutated.
//
// The standard every test here holds to: assert the COMPLETE effect — the whole refusal,
// or the stored bytes — with a paired control proving the same operation lands when it
// should. "No write happened" alone is a proxy.
//
// This stage writes no door2-v8, creates no identity and lifts no lock.

import {
  DraftNotStorableError,
  DraftStorageUnreadableError,
  listDraftTrips,
  loadDraftTrip,
  saveDraftTrip
} from '../../src/lib/door2/draftStorage.js';
import * as id from '../../src/lib/door2/identity.js';
import * as rs from '../../src/lib/door2/restructure.js';
import * as edit from '../../src/lib/door2/edit.js';
import { compileFamilies } from '../../src/lib/door2/families.js';
import { PILOT_DATA, buildFilledTrip } from '../../src/lib/door2/planner.js';
import { SKELETON_FIXTURES } from './fixtures/skeletonFixtures.js';
import { synBundle, synSpec } from './helpers/syntheticHub.js';

const KEY = 'door2_drafts_v1';
const DRAFTS = { reviewPolicy: 'allow_drafts' };

// A localStorage stand-in that COUNTS writes as well as holding bytes, so "zero writes"
// is asserted directly rather than inferred from bytes that happen to round-trip. The
// unreadable switch is what W-5's first row needs; `raw()` reads the Map behind it, so a
// byte comparison is never confused by that switch.
const store = new Map();
let writes = 0;
let unreadable = false;
globalThis.localStorage = {
  getItem: (k) => (unreadable ? '{ not json' : store.get(k) ?? null),
  setItem: (k, v) => { writes += 1; store.set(k, String(v)); },
  removeItem: (k) => store.delete(k)
};
const raw = () => store.get(KEY) ?? null;
const json = (x) => JSON.parse(JSON.stringify(x));
const clone = json;

// The error contract, frozen at 71e6538 (§3.5). Not derived from the implementation.
const FROZEN = {
  name: 'DraftNotStorableError',
  check: 'identity',
  schema: 'door2-v8',
  field: 'identity',
  message:
    'A trip that carries durable edit identity can only be saved as "door2-v8", which this version can\'t write. The saved trips already in this browser have not been changed.'
};

/**
 * The complete refusal: the named error, ZERO writes, and stored bytes byte-identical.
 * Returns the error so a caller can assert the rest of the frozen contract on it.
 */
function refuses(fn, check) {
  const before = raw();
  const writesBefore = writes;
  let err = null;
  try {
    fn();
  } catch (e) {
    err = e;
  }
  assert.ok(err, 'the save must be refused, not succeed');
  assert.ok(err instanceof DraftNotStorableError, `expected DraftNotStorableError, got ${err?.name}: ${err?.message}`);
  assert.equal(err.check, check, `refused by name: expected ${check}, got ${err.check}`);
  assert.equal(writes, writesBefore, 'a refused save performs ZERO writes');
  assert.equal(raw(), before, 'and the stored bytes are byte-identical');
  return err;
}

/** A save that must land, with the write and the reopen both asserted. */
function saves(trip, label) {
  const writesBefore = writes;
  const draftId = saveDraftTrip(trip, label, label);
  assert.ok(draftId, `${label} must save`);
  assert.equal(writes, writesBefore + 1, 'a successful save writes exactly once');
  const loaded = loadDraftTrip(draftId);
  assert.equal(loaded.compatible, true, `${label} must reopen: ${loaded.reason ?? ''}`);
  return { draftId, loaded };
}

/** A control save, so a later refusal is demonstrably about the input and not the store. */
function control(label = 'control') {
  return saves({ ...clone(PERU), history: [] }, label).draftId;
}

const stampV7 = (t) => ({ ...t, versions: { ...t.versions, schema: 'door2-v7' } });

// ---------------------------------------------------------------------------
// Real producer output. Nothing below is a hand-built trip: every trip is buildFilledTrip
// output, and every structural change goes through a public preview and applyProposal.

const must = (r) => {
  assert.equal(r.ok, true, JSON.stringify(r).slice(0, 200));
  return r.trip;
};

/** Every trip shape the page can hand to saveDraftTrip, across the named families. */
function realTrips() {
  const trips = [];
  for (const [name, spec] of Object.entries(SKELETON_FIXTURES)) {
    const t = buildFilledTrip(spec, PILOT_DATA, DRAFTS);
    if (t.ok === false) continue; // a failure result, which the page never offers to save
    trips.push([name, t]);
  }
  const peru = buildFilledTrip(SKELETON_FIXTURES.F2, PILOT_DATA, DRAFTS);
  trips.push(['F2 swapped and pinned', must(edit.pinActivity(must(edit.swapActivity(peru, 'op:pc_cusco:d1')), 'op:pc_cusco:d2'))]);
  const longer = rs.previewAdjustNights(peru, 'pc_cusco', 1, DRAFTS);
  trips.push(['F2 cusco +1 night', must(rs.applyProposal(peru, longer.proposals[0]))]);
  const hub = buildFilledTrip(synSpec(9, { routeTemplateId: 'syn_hub+spur@after_base' }), B.data, { content: B.content });
  const added = rs.previewAddExcursion(hub, 'lx_base', 'sintra', B.options);
  trips.push(['synthetic hub with a day trip', must(rs.applyProposal(hub, added.proposals[0]))]);
  return trips;
}

const B = synBundle(compileFamilies);
const TRIPS = realTrips();
const PERU = TRIPS.find(([n]) => n === 'F2')[1];
assert.equal(PERU.versions.schema, 'door2-v6', 'the producer emits door2-v6, which is what makes the v6 copy cases real');

// ---------------------------------------------------------------------------
// The identity engine harness, for the composed chain W-1, W-9, W-10 and W-11 run on.
// A deterministic token source and the paired opted-in / default option bags built from
// the SAME options, so the only difference between the two is the opt-in itself.

const AT = '2026-10-18T19:30:00.000Z';

function harness(prefix = 'w') {
  const state = { calls: 0 };
  const tokens = { crypto: { randomUUID: () => `${prefix}${++state.calls}` } };
  const common = { data: B.data, content: B.content, families: B.families };
  return {
    tokens,
    state,
    optIn: { ...common, identity: true, tokens, at: AT },
    dflt: { ...common },
    seed(trip) {
      const seeded = id.initialiseIdentityForBuild(trip, { data: B.data, tokens });
      assert.equal(seeded.ok, true, `seeding failed: ${seeded.reason}`);
      return { ...trip, identity: seeded.identity };
    }
  };
}

function producerTrip(totalDays, routeTemplateId) {
  const trip = buildFilledTrip(synSpec(totalDays, { routeTemplateId }), B.data, { content: B.content });
  assert.ok(trip && trip.days?.length > 0, `the producer built no trip for ${routeTemplateId}`);
  return trip;
}

const blockOf = (trip, blockId) => trip.days.flatMap((d) => d.blocks).find((b) => b.id === blockId);

function applyOptedIn(trip, preview, options) {
  const result = preview(trip, options);
  assert.equal(result.ok, true, `the opted-in preview must succeed: ${result.reason ?? ''}/${result.why ?? ''}`);
  assert.equal(result.proposals[0].identityMode, true, 'the proposal must record the opted-in mode');
  const applied = rs.applyProposal(trip, result.proposals[0]);
  assert.equal(applied.ok, true, `the opted-in apply must succeed: ${applied.reason ?? ''}`);
  return applied.trip;
}

/**
 * Every place an operation-outcome key appears anywhere in a structure, at any depth and
 * through any field — deliberately broader than assertNoOutcomeMetadata, which walks the
 * trip node and `history` only. A regression test should prove the property, not re-run
 * the guard it is checking.
 */
function outcomeKeysIn(value, path = '$') {
  const hits = [];
  if (value == null || typeof value !== 'object') return hits;
  if (Array.isArray(value)) {
    value.forEach((v, i) => hits.push(...outcomeKeysIn(v, `${path}[${i}]`)));
    return hits;
  }
  for (const [key, v] of Object.entries(value)) {
    if (key === 'identityOutcome' || key === 'identityUnrestorable' || key === 'identityRestored') hits.push(`${path}.${key}`);
    hits.push(...outcomeKeysIn(v, `${path}.${key}`));
  }
  return hits;
}

/** The review's real chain: a pinned window displaced, then a recovery the itinerary
 *  cannot honour because the pinned content has been withdrawn. No opt-in is faked and
 *  nothing is planted. */
function unhonourableRecovery(h) {
  const seeded = h.seed(producerTrip(4, 'syn_hub'));
  const pinned = edit.pinActivity(seeded, 'op:lx_base:d1', { data: B.data, tokens: h.tokens });
  assert.equal(pinned.ok, true, `${pinned.reason ?? ''}`);
  const start = pinned.trip;
  const pinnedContent = blockOf(start, 'op:lx_base:d1').anchor.contentId;
  const displaced = applyOptedIn(start, (t, o) => rs.previewAddExcursion(t, 'lx_base', 'sintra', o), h.optIn);
  const reducedOptIn = { ...h.optIn, content: B.content.filter((item) => item.id !== pinnedContent) };
  const preview = rs.previewRemoveExcursion(displaced, 'lx_base', 'sintra', reducedOptIn);
  assert.equal(preview.ok, true, preview.why ?? '');
  const result = rs.applyProposal(displaced, preview.proposals[0]);
  assert.equal(result.ok, true, `${result.reason ?? ''}`);
  return { result };
}

/** The composed chain's downstream candidate: no root map, a map inside a history
 *  snapshot. Record §3.2's worked case, reached through two ordinary public operations. */
function composedCandidate(h) {
  const { result } = unhonourableRecovery(h);
  assert.ok(result.identityOutcome?.unrestorable?.length > 0, 'the cycle must really produce an outcome');
  const preview = rs.previewAdjustNights(result.trip, 'lx_base', 1, h.dflt);
  assert.equal(preview.ok, true, preview.why ?? '');
  assert.equal(preview.proposals[0].identityMode, undefined, 'the default route records no mode');
  const downstream = rs.applyProposal(result.trip, preview.proposals[0]);
  assert.equal(downstream.ok, true, `${downstream.reason ?? ''}`);
  return { result, downstream };
}

// ---------------------------------------------------------------------------
// W-1: the intact composed chain now refuses.

test('W-1: the REAL composed chain — opted-in recovery, then a DEFAULT structural apply — is refused by the real writer, with zero writes and the stored bytes byte-identical', () => {
  const h = harness('w1');
  const { result, downstream } = composedCandidate(h);

  // Non-vacuity, before the writer is anywhere near this. The outcome is really produced,
  // the root map is really absent, and the history snapshot really does carry one — which
  // is what makes this record §3.2's worked case rather than a planted fixture.
  assert.equal('identity' in downstream.trip, false, 'the rebuilt trip has no top-level map');
  assert.ok(downstream.trip.history.length > 0, 'while history retains the previous trip');
  assert.ok(downstream.trip.history.some((h2) => h2.identity), 'and that retained snapshot really does carry a map');

  // THE PRE-WRITER GRAPH ASSERTIONS. Both returned graphs are scanned for outcome keys
  // before the writer is invoked (§0.2 constraint 1). Mutation 10 — the report-on-trip
  // fault restored — fails here, which is why W-11 exists as its separate control.
  assert.deepStrictEqual(outcomeKeysIn(result.trip), [], 'the opted-in result graph carries no outcome, at any depth');
  assert.deepStrictEqual(outcomeKeysIn(downstream.trip), [], 'nor does the downstream graph');
  assert.deepStrictEqual(id.assertNoOutcomeMetadata(downstream.trip), { ok: true }, 'and the engine would have refused to hand one back');

  // The writer, on the UNTOUCHED candidate. No projection, nothing stripped.
  store.clear();
  const kept = control();
  const before = raw();
  const snapshot = clone(downstream.trip);
  const err = refuses(() => saveDraftTrip(downstream.trip, 'composed', 'composed'), 'identity');
  assert.equal(err.schema, FROZEN.schema);
  assert.equal(err.field, FROZEN.field);
  assert.deepStrictEqual(downstream.trip, snapshot, 'the refused input is not mutated, stripped or repaired');
  assert.equal(raw(), before, 'the stored bytes are byte-identical');
  assert.deepEqual(listDraftTrips().map((d) => d.id), [kept], 'and the control record is still the only one there');
});

// ---------------------------------------------------------------------------
// W-2: an unrelated branch refuses.

test('W-2: a reserved key on a branch that is neither the root nor history refuses — full-graph traversal, which assertNoOutcomeMetadata would NOT have caught', () => {
  store.clear();
  const kept = control();

  const bearing = { ...clone(PERU), history: [], extra: { nested: [{ identity: { version: 1, used: [], blocks: {}, edits: {} } }] } };

  // THE DISCRIMINATOR. Packet 1b's guard admits this input: its key set is the three
  // outcome spellings and its traversal is the trip node and `history` only. A barrier
  // satisfied by reusing that function would let this through.
  assert.deepStrictEqual(id.assertNoOutcomeMetadata(bearing), { ok: true }, 'the outcome guard admits this candidate');
  assert.deepStrictEqual(outcomeKeysIn(bearing), [], 'and there is no outcome key here at all — only identity');
  assert.equal('identity' in bearing, false, 'the root carries nothing, so the root check cannot be what fires');

  refuses(() => saveDraftTrip(bearing, 'unrelated branch', 'unrelated branch'), 'identity');

  // The paired control: the same shape with the same branch, minus that one key, saves.
  const { loaded } = saves({ ...clone(PERU), history: [], extra: { nested: [{ note: 'nothing reserved here' }] } }, 'unrelated branch control');
  assert.deepStrictEqual(loaded.trip.extra, { nested: [{ note: 'nothing reserved here' }] }, 'and the unrelated branch is preserved, not pruned');
  assert.equal(listDraftTrips().length, 2, 'exactly the control and the one new record');
  assert.ok(listDraftTrips().some((d) => d.id === kept));
});

// ---------------------------------------------------------------------------
// W-3: presence, not truthiness, at depth — and the inherited-prototype case.

test('W-3: presence not truthiness, at depth — {} [] null 0 false \'\' and an explicit undefined all refuse, while a genuinely absent key saves', () => {
  for (const value of [{}, [], null, 0, false, '', undefined]) {
    store.clear();
    control();
    const bearing = { ...clone(PERU), history: [], extra: { deep: { identity: value } } };
    assert.ok('identity' in bearing.extra.deep, 'the key is present whatever the value');
    refuses(() => saveDraftTrip(bearing, `depth ${String(value)}`, 'd'), 'identity');

    // The paired control: the same value under a key that is not reserved.
    saves({ ...clone(PERU), history: [], extra: { deep: { notIdentity: value } } }, `absent ${String(value)}`);
  }

  // And a genuinely absent key, which is the only thing that may proceed.
  store.clear();
  const { loaded } = saves({ ...clone(PERU), history: [], extra: { deep: {} } }, 'genuinely absent');
  assert.deepStrictEqual(loaded.trip.extra, { deep: {} });
});

test('W-3 (inherited): an identity key inherited from the prototype chain refuses, and the root check is what catches it — a v6 shallow copy discards it', () => {
  store.clear();
  control();

  const base = { identity: { version: 1, used: [], blocks: {}, edits: {} } };
  const inherited = Object.assign(Object.create(base), { ...clone(PERU), history: [] });
  assert.equal(inherited.versions.schema, 'door2-v6', 'a v6 input, so the writer builds a fresh shallow copy');
  assert.equal('identity' in inherited, true, 'the key is reachable through the prototype chain');
  assert.equal(Object.hasOwn(inherited, 'identity'), false, 'but it is not an own property');
  // Why the preliminary root check is independently load-bearing: this is what the
  // candidate built at the spread would look like, and the key is simply gone from it.
  assert.equal(Object.hasOwn({ ...inherited }, 'identity'), false, 'a shallow copy discards an inherited key entirely');

  refuses(() => saveDraftTrip(inherited, 'inherited', 'inherited'), 'identity');
});

// ---------------------------------------------------------------------------
// W-4: no false positives.

test('W-4: every real producer trip across the named families saves and reopens exactly as before this stage', () => {
  store.clear();
  for (const [name, t] of TRIPS) {
    const saved = { ...t, history: [] }; // as Door2Plan.jsx's handleSaveDraft passes it
    const { loaded } = saves(saved, `${name} label`);
    assert.deepStrictEqual(loaded.trip, json(stampV7(saved)), `${name}: loaded as saved, stamped door2-v7`);
  }
  assert.equal(listDraftTrips().length, TRIPS.length, 'every one of them is really in storage');
});

test('W-4: a trip with NON-EMPTY history carrying no reserved key still saves — this stage adds no history rule to the v7 writer', () => {
  store.clear();
  const withHistory = TRIPS.find(([n]) => n === 'F2 cusco +1 night')[1];
  assert.ok(withHistory.history.length > 0, 'the fixture must really carry history');
  const { loaded } = saves(withHistory, 'with history');
  assert.ok(loaded.trip.history.length > 0, 'and the writer stored whatever it was handed');
  assert.deepStrictEqual(loaded.trip, json(stampV7(withHistory)));
});

test('W-4: a text field whose VALUE contains the word "identity" still saves — the barrier reads keys, never serialized text', () => {
  store.clear();
  const texty = {
    ...clone(PERU),
    history: [],
    extra: { note: 'this trip carries no identity map and never did', tags: ['identity', 'durable identity'] }
  };
  const { draftId, loaded } = saves(texty, 'identity in a string');
  assert.deepStrictEqual(loaded.trip.extra, texty.extra, 'the strings are stored verbatim');

  // The discriminator for a keyword scan over JSON.stringify(candidate): the word really
  // is in the stored bytes, and the save still had to succeed.
  assert.ok(raw().includes('identity'), 'the word "identity" really does reach the stored bytes');
  assert.ok(listDraftTrips().some((d) => d.id === draftId));
});

// ---------------------------------------------------------------------------
// W-5: precedence and mixed faults — §3.3's five rows, plus the addendum's C3 cases.

test('W-5 row 1: unreadable storage outranks any trip fault', () => {
  store.clear();
  control();
  const before = raw();
  const writesBefore = writes;
  unreadable = true;
  try {
    for (const trip of [
      { ...clone(PERU), identity: {} },
      { ...clone(PERU), history: [], extra: { identity: {} } },
      { versions: { schema: 'door2-v5' } },
      null
    ]) {
      assert.throws(() => saveDraftTrip(trip, 'x', 'x'), (err) => {
        assert.ok(err instanceof DraftStorageUnreadableError, `expected DraftStorageUnreadableError, got ${err?.name}`);
        return true;
      });
    }
  } finally {
    unreadable = false;
  }
  assert.equal(writes, writesBefore, 'zero writes');
  assert.equal(raw(), before, 'and the bytes are untouched');
});

test('W-5 row 2: an unsupported schema plus a ROOT reserved key is the identity error — the root check runs first', () => {
  store.clear();
  control();
  const err = refuses(() => saveDraftTrip({ ...clone(PERU), versions: { ...PERU.versions, schema: 'door2-v5' }, identity: {} }, 'x', 'x'), 'identity');
  assert.equal(err.schema, FROZEN.schema, 'and it names door2-v8, not the input schema');
});

test('W-5 row 3: an unsupported schema plus a NESTED-ONLY reserved key is the schema error — validation stops before a candidate exists', () => {
  store.clear();
  control();
  const err = refuses(
    () => saveDraftTrip({ ...clone(PERU), versions: { ...PERU.versions, schema: 'door2-v5' }, history: [], extra: { identity: {} } }, 'x', 'x'),
    'schema'
  );
  assert.equal(err.schema, 'door2-v5', 'the schema error names what the input actually was');
  assert.equal(err.field, 'versions.schema');
});

test('W-5 row 4: an admitted v6 or v7 schema plus a nested reserved key is the identity error', () => {
  for (const schema of ['door2-v6', 'door2-v7']) {
    store.clear();
    control();
    const err = refuses(
      () => saveDraftTrip({ ...clone(PERU), versions: { ...PERU.versions, schema }, history: [], extra: { identity: {} } }, 'x', 'x'),
      'identity'
    );
    assert.equal(err.schema, FROZEN.schema, `${schema}: the refusal names door2-v8`);
  }
});

test('W-5 row 5: null and a primitive are the schema error, with err.schema === "undefined"', () => {
  for (const trip of [null, undefined, 42, 'a trip', true]) {
    store.clear();
    control();
    const err = refuses(() => saveDraftTrip(trip, 'x', 'x'), 'schema');
    assert.equal(err.schema, 'undefined', `${String(trip)}: err.schema is the string "undefined"`);
  }
});

test('W-5 (C3): a nested reserved key outranks an independent SHAPE fault, while the identity-free control keeps its existing shape refusal', () => {
  store.clear();
  control();
  // An independent shape fault: status is required, and `extra` is not inspected by it.
  const shapeFault = (t) => { const { status, ...rest } = t; return rest; };

  const both = shapeFault({ ...clone(PERU), history: [], extra: { identity: {} } });
  const err = refuses(() => saveDraftTrip(both, 'x', 'x'), 'identity');
  assert.equal(err.schema, FROZEN.schema);

  // The paired control proves the shape fault is real and is what fires without the key.
  const controlInput = shapeFault({ ...clone(PERU), history: [], extra: {} });
  const shapeErr = refuses(() => saveDraftTrip(controlInput, 'x', 'x'), 'shape');
  assert.equal(shapeErr.field, 'status', 'the shape fault really is there, and really is independent');
});

test('W-5 (C3): a nested reserved key outranks an EVIDENCE fault, while the identity-free control keeps its existing shape refusal', () => {
  store.clear();
  control();
  // An independent evidence fault: the marker is present, so the inspection runs, and
  // there is no evidence object to satisfy it. shapeFailure does not inspect this field.
  const evidenceFault = (t) => ({ ...t, versions: { ...t.versions, connectionEvidence: 'not-a-ruleset' } });

  const both = evidenceFault({ ...clone(PERU), history: [], extra: { identity: {} } });
  const err = refuses(() => saveDraftTrip(both, 'x', 'x'), 'identity');
  assert.equal(err.schema, FROZEN.schema);

  const controlInput = evidenceFault({ ...clone(PERU), history: [], extra: {} });
  const evidenceErr = refuses(() => saveDraftTrip(controlInput, 'x', 'x'), 'shape');
  assert.equal(evidenceErr.field, 'evidence', 'the evidence fault really is there, and really is independent');
});

// ---------------------------------------------------------------------------
// W-6: the error contract frozen, asserted against BOTH paths.

test('W-6: both identity refusals carry the identical frozen contract — check, schema, field, name, message and class — so a caller cannot tell which check fired', () => {
  store.clear();
  control();

  // Path 1, the root check: a v6 input whose own root carries the key.
  const rootErr = refuses(() => saveDraftTrip({ ...clone(PERU), history: [], identity: {} }, 'root', 'root'), 'identity');
  // Path 2, the recursive check: a v6 input whose root is clean and whose branch is not.
  const nestedErr = refuses(() => saveDraftTrip({ ...clone(PERU), history: [], extra: { deep: { identity: {} } } }, 'nested', 'nested'), 'identity');

  for (const [label, err] of [['root', rootErr], ['nested', nestedErr]]) {
    assert.ok(err instanceof DraftNotStorableError, `${label}: the existing error class`);
    assert.ok(err instanceof Error, `${label}: still an Error`);
    assert.equal(err.name, FROZEN.name, `${label}: name`);
    assert.equal(err.check, FROZEN.check, `${label}: check`);
    assert.equal(err.schema, FROZEN.schema, `${label}: schema`);
    assert.equal(err.field, FROZEN.field, `${label}: field`);
    assert.equal(err.message, FROZEN.message, `${label}: the traveller-facing message is unchanged`);
    // err.field must never become a path, and no new channel may be added (§3.5).
    assert.equal(/[.[\]]/.test(err.field), false, `${label}: field is a key name, never a path`);
    assert.deepStrictEqual(Object.keys(err).sort(), ['check', 'field', 'name', 'schema'], `${label}: no new own property`);
  }

  // The two are indistinguishable across exactly the promised contract, and nothing more
  // is claimed: not identical instances, and not identical stacks (C4).
  assert.deepStrictEqual(
    { name: rootErr.name, check: rootErr.check, schema: rootErr.schema, field: rootErr.field, message: rootErr.message },
    { name: nestedErr.name, check: nestedErr.check, schema: nestedErr.schema, field: nestedErr.field, message: nestedErr.message },
    'the two refusals are indistinguishable across the frozen contract'
  );
  assert.notEqual(rootErr, nestedErr, 'they are of course still separate instances — C4 promises nothing about that');
});

// ---------------------------------------------------------------------------
// W-9: the successful-save report scan, and the candidate-identity claim.

/**
 * TEST-ONLY PROJECTION. It is fixture preparation and nothing else: it is NOT production
 * repair, and it is NOT a claim that the unchanged composed chain saves — W-1 proves that
 * chain refuses, on the untouched candidate, with zero writes.
 *
 * It removes reserved identity KEYS ONLY, at every depth. Every history entry, every
 * operation-outcome field and every other key survives it. Its only purpose is to give
 * the report scan below a successful write to read, so the scan is not vacuous.
 */
function withoutIdentityKeysAnywhere(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(withoutIdentityKeysAnywhere);
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== 'identity')
      .map(([key, v]) => [key, withoutIdentityKeysAnywhere(v)])
  );
}

test('W-9: the projection removes ONLY identity keys — a planted historical report survives it, and so does all history', () => {
  const h = harness('w9a');
  const { downstream } = composedCandidate(h);

  // Plant a report in a history snapshot, under all three spellings this outcome has ever
  // been spelled with. If the projection stripped outcome keys, the live scan below would
  // prove nothing at all; this is what establishes that it does not.
  const planted = clone(downstream.trip);
  planted.history[0].identityOutcome = { unrestorable: [{ luid: 'planted' }] };
  planted.history[0].identityUnrestorable = ['planted'];
  planted.history[0].identityRestored = ['planted'];
  assert.equal(outcomeKeysIn(planted).length, 3, 'three planted spellings');

  const projected = withoutIdentityKeysAnywhere(planted);

  assert.deepStrictEqual(outcomeKeysIn(projected).sort(), outcomeKeysIn(planted).sort(), 'EVERY planted report survives the projection');
  assert.equal(projected.history.length, planted.history.length, 'and so does every history entry');
  assert.deepStrictEqual(projected.history[0].identityOutcome, planted.history[0].identityOutcome, 'verbatim');
  assert.deepStrictEqual(projected.history[0].identityUnrestorable, planted.history[0].identityUnrestorable);
  assert.deepStrictEqual(projected.history[0].identityRestored, planted.history[0].identityRestored);
  // What it does remove, and the only thing it removes.
  assert.ok(planted.history.some((h2) => h2.identity), 'the input really did carry a nested map');
  assert.equal(projected.history.some((h2) => h2.identity), false, 'and the projection removed it');
  assert.deepStrictEqual(
    withoutIdentityKeysAnywhere({ identity: 1, identityOutcome: 2, identityish: 3, luid: 4, nested: { identity: 5, keep: 6 } }),
    { identityOutcome: 2, identityish: 3, luid: 4, nested: { keep: 6 } },
    'only the exact reserved key, at every depth, and nothing whose name merely resembles it'
  );
});

test('W-9: a successful save that RETAINS history writes real bytes, and neither the bytes nor the parsed graph carries an outcome under any spelling', () => {
  const h = harness('w9b');
  const { downstream } = composedCandidate(h);

  const saveArg = withoutIdentityKeysAnywhere(downstream.trip);
  assert.ok(saveArg.history.length > 0, 'history is RETAINED — this is not a history-stripped save');

  store.clear();
  const { draftId } = saves(saveArg, 'composed, projected');
  const bytes = raw();
  assert.ok(bytes.length > 0, 'something was really written');

  // The scan, on the actual successful write: the stored bytes, then the parsed graph.
  for (const key of ['identityOutcome', 'identityUnrestorable', 'identityRestored']) {
    assert.equal(bytes.includes(key), false, `${key} reached the stored bytes`);
  }
  const stored = JSON.parse(bytes);
  assert.deepStrictEqual(outcomeKeysIn(stored), [], 'the stored record carries no outcome anywhere, at any depth');
  const entry = stored.find((e) => e.id === draftId);
  assert.ok(entry.trip.history.length > 0, 'the stored record really retains history, so the scan had somewhere to look');

  // §3.6, as narrowed by C2a. This proves SERIALIZED PAYLOAD EQUALITY FOR THIS FIXTURE
  // between what the recursive scan ran on and what was stored — not reference identity
  // for every possible input. The observation seam is test-only and needs no production
  // export, observer or hook: the writer's candidate rule is a documented one-liner (a v6
  // input is stamped door2-v7 on a shallow copy), so the test reconstructs the candidate
  // from the argument it passed in and compares that.
  assert.deepStrictEqual(entry.trip, json(stampV7(saveArg)), 'the stored trip payload is the checked candidate, serialized');
  // And the envelope wraps it without transforming it: every other field sits beside it.
  assert.deepStrictEqual(Object.keys(entry).sort(), ['destinationLabel', 'envelopeVersion', 'id', 'label', 'savedAt', 'trip']);
  assert.equal(entry.envelopeVersion, 2);
});

// ---------------------------------------------------------------------------
// W-10: the engine-graph outcome assertion, independent of the writer.

test('W-10: the engine hands back an outcome-free graph — asserted with no writer involved at all', () => {
  const h = harness('w10');
  const { result } = unhonourableRecovery(h);

  assert.ok(result.identityOutcome?.unrestorable?.length > 0, 'the outcome really is produced, on the result');
  assert.deepStrictEqual(Object.keys(result).sort(), ['identityOutcome', 'ok', 'trip'], 'as a sibling of the trip');
  assert.deepStrictEqual(outcomeKeysIn(result.trip), [], 'and the committed trip graph carries none, at any depth');
  assert.deepStrictEqual(id.assertNoOutcomeMetadata(result.trip), { ok: true }, 'the engine would have refused to hand one back');

  const preview = rs.previewAdjustNights(result.trip, 'lx_base', 1, h.dflt);
  const downstream = rs.applyProposal(result.trip, preview.proposals[0]);
  assert.equal(downstream.ok, true, `${downstream.reason ?? ''}`);
  assert.deepStrictEqual(Object.keys(downstream).sort(), ['ok', 'trip'], 'a default result is exactly { ok, trip }');
  assert.deepStrictEqual(outcomeKeysIn(downstream.trip), [], 'and the downstream graph carries none either');
});

// ---------------------------------------------------------------------------
// W-11: the writer-refusal control, carrying NO engine-graph assertions.

test('W-11: the same map-bearing candidate is refused by the writer with zero writes and bytes retained — a control with no graph assertions, so the report-on-trip fault leaves it green', () => {
  const h = harness('w11');
  const { downstream } = composedCandidate(h);

  // Non-vacuity about the CANDIDATE only. Nothing here asserts that the returned graphs
  // are outcome-free: that is W-1's and W-10's job, and asserting it here would make this
  // test fail alongside them under mutation 10 instead of staying green as its control.
  assert.equal('identity' in downstream.trip, false, 'no top-level map');
  assert.ok(downstream.trip.history.some((h2) => h2.identity), 'a map inside a history snapshot');

  store.clear();
  const kept = control();
  const before = raw();
  refuses(() => saveDraftTrip(downstream.trip, 'w11', 'w11'), 'identity');
  assert.equal(raw(), before, 'the existing bytes are retained exactly');
  assert.deepEqual(listDraftTrips().map((d) => d.id), [kept], 'and nothing was appended');
});
