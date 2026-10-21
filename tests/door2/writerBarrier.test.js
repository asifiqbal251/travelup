import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

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

test('W-6: both identity refusals carry the identical frozen contract — the same error class and the frozen check, schema, field, name and message, with stack traces free to differ', () => {
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

// ---------------------------------------------------------------------------
// Q8 packet 2, stage A, CORRECTION ROUND 1 — C-1 to C-15.
// correction-brief-q8-packet2-stage-a-round1-2026-10-20-draft5.md §4, as approved by
// codex-review-…-draft5-APPROVE-2026-10-20.md. Governing contract unchanged:
// decision-record-q8-packet2-persistence-contract-2026-10-19-APPROVED.md §§3.2-3.3.
//
// Three findings from the diff review of 85e2f0f:
//
//   R1  A toJSON hook — own, or INHERITED from the prototype chain — hands serialization
//       data the in-memory candidate never held. At 85e2f0f the scan ran on the object,
//       the later serialization introduced identity, and the record was written as
//       door2-v7 and admitted by the reader.
//   R2  A recursive presence walk exhausts the call stack on an ordinary deep payload
//       this writer accepted at base and the reader still admits — a save that worked
//       became a RangeError. The limits of a recursive walk and of serialization differ.
//   —   Whole-array reserialization rewrote the bytes of records the save never touched:
//       interior whitespace stripped, a field spelled 1.00 rewritten as 1.
//
// The writer now runs three layers over one frozen RESERVED_IDENTITY_KEYS registry, all
// raising the identical existing error, and each row below says which layer it pins:
//
//   1  root presence on the input AS HANDED — an INHERITED root key a shallow copy drops
//   2  a full walk of the candidate IN MEMORY — keys serialization drops (an explicit
//      `identity: undefined`), and a named refusal rather than a TypeError when a
//      circular payload also carries identity
//   3  a full walk of the MATERIALIZED entry — identity a hook introduced on the way out
//
// Layer 3 is an addition, never a substitute. Parsing strips OWN hooks and not inherited
// ones, so checking a parsed copy and then serializing again would reopen R1; what closes
// it is that the bytes appended are the bytes that were checked.
//
// What is NOT claimed here, and is not closed by this round (brief §3.4): an enumerable
// getter can install an inherited toJSON BEFORE materialization and alter the envelope id,
// leaving a valid v7 payload. That sits in the stateful-getter domain this round expressly
// excludes. No test below asserts universal envelope equivalence, and none claims complete
// protection from executable input effects.

/**
 * A deep snapshot that NEVER invokes a toJSON hook: functions are kept by reference and
 * everything else is copied key by key, cycles included. `clone` would fire the very
 * hooks these tests are about, so it cannot be used to snapshot one of these fixtures.
 */
function inertSnapshot(value, seen = new Map()) {
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return seen.get(value);
  const copy = Array.isArray(value) ? [] : {};
  seen.set(value, copy);
  for (const [key, v] of Object.entries(value)) copy[key] = inertSnapshot(v, seen);
  return copy;
}

/**
 * Every place a reserved identity KEY appears in an in-memory graph, at any depth. Written
 * here rather than imported: a regression test should prove the property, not re-run the
 * production helper it is checking. A function VALUE is a value, never a matching key —
 * which is exactly what made R1 invisible to a scan of the object alone.
 */
function identityKeysIn(value, path = '$', seen = new WeakSet()) {
  const hits = [];
  if (value === null || typeof value !== 'object' || seen.has(value)) return hits;
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((v, i) => hits.push(...identityKeysIn(v, `${path}[${i}]`, seen)));
    return hits;
  }
  if ('identity' in value) hits.push(`${path}.identity`);
  for (const [key, v] of Object.entries(value)) hits.push(...identityKeysIn(v, `${path}.${key}`, seen));
  return hits;
}

/**
 * Records every JSON.stringify performed while fn runs, with the exact text each produced.
 * A test-only observation seam: no production export, observer or hook is added, and the
 * real function is restored in a finally. `frame()` picks out the writer's single entry
 * materialization — a one-element array holding an envelope — and returns the exact text
 * of the entry inside it, which is the text the write must then have appended verbatim.
 */
function capturingSerializations(fn) {
  const real = JSON.stringify;
  const calls = [];
  JSON.stringify = (v, ...rest) => {
    const text = real(v, ...rest);
    calls.push({ value: v, text });
    return text;
  };
  let result;
  try {
    result = fn();
  } finally {
    JSON.stringify = real;
  }
  const frames = calls.filter((c) => Array.isArray(c.value) && c.value.length === 1 && c.value[0]?.envelopeVersion === 2);
  return {
    result,
    calls,
    frames,
    frameText() {
      assert.equal(frames.length, 1, `exactly one entry materialization expected, saw ${frames.length}`);
      const text = frames[0].text;
      assert.ok(text.startsWith('[') && text.endsWith(']'), 'the framing is an array');
      return text.slice(1, -1);
    }
  };
}

/** A branch whose OWN toJSON hands serialization whatever `returns` says, call by call. */
function hookedBranch(returns) {
  const calls = { count: 0 };
  return {
    calls,
    branch: {
      toJSON: () => {
        calls.count += 1;
        return typeof returns === 'function' ? returns(calls.count) : returns;
      }
    }
  };
}

/** A v6 or v7 trip carrying `branch` on a field neither the shape nor the evidence check
 *  inspects, with history retained as the page would hand it (empty). */
const tripWithBranch = (trip, branch) => ({ ...clone(trip), history: [], extra: branch });

/** A self-referential object, optionally carrying a reserved key at its own root. */
function circular(extra = {}) {
  const node = { note: 'a cycle', ...extra };
  node.self = node;
  return node;
}

// ---------------------------------------------------------------------------
// C-1, C-2: an own toJSON returning identity-bearing data — R1, under v7 and v6.

for (const [version, prepare] of [['v7', (t) => stampV7(t)], ['v6', (t) => t]]) {
  test(`C-1/C-2 (${version}): an own toJSON that returns identity-bearing data is refused by name, with zero writes, the stored bytes byte-identical and the input unmutated`, () => {
    store.clear();
    const kept = control();
    const before = raw();

    const { branch } = hookedBranch({ nested: [{ identity: null }] });
    const trip = tripWithBranch(prepare(PERU), branch);
    const snapshot = inertSnapshot(trip);

    // Non-vacuity. Layers 1 and 2 cannot see this: there is no reserved KEY anywhere in
    // the in-memory graph — only a function value. At 85e2f0f this input saved as
    // door2-v7 and the reader admitted it. Only the materialized payload carries the key.
    assert.equal('identity' in trip, false, 'no key at the root');
    assert.deepStrictEqual(identityKeysIn(trip), [], 'and none anywhere in the in-memory graph');
    assert.deepStrictEqual(identityKeysIn(JSON.parse(JSON.stringify({ trip }))), ['$.trip.extra.nested[0].identity'], 'yet serializing it produces exactly one');

    const err = refuses(() => saveDraftTrip(trip, 'hooked', 'hooked'), 'identity');
    assert.equal(err.schema, FROZEN.schema, 'the refusal names the version it could only be written under');
    assert.equal(err.field, FROZEN.field);
    assert.equal(err.message, FROZEN.message);

    // Nothing stripped, normalised or repaired to make it fit, and nothing appended.
    assert.deepStrictEqual(inertSnapshot(trip), snapshot, 'the input is unmutated');
    assert.equal(raw(), before, 'the existing bytes are retained exactly');
    assert.deepEqual(listDraftTrips().map((d) => d.id), [kept], 'and nothing was appended');
  });
}

// ---------------------------------------------------------------------------
// C-3: the control — a constant identity-free hook still saves.
// Deliberately NO call-count assertion: it has to stay green under mutations 15 and 16.

test('C-3: a constant identity-free toJSON still saves and reopens, and the stored bytes carry exactly what the hook returned', () => {
  store.clear();
  const returned = { shaped: 'by the hook', list: [1, 2, 3] };
  const { branch } = hookedBranch(returned);
  const trip = tripWithBranch(PERU, branch);

  const { draftId, loaded } = saves(trip, 'clean hook');
  const stored = JSON.parse(raw()).find((e) => e.id === draftId);
  assert.deepStrictEqual(stored.trip.extra, returned, 'the stored bytes carry exactly what the hook returned');
  assert.deepStrictEqual(loaded.trip.extra, returned, 'and so does the reopened record');
  assert.deepStrictEqual(identityKeysIn(stored), [], 'with no reserved key anywhere in it');
});

// ---------------------------------------------------------------------------
// C-4, C-5: depth — R2. Both run in a FRESH Node process, because a warmed stack can hide
// a call-stack limit, and the base finding was reproduced in a cold one.

// R2's reproduction needs a runtime in which an ordinary deep payload is SERIALIZABLE
// while a RECURSIVE presence walk over it is not. Those two limits are independent, which
// is exactly R2's point — but their ORDER is not universal. MEASURED FINDING, recorded
// rather than assumed: on this machine (Node v26.7.0, darwin arm64) at the DEFAULT stack
// size, a real producer trip carrying a depth-5,000 chain — the review's figure — is
// handled by a recursive walk as well as by the serializer, and both fail together above
// roughly depth 5,500. The review measured the opposite order on its own run. The
// threshold depends on how much stack the surrounding harness has already consumed, so
// neither figure generalises.
//
// So the child is given an EXPLICIT stack size, and it measures all four facts itself:
// the input serializes, it parses back, a RECURSIVE REPLICA of the 85e2f0f walk exhausts
// the stack on that very input, and the real writer nevertheless saves it and the reader
// admits it. "Deep enough to overflow a recursive walk" is therefore asserted, never
// assumed: if the band ever moves, these tests fail loudly instead of passing vacuously,
// and they cannot pass while the production walk is recursive. None of this is a product
// limit, and no depth, size or number policy exists in the writer.
const DEEP = 4200;
const DEEP_STACK_KB = 800;
const STORAGE_MODULE = new URL('../../src/lib/door2/draftStorage.js', import.meta.url).href;
const PLANNER_MODULE = new URL('../../src/lib/door2/planner.js', import.meta.url).href;
const FIXTURES_MODULE = new URL('./fixtures/skeletonFixtures.js', import.meta.url).href;

/**
 * One deep-payload probe, in its own process with a stated stack size. The payload is a
 * real producer trip with one ordinary identity-free object chain added, and the child
 * counts its own writes.
 */
function deepProbe({ depth, identityAtDepth = false }) {
  const source = `
    const store = new Map();
    let writes = 0;
    globalThis.localStorage = {
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, v) => { writes += 1; store.set(k, String(v)); },
      removeItem: (k) => store.delete(k)
    };
    const { saveDraftTrip, loadDraftTrip } = await import(${JSON.stringify(STORAGE_MODULE)});
    const { PILOT_DATA, buildFilledTrip } = await import(${JSON.stringify(PLANNER_MODULE)});
    const { SKELETON_FIXTURES } = await import(${JSON.stringify(FIXTURES_MODULE)});

    // The walk as it stood at 85e2f0f, recursive, replicated here rather than imported.
    // Its only job is to establish in THIS runtime, on THIS input, that a recursive walk
    // really does exhaust the call stack where the serializer does not.
    const KEYS = Object.freeze(['identity']);
    function recursiveReplica(value, seen = new WeakSet()) {
      if (value === null || typeof value !== 'object') return false;
      if (seen.has(value)) return false;
      seen.add(value);
      for (const key of KEYS) if (key in value) return true;
      for (const nested of Object.values(value)) if (recursiveReplica(nested, seen)) return true;
      return false;
    }

    const base = buildFilledTrip(SKELETON_FIXTURES.F2, PILOT_DATA, { reviewPolicy: 'allow_drafts' });
    const chain = {};
    let node = chain;
    for (let i = 0; i < ${depth}; i += 1) node = node.child = {};
    ${identityAtDepth ? 'node.identity = null;' : ''}
    const trip = { ...base, history: [], extra: chain };

    const out = {
      depth: ${depth},
      identityAtDepth: ${Boolean(identityAtDepth)},
      producerSchema: base.versions.schema,
      deepestKeys: Object.keys(node).length
    };
    const attempt = (fn) => { try { fn(); return 'ok'; } catch (e) { return e.name; } };
    out.stringify = attempt(() => { out.serializedBytes = JSON.stringify(trip).length; });
    out.parse = attempt(() => { out.reparsedDeep = JSON.parse(JSON.stringify(trip)).extra.child !== undefined; });
    out.recursiveReplica = attempt(() => { out.replicaFound = recursiveReplica(trip); });
    try {
      const draftId = saveDraftTrip(trip, 'deep', 'deep');
      out.savedId = draftId;
      out.reopened = loadDraftTrip(draftId).compatible;
      out.storedBytes = (store.get('door2_drafts_v1') ?? '').length;
    } catch (e) {
      out.errorName = e.name;
      out.errorCheck = e.check ?? null;
      out.errorSchema = e.schema ?? null;
      out.errorField = e.field ?? null;
    }
    out.writes = writes;
    console.log('__PROBE__' + JSON.stringify(out));
  `;
  const stdout = execFileSync(process.execPath, [`--stack-size=${DEEP_STACK_KB}`, '--input-type=module', '-e', source], { encoding: 'utf8' });
  const line = stdout.split('\n').find((l) => l.startsWith('__PROBE__'));
  assert.ok(line, `the child process produced no result:\n${stdout}`);
  return JSON.parse(line.slice('__PROBE__'.length));
}

/** The three facts that make a deep probe interpretable at all, asserted before its result
 *  is read: the input really is serializable and re-parseable in that runtime, and a
 *  recursive walk really does fail on it there. */
function assertDeepProbeIsLoadBearing(r, label) {
  assert.equal(r.producerSchema, 'door2-v6', `${label}: a real producer trip, not a hand-built one`);
  assert.equal(r.stringify, 'ok', `${label}: the input must be SERIALIZABLE in that runtime, got ${r.stringify}`);
  assert.equal(r.parse, 'ok', `${label}: and must parse back there, got ${r.parse}`);
  assert.ok(r.serializedBytes > 30000, `${label}: a real deep payload, ${r.serializedBytes} bytes`);
  assert.equal(r.reparsedDeep, true, `${label}: the chain really survives the round trip`);
  assert.equal(r.recursiveReplica, 'RangeError', `${label}: a RECURSIVE walk must exhaust the stack on this very input, or the probe proves nothing — got ${r.recursiveReplica}`);
}

test('C-4: an ordinary identity-free payload deep enough to exhaust a recursive walk still saves and reopens — fresh process, stated stack size, serializability proved in that same runtime', () => {
  const r = deepProbe({ depth: DEEP });
  assertDeepProbeIsLoadBearing(r, 'C-4');
  assert.equal(r.deepestKeys, 0, 'the deepest node carries no key at all — nothing is planted');

  assert.equal(r.errorName, undefined, `the save must not fail: ${r.errorName} / ${r.errorCheck ?? ''}`);
  assert.ok(r.savedId, 'it saved');
  assert.equal(r.writes, 1, 'with exactly one write');
  // The reader ADMITS it. A reader-admission limit must not be what makes this pass.
  assert.equal(r.reopened, true, 'and the unchanged reader reopens it');
  assert.ok(r.storedBytes > 30000, 'the deep payload really reached storage');
});

test('C-5: a reserved key at that same depth is refused BY NAME, not by RangeError, in the same isolated runtime', () => {
  const r = deepProbe({ depth: DEEP, identityAtDepth: true });
  assertDeepProbeIsLoadBearing(r, 'C-5');
  assert.equal(r.deepestKeys, 1, 'the key really is at the deepest node');
  assert.equal(r.replicaFound, undefined, 'and the recursive walk never got far enough to find it — which is the regression');

  // The whole point of R2: at 85e2f0f, in a runtime like this one, this was a RangeError
  // from the scan rather than the refusal the contract requires.
  assert.equal(r.errorName, 'DraftNotStorableError', `expected a named refusal, got ${r.errorName}`);
  assert.equal(r.errorCheck, 'identity', 'refused by name');
  assert.equal(r.errorSchema, 'door2-v8');
  assert.equal(r.errorField, 'identity');
  assert.equal(r.writes, 0, 'with zero writes');
  assert.equal(r.savedId, undefined, 'and no record');
});

test('C-5: the circular pair — circular PLUS identity is the named identity refusal, while circular and identity-free keeps the existing TypeError, both with zero writes', () => {
  store.clear();
  const kept = control();
  const before = raw();

  // Circular AND carrying a reserved key: the in-memory walk terminates on the cycle and
  // refuses by name. This is one of the two reasons layer 2 must run before layer 3 —
  // layer 3 never sees this input, because it cannot be serialized at all.
  const dirty = tripWithBranch(PERU, circular({ identity: {} }));
  assert.deepStrictEqual(identityKeysIn(dirty), ['$.extra.identity'], 'the key really is in the cycle');
  const err = refuses(() => saveDraftTrip(dirty, 'circular identity', 'x'), 'identity');
  assert.equal(err.schema, FROZEN.schema);

  // Circular and identity-free: the EXISTING behaviour, unchanged — a TypeError from
  // serialization, with nothing written. It may now originate at the materialization
  // rather than at the whole-list write, which is not a contract this stage changes.
  const clean = tripWithBranch(PERU, circular());
  const writesBefore = writes;
  let thrown = null;
  try {
    saveDraftTrip(clean, 'circular clean', 'x');
  } catch (e) {
    thrown = e;
  }
  assert.ok(thrown instanceof TypeError, `the existing TypeError is preserved, got ${thrown?.name}`);
  assert.equal(thrown instanceof DraftNotStorableError, false, 'this scan is NOT what decides a cycle is unwritable');
  assert.equal(writes, writesBefore, 'zero writes');
  assert.equal(raw(), before, 'bytes retained');
  assert.deepEqual(listDraftTrips().map((d) => d.id), [kept]);
});

// ---------------------------------------------------------------------------
// C-6: ordinary output unchanged, against evidence PINNED from 85e2f0f.

const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex');

/**
 * Pins the two volatile inputs to the envelope — Date.now and Math.random for the id, and
 * `new Date()` for savedAt — so a byte comparison is possible at all. Nothing else about
 * the writer is touched, and both are restored in a finally.
 */
const PINNED_MS = Date.parse('2026-10-20T12:00:00.000Z');
const PINNED_ISO = '2026-10-20T12:00:00.000Z';
function withPinnedMetadata(fn) {
  const RealDate = globalThis.Date;
  const realRandom = Math.random;
  class PinnedDate extends RealDate {
    constructor(...args) {
      super(...(args.length === 0 ? [PINNED_MS] : args));
    }
    static now() {
      return PINNED_MS;
    }
  }
  globalThis.Date = PinnedDate;
  Math.random = () => 0.5;
  try {
    return fn();
  } finally {
    globalThis.Date = RealDate;
    Math.random = realRandom;
  }
}

/**
 * The SHA-256 of the complete stored bytes produced by saving each named producer fixture
 * FROM ABSENT STORAGE, with the metadata above pinned. MEASURED AT 85e2f0f, before this
 * round's change, and pinned here as evidence rather than recomputed from the code under
 * test. Whole-store comparison is confined to absent storage for the reason A3 gives: a
 * non-canonical existing record now keeps its own spelling, so a whole-store comparison
 * that started from one would differ by design (the second test below).
 */
const C6_PINS_AT_85E2F0F = {
  F1: 'c59689544fc105e85682044ed096e78782102bb137b2f0d2fb18a85a2eecb1d3',
  F2: 'c40cdb5997c4e187ca0f57d5a32b38f745234c3871d593c5aff5fc77b5b9dee0',
  F4: '399ecd98dd5597714c04acfb00f0917f4f9bfa6c3763ae461106fbd4b423fd52',
  F6: '015a3cae4a2e7197df5428d27170b1b596979202f7c1d16033cbebaa8d9e2afb',
  NYC14: '1d492aefef2ba687de16b114f8625cf1801f42910d1db1177f2d0e6685a8fa50',
  G5: 'adeacfe8692f21da9b0a61745938017c87c2d2e8e4258273ad14ed24f0a3dbe9',
  G6: 'bff7b70a265f98c598372ebee78689e4d50a0e6e85ddc32a037ace87cb9d139c',
  G7: '98fd7a41c4ef667762eb8686eb3902562d3bb1cc52a84739f25a999cc4c0ffd4',
  G8: '0eefc5fbc788eaa09f6515effa512d2234f0e1b8d4125ca25e43443ad4e30a9d',
  G9: '6387c65ffef527a6090c6239e5634a393807e2742e7da5fce6fa8c3fed626e2c',
  G10: '53f870639510d805c74669dc97bc196c2fe33b0a75c7c4414ff88d03cc33790e',
  PE8: 'ca511c40d93c822adc2b10a00eb733c356d8c46bb6d0adc61174261f1f447f26',
  PE11: 'bbb1e579d916456839f543209f48f8578db2fbbc6c551c93cfea074e3c7eda9a',
  PE12: 'f389e51b646d93589e1e0c5bfb759ac28b31e747db5feccedb8c37cb5829bcb1',
  PH11: 'ade204c207a7b0162a102c525c7cec984e67e7a003eec004c6de9c70a58162d5',
  PH18: '78d05544cb9e2ca3ed0890ee9c69fc87730ac9b3585ad43e08adae5854273f16',
  'F2 swapped and pinned': 'fe8115907fddfaa7b396fc5841c10f737b9599cc2dd18ddf803658e505ef2c74',
  'F2 cusco +1 night': '5dabf6110a9716faec9a0104970b07fb388033d79b9c4c1ac28f72ecfec9866e',
  'synthetic hub with a day trip': '3f42be2b53141c296faf1e40459029ddfd4594d79cfa5468c53e623c01cac7be'
};

/** Saves one named C-6 fixture from absent storage, with the metadata pinned. */
function pinnedSave(trip, name) {
  store.clear();
  const draftId = withPinnedMetadata(() => saveDraftTrip({ ...trip, history: [] }, `${name} label`, name));
  return { draftId, bytes: raw() };
}

test('C-6: every named producer fixture, saved from absent storage with the metadata pinned, still produces the bytes measured at 85e2f0f — hook-free and accessor-free ordinary output is untouched', () => {
  assert.equal(TRIPS.length, Object.keys(C6_PINS_AT_85E2F0F).length, 'the pinned set and the fixture set must still line up');
  for (const [name, t] of TRIPS) {
    const pin = C6_PINS_AT_85E2F0F[name];
    assert.ok(pin, `${name} has no pinned baseline`);
    const { draftId, bytes } = pinnedSave(t, name);
    assert.equal(sha256(bytes), pin, `${name}: the stored bytes differ from the 85e2f0f baseline`);
    assert.equal(draftId, `d2draft_${PINNED_MS}_i`, `${name}: the pinned id`);
    const parsed = JSON.parse(bytes);
    assert.equal(parsed.length, 1, `${name}: one entry`);
    assert.equal(parsed[0].savedAt, PINNED_ISO, `${name}: the pinned timestamp`);
    assert.equal(loadDraftTrip(draftId).compatible, true, `${name}: and it reopens`);
  }
});

test('C-6 (A3): the same ordinary trip appended to a NON-CANONICAL old store deliberately gives different WHOLE-STORE bytes, while the new entry’s own text is byte-identical to the pinned baseline’s', () => {
  // From absent storage: the pinned baseline. The whole store is the outer brackets and
  // this one entry, so the entry's own text is exactly what sits between them.
  const fromAbsent = pinnedSave(PERU, 'F2');
  assert.equal(sha256(fromAbsent.bytes), C6_PINS_AT_85E2F0F.F2, 'the baseline pin holds');
  const entryText = fromAbsent.bytes.slice(1, -1);

  // The same save over a store whose existing record is not canonically spelled.
  const seeded = `[\n  {"envelopeVersion":   2, "id":"old_1", "savedAt":"2026-01-01T00:00:00.000Z", "label":"old", "trip":{"n":1.00}}\n]`;
  store.set(KEY, seeded);
  const draftId = withPinnedMetadata(() => saveDraftTrip({ ...PERU, history: [] }, 'F2 label', 'F2'));

  // A3's two claims, and only those two. Byte-level preservation of the OLD record is
  // C-14's subject; asserting it here as well would turn this test into a second detector
  // for mutation 20 instead of the unaffected control the plan makes it.
  assert.notEqual(sha256(raw()), C6_PINS_AT_85E2F0F.F2, 'the whole store cannot match the absent-storage pin, and is not expected to');
  assert.ok(raw().includes(entryText), 'while the new entry’s own text is byte-identical to the baseline’s');

  assert.equal(JSON.parse(raw()).length, 2, 'both records are there');
  assert.equal(JSON.parse(raw()).at(-1).id, draftId, 'the new one appended last');
  assert.equal(loadDraftTrip(draftId).compatible, true, 'and the new record reopens');
});

// ---------------------------------------------------------------------------
// C-7: shared references — aliasing is not duplication.

test('C-7: an ALIASED identity-free object saves and reopens, while the same shape carrying a nested explicit `identity: undefined` refuses by name — the visited set must not let the second branch slip past', () => {
  store.clear();
  const shared = { note: 'one object, reached twice' };
  const aliased = { ...clone(PERU), history: [], left: shared, right: shared };
  assert.equal(aliased.left, aliased.right, 'the fixture really is aliased, not two objects of the same shape');

  const { draftId } = saves(aliased, 'aliased');
  const stored = JSON.parse(raw()).find((e) => e.id === draftId);
  assert.deepStrictEqual(stored.trip.left, shared, 'both branches are stored');
  assert.deepStrictEqual(stored.trip.right, shared);
  assert.notEqual(stored.trip.left, stored.trip.right, 'serialization duplicates a shared object, as it always has');

  // The same SHAPE, with an explicit undefined — which serialization DROPS entirely, so
  // only the in-memory walk can see it. Reached twice, it must still refuse.
  const dirty = { identity: undefined };
  assert.equal(JSON.stringify(dirty), '{}', 'the key really does vanish from the serialized form');
  assert.equal('identity' in dirty, true, 'while remaining present as a key');
  const shapedLikeIt = { ...clone(PERU), history: [], left: dirty, right: dirty };

  store.clear();
  const kept = control();
  const err = refuses(() => saveDraftTrip(shapedLikeIt, 'aliased identity', 'x'), 'identity');
  assert.equal(err.schema, FROZEN.schema);
  assert.deepEqual(listDraftTrips().map((d) => d.id), [kept], 'nothing was appended');
});

// ---------------------------------------------------------------------------
// C-8a, C-8b: a STATEFUL hook — the one fixture that can tell how many times the writer
// serializes. Neither fixture is serialized by the test before the save.

test('C-8a: a hook that is clean on its FIRST call and dirty afterwards saves, is invoked EXACTLY ONCE, and the stored bytes carry the first call’s data with no reserved key', () => {
  store.clear();
  const { calls, branch } = hookedBranch((n) => (n === 1 ? { pass: 'first' } : { pass: `call ${n}`, identity: null }));
  const trip = tripWithBranch(PERU, branch);
  assert.equal(calls.count, 0, 'the fixture has not been serialized by this test');

  const { draftId, loaded } = saves(trip, 'clean first');
  assert.equal(calls.count, 1, 'the writer materialized the entry exactly ONCE — a second serialization would store the dirty call');

  const stored = JSON.parse(raw()).find((e) => e.id === draftId);
  assert.deepStrictEqual(stored.trip.extra, { pass: 'first' }, 'the FIRST call’s data is what was stored');
  assert.deepStrictEqual(loaded.trip.extra, { pass: 'first' }, 'and what reopens');
  assert.deepStrictEqual(identityKeysIn(stored), [], 'no reserved key reached storage');
  assert.equal(raw().includes('"identity"'), false, 'under any spelling in the bytes');
});

test('C-8b: a hook that is dirty on its FIRST call is refused by name, with zero writes and the stored bytes retained', () => {
  store.clear();
  const kept = control();
  const before = raw();
  const { calls, branch } = hookedBranch((n) => (n === 1 ? { identity: null } : { pass: `call ${n}` }));
  const trip = tripWithBranch(PERU, branch);
  assert.equal(calls.count, 0, 'the fixture has not been serialized by this test');

  const err = refuses(() => saveDraftTrip(trip, 'dirty first', 'x'), 'identity');
  assert.equal(err.schema, FROZEN.schema);
  assert.equal(calls.count, 1, 'the hook ran once, and the data it returned is what was refused');
  assert.equal(raw(), before, 'the existing bytes are retained exactly');
  assert.deepEqual(listDraftTrips().map((d) => d.id), [kept]);
});

// ---------------------------------------------------------------------------
// C-9 to C-11: validation bound to the right object. The in-memory candidate passes every
// check; the payload that would actually be stored does not. At 85e2f0f the v8 schema was
// WRITTEN and admitted, and the two shape faults wrote a record the reader then refused.

/** A v7 trip whose own toJSON hands serialization a different payload. The hook is the
 *  only thing added; `returns` is built from an inert copy, so it carries no hook itself. */
function hookedTrip(trip, buildReturn) {
  const inert = { ...clone(stampV7(trip)), history: [] };
  return { ...inert, toJSON: () => buildReturn(inert) };
}

test('C-9: a hook whose serialized output carries schema door2-v8 is refused by name on versions.schema, with zero writes — it is never written and never left for the reader to refuse', () => {
  store.clear();
  const kept = control();
  const before = raw();

  const trip = hookedTrip(PERU, (inert) => ({ ...inert, versions: { ...inert.versions, schema: 'door2-v8' } }));
  assert.equal(trip.versions.schema, 'door2-v7', 'the in-memory candidate is a perfectly valid v7 — it passes the first pass');

  const err = refuses(() => saveDraftTrip(trip, 'serialized v8', 'x'), 'shape');
  assert.equal(err.field, 'versions.schema', 'named on the field that failed');
  assert.equal(err.schema, 'door2-v7', 'and the error reports the envelope schema, as a shape refusal always has');
  assert.equal(raw(), before);
  assert.deepEqual(listDraftTrips().map((d) => d.id), [kept]);
});

test('C-10: a hook that removes a required field from its serialized output is refused by name on that field, with zero writes', () => {
  store.clear();
  const kept = control();
  const before = raw();

  const trip = hookedTrip(PERU, (inert) => {
    const { status, ...rest } = inert;
    assert.equal(typeof status, 'string', 'the field really was there to remove');
    return rest;
  });
  assert.equal(typeof trip.status, 'string', 'the in-memory candidate still has it — the first pass passes');

  const err = refuses(() => saveDraftTrip(trip, 'serialized shape fault', 'x'), 'shape');
  assert.equal(err.field, 'status');
  assert.equal(raw(), before);
  assert.deepEqual(listDraftTrips().map((d) => d.id), [kept]);
});

test('C-11: a hook that invalidates evidence in its serialized output is refused by name on evidence, with zero writes', () => {
  store.clear();
  const kept = control();
  const before = raw();

  // The same independent evidence fault W-5's C3 case uses: the marker is present, so the
  // inspection runs, and there is no evidence object to satisfy it.
  const trip = hookedTrip(PERU, (inert) => ({ ...inert, versions: { ...inert.versions, connectionEvidence: 'not-a-ruleset' } }));
  assert.equal(trip.versions.connectionEvidence, undefined, 'the in-memory candidate carries no marker — the first pass passes');

  const err = refuses(() => saveDraftTrip(trip, 'serialized evidence fault', 'x'), 'shape');
  assert.equal(err.field, 'evidence');
  assert.equal(raw(), before);
  assert.deepEqual(listDraftTrips().map((d) => d.id), [kept]);
});

// ---------------------------------------------------------------------------
// C-12: precedence against MATERIALIZATION failure. The first validation pass must stay,
// or a circular payload's TypeError pre-empts the named refusal that used to fire.

test('C-12: a circular identity-free candidate that ALSO fails shape or evidence keeps its existing NAMED refusal, not a TypeError from the materialization', () => {
  store.clear();
  const kept = control();
  const before = raw();

  const shapeFault = (t) => { const { status, ...rest } = t; return rest; };
  const evidenceFault = (t) => ({ ...t, versions: { ...t.versions, connectionEvidence: 'not-a-ruleset' } });

  for (const [name, fault, field] of [['shape', shapeFault, 'status'], ['evidence', evidenceFault, 'evidence']]) {
    const trip = fault(tripWithBranch(PERU, circular()));
    // Non-vacuity: the cycle is really there, and really is unserializable.
    assert.throws(() => JSON.stringify(trip), TypeError, `${name}: the fixture really cannot be serialized`);
    assert.deepStrictEqual(identityKeysIn(trip), [], `${name}: and carries no reserved key, so identity is not what refuses it`);

    const err = refuses(() => saveDraftTrip(trip, `circular plus ${name}`, 'x'), 'shape');
    assert.equal(err.field, field, `${name}: the existing named field`);
    assert.equal(err.message, `A trip that fails the saved-trip check (${field}) can't be saved as a draft.`, `${name}: the existing message`);
  }
  assert.equal(raw(), before);
  assert.deepEqual(listDraftTrips().map((d) => d.id), [kept]);
});

// ---------------------------------------------------------------------------
// C-13: the INHERITED hook — the construction that withdrew the inert-copy design. A clean
// branch hook installs Object.prototype.toJSON, so a SECOND serialization of the parsed
// entry would inject identity at key `trip` into data that layer 3 had already approved.
// Parsing strips own hooks, not inherited ones. The positive assertions are the test: the
// clean snapshot must SAVE, with ONE write, and the stored entry text must be exactly the
// text that was checked.

test('C-13: a hook that returns clean data while installing an INHERITED Object.prototype.toJSON saves successfully, writes once, and the stored entry text is EXACTLY the text that was checked', () => {
  store.clear();
  const injected = { nested: { identity: { v: 1 } } };
  let installed = 0;
  const branch = {
    toJSON() {
      // Clean data on the way out — and from here on, every object inherits a hook that
      // would replace the trip payload if anything serialized it again.
      installed += 1;
      Object.prototype.toJSON = function toJSONHook(key) {
        return key === 'trip' ? injected : this;
      };
      return { clean: 'snapshot' };
    }
  };
  const trip = tripWithBranch(PERU, branch);

  const writesBefore = writes;
  let captured;
  try {
    captured = capturingSerializations(() => saveDraftTrip(trip, 'inherited hook', 'inherited hook'));
  } finally {
    delete Object.prototype.toJSON;
  }
  assert.equal(Object.prototype.toJSON, undefined, 'the prototype is restored');
  assert.equal(installed, 1, 'the hook really ran, and really installed the inherited one');

  // The positive assertions. "No identity reached storage" alone could be satisfied by an
  // unrelated refusal, so the successful save and the write count are asserted first.
  const draftId = captured.result;
  assert.ok(draftId, 'the clean snapshot SAVES — it must not be refused');
  assert.equal(writes, writesBefore + 1, 'with exactly one write');
  assert.equal(loadDraftTrip(draftId).compatible, true, 'and it reopens');

  const checkedText = captured.frameText();
  assert.equal(raw(), `[${checkedText}]`, 'the stored bytes are the checked entry text, exactly, and nothing else');
  assert.ok(checkedText.includes('"clean":"snapshot"'), 'the checked text really is the clean snapshot');

  const stored = JSON.parse(raw())[0];
  assert.deepStrictEqual(stored.trip.extra, { clean: 'snapshot' }, 'the clean branch is what was stored');
  assert.deepStrictEqual(identityKeysIn(stored), [], 'and no reserved key reached storage at any depth');
  assert.equal(raw().includes('"identity"'), false, 'under any spelling in the bytes');
});

// ---------------------------------------------------------------------------
// C-14: an existing NON-CANONICAL record is preserved byte for byte. This test FAILS on
// unmodified 85e2f0f, which is the evidence that the canonicalization finding is real:
// there, the whole-array reserialize stripped the interior whitespace and rewrote 1.00 as
// 1. The complete original entry span is compared, not parsed equality and not an
// incidental substring.

test('C-14: an admitted record whose stored text is NOT canonical keeps its complete entry span byte for byte across an unrelated save', () => {
  // Seeded from a real save, so the record is genuinely ADMITTED rather than hand-built,
  // and then respelled in two independent ways that JSON.parse accepts and reserialization
  // does not preserve.
  store.clear();
  const seededId = saveDraftTrip({ ...clone(PERU), history: [], extra: { marker: 1 } }, 'seeded', 'seeded');
  const canonicalSpan = raw().slice(1, -1);
  const noncanonicalSpan = canonicalSpan
    .replace('"marker":1', '"marker":1.00')
    .replace('"envelopeVersion":2,', '"envelopeVersion":   2,\n  ');
  assert.notEqual(noncanonicalSpan, canonicalSpan, 'the seed really is respelled');
  store.set(KEY, `[${noncanonicalSpan}]`);

  // It must still be admitted, or the fixture proves nothing about real records.
  assert.equal(loadDraftTrip(seededId).compatible, true, 'the non-canonical record still reopens');
  assert.equal(JSON.parse(raw())[0].trip.extra.marker, 1, 'and 1.00 really does parse to 1');

  const writesBefore = writes;
  const unrelatedId = saveDraftTrip({ ...clone(PERU), history: [], extra: { marker: 2 } }, 'unrelated', 'unrelated');
  assert.equal(writes, writesBefore + 1, 'one write');

  // THE RULING: the complete original entry span, intact, in its original position.
  assert.ok(raw().startsWith(`[${noncanonicalSpan},`), 'the complete original entry span is byte-identical and still first');
  assert.ok(raw().includes('"marker":1.00'), 'the number keeps its original spelling');
  assert.ok(raw().includes('"envelopeVersion":   2,\n  '), 'and the interior whitespace is retained');
  assert.equal(sha256(raw().slice(1, 1 + noncanonicalSpan.length)), sha256(noncanonicalSpan), 'span hashes match');

  // And nothing was lost to achieve it: both records are there, in order, and both reopen.
  const parsed = JSON.parse(raw());
  assert.equal(parsed.length, 2);
  assert.deepEqual(parsed.map((e) => e.id), [seededId, unrelatedId], 'the original first, the new one appended');
  assert.equal(loadDraftTrip(seededId).compatible, true, 'the old record still reopens');
  assert.equal(loadDraftTrip(unrelatedId).compatible, true, 'and so does the new one');
});

// ---------------------------------------------------------------------------
// C-15: the append is structurally correct, across every store shape the splice must cope
// with. The structural contract is the one A3 corrected: the result parses to the ORIGINAL
// PARSED ENTRIES, in their original order, followed by the checked new entry. It is NOT
// that the bytes equal what the old writer would have produced — where old normalization
// changed a value, raw preservation deliberately differs (see the second test below).

/** The store shapes, with the number of entries each one parses to. */
const APPEND_STORES = [
  ['absent storage', null, 0, true],
  ['an empty array', '[]', 0, true],
  ['an empty array with a whitespace-only interior', '[\n \t  \n]', 0, false],
  ['a populated array', JSON.stringify([{ id: 'a', savedAt: '2026-01-01T00:00:00.000Z', label: 'one' }, null, 42]), 3, true],
  ['a populated array with trailing JSON whitespace', `${JSON.stringify([{ id: 'b', savedAt: '2026-01-02T00:00:00.000Z' }])}  \n\t `, 1, false],
  ['entries whose strings contain brackets and commas', JSON.stringify([{ id: 'c],[', savedAt: '2026-01-03T00:00:00.000Z', note: '}],[{"identityish":1},' }]), 1, true]
];

test('C-15: across absent storage, an empty array, a whitespace-only interior, a populated array, trailing whitespace and bracket/comma strings, the result is valid JSON that parses to the original parsed entries in order, followed by the checked new entry', () => {
  for (const [name, seeded, count] of APPEND_STORES) {
    store.clear();
    if (seeded !== null) store.set(KEY, seeded);
    const before = seeded === null ? [] : JSON.parse(seeded);
    assert.equal(before.length, count, `${name}: the fixture parses to ${count}`);

    const captured = capturingSerializations(() => saveDraftTrip({ ...clone(PERU), history: [] }, `${name} label`, name));
    const draftId = captured.result;
    assert.ok(draftId, `${name}: it saved`);
    const checkedEntry = JSON.parse(`[${captured.frameText()}]`)[0];

    // Valid JSON, and exactly the structural contract.
    let parsed;
    assert.doesNotThrow(() => { parsed = JSON.parse(raw()); }, `${name}: the result is valid JSON`);
    assert.ok(Array.isArray(parsed), `${name}: still an array`);
    assert.equal(parsed.length, before.length + 1, `${name}: one entry longer`);
    assert.deepStrictEqual(parsed.slice(0, before.length), before, `${name}: the ORIGINAL PARSED ENTRIES, in their original order`);
    assert.deepStrictEqual(parsed.at(-1), checkedEntry, `${name}: followed by the CHECKED new entry`);
    assert.equal(parsed.at(-1).id, draftId, `${name}: which is the record the writer reported`);
    assert.equal(loadDraftTrip(draftId).compatible, true, `${name}: and it reopens`);

    // Whatever sat before the outer closing delimiter is still there, byte for byte, and
    // so is whatever followed it.
    if (seeded !== null) {
      const close = seeded.lastIndexOf(']');
      assert.ok(raw().startsWith(seeded.slice(0, close)), `${name}: the text before the delimiter is untouched`);
      assert.ok(raw().endsWith(seeded.slice(close)), `${name}: and the text after it, trailing whitespace included`);
    }
  }
});

test('C-15 (the ORDINARY subsection): for fixtures whose parsed values survive the old serialization unchanged, the result is byte-identical to what the writer at 85e2f0f would have stored', () => {
  /**
   * What the writer at 85e2f0f stored: JSON.stringify of the whole list — the existing
   * parsed drafts followed by the new entry. The entry's field ORDER is the writer's
   * documented envelope (envelopeVersion, id, label, destinationLabel only when it is a
   * non-empty string, savedAt, trip), which is what makes this a BYTE comparison rather
   * than a structural one. Reconstructed from the stored entry's own parsed fields, so no
   * production export, observer or hook is needed to obtain it.
   */
  const baselineWriterOutput = (draftsBefore, stored) => JSON.stringify([
    ...draftsBefore,
    {
      envelopeVersion: stored.envelopeVersion,
      id: stored.id,
      label: stored.label,
      ...(typeof stored.destinationLabel === 'string' && stored.destinationLabel !== '' ? { destinationLabel: stored.destinationLabel } : {}),
      savedAt: stored.savedAt,
      trip: stored.trip
    }
  ]);

  for (const [name, seeded, count, canonical] of APPEND_STORES) {
    if (!canonical) continue; // the non-canonical shapes are C-14's subject, not this one
    store.clear();
    if (seeded !== null) store.set(KEY, seeded);
    const before = seeded === null ? [] : JSON.parse(seeded);
    assert.equal(before.length, count, `${name}: the fixture parses to ${count}`);

    const draftId = saveDraftTrip({ ...clone(PERU), history: [] }, `${name} label`, name);
    const stored = JSON.parse(raw()).find((e) => e?.id === draftId);
    assert.equal(raw(), baselineWriterOutput(before, stored), `${name}: byte-identical to the 85e2f0f writer's output`);
  }

});

test('C-15 (the normalization COUNTEREXAMPLES): values the old serialization changed are deliberately NOT equal to what 85e2f0f would have stored, which is why the baseline comparison above is restricted rather than universal', () => {
  // A3's correction, proved rather than merely asserted. These fixtures are the reason the
  // structural contract is "parses to the original parsed entries, in order, followed by
  // the checked new entry" and NOT "equals what the old writer would have produced". They
  // sit OUTSIDE the ordinary subsection above on purpose: that subsection alone is
  // mutation 20's unaffected control, and these two values do not survive mutation 20.
  store.clear();
  const seeded = '[{"id":"z","savedAt":"2026-01-01T00:00:00.000Z","negativeZero":-0,"overflow":1e400}]';
  store.set(KEY, seeded);
  const draftId = saveDraftTrip({ ...clone(PERU), history: [] }, 'counterexamples', 'counterexamples');
  const parsed = JSON.parse(raw());

  assert.ok(Object.is(parsed[0].negativeZero, -0), 'negative zero is retained, where the old writer rewrote it as positive zero');
  assert.equal(parsed[0].overflow, Infinity, 'and 1e400 stays Infinity, where the old writer rewrote it as null');
  // Non-vacuity: these really are values a parse-and-reserialize would have changed.
  assert.equal(JSON.stringify(parsed[0].negativeZero), '0', 'reserializing them is exactly what used to lose them');
  assert.equal(JSON.stringify(parsed[0].overflow), 'null');

  assert.ok(raw().startsWith(`${seeded.slice(0, seeded.lastIndexOf(']'))},`), 'the original entry span is preserved byte for byte');
  assert.equal(parsed.length, 2, 'and the new entry follows it');
  assert.equal(parsed.at(-1).id, draftId);
  assert.equal(loadDraftTrip(draftId).compatible, true, 'and the new record reopens');
  // No number policy, no repair, no admission change was needed to get here.
  assert.equal(raw().includes('1e400'), true, 'the stored text still spells it exactly as it was stored');
});

// ---------------------------------------------------------------------------
// C-16: layer 3's domain is the materialized TRIP PAYLOAD, not the envelope around it.
// Correction round 2, finding R1 of codex-diff-review-…-967910a-AMEND-2026-10-20.md.
//
// At 967910a layer 3 scanned the whole materialized ENTRY, so a reserved key sitting in
// the caller's own `label` argument refused a save of an entirely clean trip: an inert
// object label carrying `identity: null` wrote nothing, where at 85e2f0f that same call
// saved once and the record reopened. The barrier's domain is the candidate PAYLOAD
// (contract §3.3; brief draft 5 §3.1 and §3.3 step 8), so refusing on envelope metadata
// was a write regression on inert input, not a stronger reading of the rule.
//
// The pair below pins the domain from both sides, and neither side introduces a label or
// metadata policy: the label is stored exactly as handed — never stringified, stripped,
// replaced by a fallback or validated — and the payload scan is unchanged in strength.

test('C-16: a CLEAN trip saved with an inert object-valued `label` carrying a reserved key still saves, writes once and reopens, with the label stored exactly as handed', () => {
  store.clear();
  const kept = control();
  const trip = { ...clone(PERU), history: [] };
  const label = { display: 'fallback label', identity: null };
  const labelSnapshot = inertSnapshot(label);
  const tripSnapshot = inertSnapshot(trip);

  // Non-vacuity, from both sides. The TRIP is clean in memory and stays clean through
  // serialization, so the barrier has nothing in its domain to refuse; the LABEL does
  // carry the reserved key, which is the only thing the envelope-wide scan saw.
  assert.deepStrictEqual(identityKeysIn(trip), [], 'the trip carries no reserved key in memory');
  assert.deepStrictEqual(identityKeysIn(json(trip)), [], 'and none once serialized either');
  assert.deepStrictEqual(identityKeysIn(label), ['$.identity'], 'while the label carries exactly one');

  const writesBefore = writes;
  const draftId = saveDraftTrip(trip, label, 'Peru');
  assert.ok(draftId, 'the save must land: a clean payload is storable whatever the label holds');
  assert.equal(writes, writesBefore + 1, 'and it writes exactly once');
  assert.equal(loadDraftTrip(draftId).compatible, true, 'the record reopens');

  // The label is stored EXACTLY as handed. This is the whole point of the case: the fix
  // is to stop scanning metadata, NOT to sanitise it into something scannable.
  const stored = JSON.parse(raw()).find((e) => e.id === draftId);
  assert.deepStrictEqual(stored.label, labelSnapshot, 'the stored label is exactly what was handed in');
  assert.equal(typeof stored.label, 'object', 'it was not stringified');
  assert.equal('identity' in stored.label, true, 'and its reserved key was not stripped to make the save fit');
  assert.deepStrictEqual(identityKeysIn(stored.trip), [], 'while the stored payload carries no reserved key');

  // Existing reader behaviour, asserted rather than changed: a non-string label was always
  // listable and openable, and both records are still there afterwards.
  const listed = listDraftTrips().map((d) => d.id);
  assert.equal(listed.length, 2, 'both records are listed');
  assert.ok(listed.includes(kept) && listed.includes(draftId), 'the control and the new record');
  assert.deepStrictEqual(inertSnapshot(trip), tripSnapshot, 'the input trip is unmutated');
  assert.deepStrictEqual(inertSnapshot(label), labelSnapshot, 'and so is the label argument');
});

test('C-16 (control): with that SAME object label, a reserved key in the PAYLOAD is still refused by name — in memory, and when only the materialization carries it — with zero writes and the stored bytes retained', () => {
  // The scan changed domain; it did not weaken. Two fixtures, because only the second of
  // them can be caught by layer 3: the first carries the key in memory, so layer 2 sees
  // it, while the second is clean in memory and acquires the key at serialization time.
  const label = { display: 'fallback label', identity: null };

  for (const [which, build] of [
    ['in memory', () => tripWithBranch(PERU, { nested: [{ identity: null }] })],
    ['introduced at serialization time, so ONLY the materialized payload carries it', () => tripWithBranch(PERU, hookedBranch({ nested: [{ identity: null }] }).branch)]
  ]) {
    store.clear();
    const kept = control();
    const before = raw();
    const trip = build();
    const snapshot = inertSnapshot(trip);

    const err = refuses(() => saveDraftTrip(trip, label, 'Peru'), 'identity');
    assert.equal(err.name, FROZEN.name, `${which}: the frozen class`);
    assert.equal(err.schema, FROZEN.schema, `${which}: the version it could only be written under`);
    assert.equal(err.field, FROZEN.field, `${which}: the frozen field`);
    assert.equal(err.message, FROZEN.message, `${which}: the frozen message`);

    assert.deepStrictEqual(inertSnapshot(trip), snapshot, `${which}: the input is unmutated`);
    assert.equal(raw(), before, `${which}: the existing bytes are retained exactly`);
    assert.deepEqual(listDraftTrips().map((d) => d.id), [kept], `${which}: and nothing was appended`);
  }
});

// ---------------------------------------------------------------------------
// Q8 PACKET 2: RULE W, the envelope write-integrity invariant (step 8b).
//
// Build brief build-brief-q8-packet2-getter-rule-w-2026-10-21-draft1.md §7.1, read with
// binding-clarifications-…-B1-B4-2026-10-21.md (B1-B4 govern where they differ) and the
// C1-C5 errata. Everything below is an ADDITION: no existing body, title or helper above
// this line is edited.
//
// The rule: after the existing materialized-payload checks, a successful save preserves
// the writer-generated envelopeVersion, id and savedAt as OWN scalar properties equal to
// their assembly values, and writes no own envelope key absent from the pre-materialization
// assembly key set. Violation refuses by name with zero writes and unchanged stored bytes.
// It does NOT guarantee id uniqueness, complete envelope equality or payload fidelity.

const ENVELOPE_VERSION_LITERAL = 2;

// The NEW error contract, spelled out as independent literals. B2.3: an expectation
// generated by calling the production constructor under test can reproduce the same
// mistake, so nothing here is derived from it — not the message, not the field.
const ENVELOPE_FROZEN = { name: 'DraftNotStorableError', check: 'envelope', schema: 'door2-v7' };
const ENVELOPE_MESSAGE = Object.freeze({
  id: 'The record this save assembled was not the record it was about to write (id), so nothing was saved.',
  envelopeVersion: 'The record this save assembled was not the record it was about to write (envelopeVersion), so nothing was saved.',
  savedAt: 'The record this save assembled was not the record it was about to write (savedAt), so nothing was saved.',
  smuggledKey: 'The record this save assembled was not the record it was about to write (smuggledKey), so nothing was saved.'
});

// The EXISTING contracts these cases must leave untouched, also as literals (E-8a, E-10).
const SHAPE_MESSAGE = Object.freeze({
  status: "A trip that fails the saved-trip check (status) can't be saved as a draft.",
  evidence: "A trip that fails the saved-trip check (evidence) can't be saved as a draft.",
  evidence_version_unsupported: "A trip that fails the saved-trip check (evidence_version_unsupported) can't be saved as a draft.",
  trip: "A trip that fails the saved-trip check (trip) can't be saved as a draft."
});
const SCHEMA_MESSAGE_V5 = 'A trip with schema "door2-v5" can\'t be saved as a draft.';

/**
 * The COMPLETE immutability witness C1 and B1 require. A snapshot that merely skips
 * accessors proves only "zero getter calls": the reviewer changed an accessor's getter
 * function after such a snapshot and a second snapshot still compared equal. So per own
 * key this records whether the property is an accessor, its `get`/`set` function references
 * BY IDENTITY (never invoked), the descriptor flags, and — for a data property only — its
 * value recursively. inertSnapshot is deliberately NOT reused for these fixtures:
 * Object.entries invokes getters (F9), which would arm a fixture during setup.
 */
function descriptorWitness(value, seen = new Map()) {
  if (value === null || typeof value !== 'object') return { kind: typeof value, value };
  if (seen.has(value)) return seen.get(value);
  const node = { kind: Array.isArray(value) ? 'array' : 'object', keys: Object.getOwnPropertyNames(value), props: {} };
  seen.set(value, node);
  for (const key of node.keys) {
    const d = Object.getOwnPropertyDescriptor(value, key);
    node.props[key] = Object.hasOwn(d, 'get') || Object.hasOwn(d, 'set')
      ? { accessor: true, get: d.get, set: d.set, enumerable: d.enumerable, configurable: d.configurable }
      : { accessor: false, enumerable: d.enumerable, configurable: d.configurable, writable: d.writable, value: descriptorWitness(d.value, seen) };
  }
  return node;
}

/** Own presence and value of the three covered scalars, plus the own key list — enough to
 *  establish that the intended envelope alteration really occurred (B1.2). Own-property
 *  reads only, so it reports the own truth even under an inherited getter. */
const captureEnvelope = (e) => ({
  ownKeys: Object.keys(e),
  scalars: Object.fromEntries(
    ['envelopeVersion', 'id', 'savedAt'].map((k) => [k, Object.hasOwn(e, k) ? { own: true, value: e[k] } : { own: false }])
  )
});

const isEnvelopeFrame = (v) => v !== null && typeof v === 'object' && !Array.isArray(v) && v.envelopeVersion === ENVELOPE_VERSION_LITERAL;

/** The complete own-descriptor map of Object.prototype, for the hygiene assertions (E-9). */
const prototypeWitness = () =>
  Object.fromEntries(Object.getOwnPropertyNames(Object.prototype).map((k) => [k, Object.getOwnPropertyDescriptor(Object.prototype, k)]));

/**
 * The bounded INHERITED envelope hook, armed for one save only.
 *
 * B1.1: the hook RETURNS, it does not throw. It returns an envelope copy with the covered
 * alteration and an otherwise valid payload; it never constructs or throws the expected
 * refusal, never patches or wraps the save export, and never manufactures the diagnostic.
 * Every non-target frame returns `this` unchanged, so no other JSON.stringify is altered —
 * one ordinary save invokes this on 154 frames, which is exactly why safety must not be
 * inferred from the selector alone.
 *
 * B1.3: the counter is asserted zero immediately before the save, so nothing armed it
 * during setup, and the prior DESCRIPTOR is restored in a `finally` — restored, not
 * deleted — before any later assertion or operation that needs no hook.
 *
 * `frame` picks the demonstrated route: 'entry' is the entry-key ('0') hook, 'array' the
 * array-root ('') hook. F1 confirmed both reproduce.
 */
function withInheritedEnvelopeHook(frame, transform, fn) {
  const prior = Object.getOwnPropertyDescriptor(Object.prototype, 'toJSON');
  const seen = { frames: 0, targets: 0, captured: null };
  Object.defineProperty(Object.prototype, 'toJSON', {
    value: function envelopeHook(key) {
      seen.frames += 1;
      const hit = frame === 'array'
        ? key === '' && Array.isArray(this) && this.length === 1 && isEnvelopeFrame(this[0])
        : key === '0' && isEnvelopeFrame(this);
      if (!hit) return this;
      seen.targets += 1;
      const returned = frame === 'array' ? [transform(this[0])] : transform(this);
      seen.captured = captureEnvelope(frame === 'array' ? returned[0] : returned);
      return returned;
    },
    writable: true,
    enumerable: false,
    configurable: true
  });
  try {
    assert.equal(seen.targets, 0, 'ZERO setup arming: the hook must not have fired before the save');
    return { seen, value: fn() };
  } finally {
    if (prior) Object.defineProperty(Object.prototype, 'toJSON', prior);
    else delete Object.prototype.toJSON;
  }
}

/**
 * One envelope-refusal case, with the whole effect asserted: the named error and its full
 * §4 contract against literals, ZERO WRITES counted directly, byte-identical storage, an
 * unchanged record count, unmutated inputs by the complete witness, positive hook
 * reachability, the captured frame showing the alteration really occurred, prototype
 * hygiene after restoration — and a successful SAME-BUILD control, which is also what
 * proves this very input passes phase 1.
 *
 * `opts.expectCapture` is a FUNCTION, called after the hook has run, so a case can assert
 * against the writer's own generated values rather than guessing them.
 */
function envelopeRefusal(opts) {
  const { frame = 'entry', transform, field, label = 'rule w' } = opts;
  store.clear();
  const kept = control();
  const before = raw();
  const records = JSON.parse(before).length;
  const writesBefore = writes;

  const trip = { ...clone(PERU), history: [] };
  const tripWitness = descriptorWitness(trip);
  const labelWitness = descriptorWitness(label);
  const protoBefore = prototypeWitness();

  let err = null;
  const { seen } = withInheritedEnvelopeHook(frame, transform, () => {
    err = refuses(() => saveDraftTrip(trip, label, label), 'envelope');
  });
  // A case that installed anything else on the prototype takes it down here, so the hygiene
  // comparison below covers the whole fixture and the control save runs on a clean realm.
  if (opts.afterHook) opts.afterHook();

  // Prototype hygiene, immediately after restoration (E-9).
  assert.deepStrictEqual(prototypeWitness(), protoBefore, 'Object.prototype is restored exactly, descriptors included');
  assert.equal(Object.hasOwn(Object.prototype, 'toJSON'), false, 'and carries no leftover toJSON');

  // The COMPLETE new contract, against the literals above — never the constructor (B2.3).
  assert.ok(err instanceof DraftNotStorableError, 'the existing class');
  assert.equal(err.name, ENVELOPE_FROZEN.name, 'no rename and no subclass');
  assert.equal(err.check, ENVELOPE_FROZEN.check);
  assert.equal(err.schema, ENVELOPE_FROZEN.schema);
  assert.equal(err.field, field, 'the violated field, not versions.schema');
  assert.equal(err.message, ENVELOPE_MESSAGE[field], 'the owner-confirmed message, exactly');

  // Non-vacuity: the hook really ran, and really returned the intended alteration.
  assert.ok(seen.targets > 0, `the hook must reach the envelope frame; targets=${seen.targets}`);
  assert.ok(seen.frames > seen.targets, 'and it ran on non-target frames too, every one of which returned `this`');
  assert.deepStrictEqual(seen.captured, opts.expectCapture(), 'the returned frame carried exactly the intended envelope alteration');

  // COUNT the writes (B1.4). Unchanged bytes and an unchanged record count do not
  // distinguish zero writes from rewriting identical bytes, so they stay but are not the
  // primary claim.
  assert.equal(writes, writesBefore, 'the refused save performs ZERO writes — counted, not inferred');
  assert.equal(raw(), before, 'the stored bytes are byte-identical');
  assert.equal(JSON.parse(raw()).length, records, 'and the record count is unchanged');
  assert.deepEqual(listDraftTrips().map((d) => d.id), [kept], 'nothing was appended');

  // Neither input argument mutated.
  assert.deepStrictEqual(descriptorWitness(trip), tripWitness, 'the input trip is unmutated');
  assert.deepStrictEqual(descriptorWitness(label), labelWitness, 'and so is the label argument');

  // The paired successful SAME-BUILD control. It is also the phase-1 proof: this very input
  // saves on this very build once nothing alters the envelope, so the refusal above is
  // about the materialized envelope and not about the candidate.
  const ok = saves({ ...clone(PERU), history: [] }, `${label} control`);
  assert.equal(loadDraftTrip(ok.draftId).compatible, true, 'the control record reopens');
  return err;
}

const ALL_KEYS = ['envelopeVersion', 'id', 'label', 'destinationLabel', 'savedAt', 'trip'];
/** The writer's own generated values, recorded by the hook so expectations can name them. */
const recorder = () => ({ envelopeVersion: undefined, id: undefined, savedAt: undefined });
const record = (into, e) => Object.assign(into, { envelopeVersion: e.envelopeVersion, id: e.id, savedAt: e.savedAt });
const ownScalars = (real, over = {}) => ({
  envelopeVersion: { own: true, value: real.envelopeVersion },
  id: { own: true, value: real.id },
  savedAt: { own: true, value: real.savedAt },
  ...over
});

// ---------------------------------------------------------------------------
// E-1, E-2: the demonstrated substitution, by both demonstrated routes.

for (const [frame, title, keyLabel] of [['entry', 'E-1', "the ENTRY-KEY ('0')"], ['array', 'E-2', "the ARRAY-ROOT ('')"]]) {
  test(`${title}: ${keyLabel} inherited hook that SUBSTITUTES the generated id is refused by name on field id, with zero writes, the stored bytes byte-identical, the record count unchanged and the inputs unmutated`, () => {
    const real = recorder();
    envelopeRefusal({
      frame,
      field: 'id',
      transform: (e) => (record(real, e), { ...e, id: 'SUBSTITUTED_ID' }),
      expectCapture: () => ({ ownKeys: ALL_KEYS, scalars: ownScalars(real, { id: { own: true, value: 'SUBSTITUTED_ID' } }) })
    });
  });
}

// ---------------------------------------------------------------------------
// E-3: every covered scalar, ALTERED and DELETED separately — six cases. The deleted cases
// are F2d/F2e's orphan route: a record stored without the scalar it was assembled with.

const ALTERED = { envelopeVersion: 99, id: 'SUBSTITUTED_ID', savedAt: '1999-01-01T00:00:00.000Z' };

for (const field of ['id', 'envelopeVersion', 'savedAt']) {
  test(`E-3 (altered): an inherited hook that CHANGES the generated ${field} is refused by name on field ${field}, with zero writes and the stored bytes retained`, () => {
    const real = recorder();
    envelopeRefusal({
      field,
      transform: (e) => (record(real, e), { ...e, [field]: ALTERED[field] }),
      expectCapture: () => ({ ownKeys: ALL_KEYS, scalars: ownScalars(real, { [field]: { own: true, value: ALTERED[field] } }) })
    });
  });

  test(`E-3 (deleted): an inherited hook that DELETES the generated ${field} — the orphan route — is refused by name on field ${field}, with zero writes and the stored bytes retained`, () => {
    const real = recorder();
    envelopeRefusal({
      field,
      transform: (e) => {
        record(real, e);
        const copy = { ...e };
        delete copy[field];
        return copy;
      },
      expectCapture: () => ({ ownKeys: ALL_KEYS.filter((k) => k !== field), scalars: ownScalars(real, { [field]: { own: false } }) })
    });
  });
}

// ---------------------------------------------------------------------------
// E-4: an INJECTED envelope key, with all three scalars valid and present. This is what
// distinguishes the key SUBSET condition from a presence-only check: nothing the three
// scalar comparisons look at is wrong in this case.

test('E-4: an inherited hook that INJECTS an envelope key while leaving all three generated scalars valid and present is refused by name, with field naming the injected key, zero writes and the stored bytes retained', () => {
  const real = recorder();
  const err = envelopeRefusal({
    field: 'smuggledKey',
    transform: (e) => (record(real, e), { ...e, smuggledKey: 'carried out under an old version number' }),
    expectCapture: () => ({ ownKeys: [...ALL_KEYS, 'smuggledKey'], scalars: ownScalars(real) })
  });
  assert.equal(err.field, 'smuggledKey', 'the field names the injected key itself');
});

// ---------------------------------------------------------------------------
// E-5: F2g. A DELETED own key whose expected value is supplied by an Object.prototype
// getter. An implementation that reads `framed.entry.id` without establishing own presence
// passes every E-3 case above and still writes the orphan; this is the case that catches it.

test('E-5 (F2g): a deleted own id whose expected value is supplied by an INHERITED Object.prototype getter is still refused by name on field id — an unguarded property read would agree and write an orphan', () => {
  const priorId = Object.getOwnPropertyDescriptor(Object.prototype, 'id');
  const real = recorder();
  let getterCalls = 0;
  try {
    const err = envelopeRefusal({
      field: 'id',
      transform: (e) => {
        record(real, e);
        // The inherited value an unguarded read would accept: exactly the id the writer
        // generated, so the refusal cannot come from a value comparison disagreeing.
        Object.defineProperty(Object.prototype, 'id', {
          get() {
            getterCalls += 1;
            return real.id;
          },
          configurable: true,
          enumerable: false
        });
        const copy = { ...e };
        delete copy.id;
        return copy;
      },
      expectCapture: () => ({ ownKeys: ALL_KEYS.filter((k) => k !== 'id'), scalars: ownScalars(real, { id: { own: false } }) }),
      afterHook: () => {
        if (priorId) Object.defineProperty(Object.prototype, 'id', priorId);
        else delete Object.prototype.id;
      }
    });
    assert.equal(err.field, 'id');
    // Own presence is established FIRST and short-circuits, so the inherited value is never
    // consulted at all. An unguarded read would have consulted it and agreed.
    assert.equal(getterCalls, 0, `the save never fell back to the inherited getter; calls=${getterCalls}`);
  } finally {
    if (priorId) Object.defineProperty(Object.prototype, 'id', priorId);
    else delete Object.prototype.id;
  }
  assert.equal(Object.hasOwn(Object.prototype, 'id'), false, 'Object.prototype carries no leftover id');

  // The construction really was the F2g one: with the own key gone, an inherited read did
  // supply the expected value. Asserted on a fresh plain object under the same getter, so
  // the claim is about the construction and not about the writer's internals.
  const priorAgain = Object.getOwnPropertyDescriptor(Object.prototype, 'id');
  try {
    Object.defineProperty(Object.prototype, 'id', { get: () => real.id, configurable: true, enumerable: false });
    const orphan = {};
    assert.equal(Object.hasOwn(orphan, 'id'), false, 'no own id');
    assert.equal(orphan.id, real.id, 'yet an unguarded read returns the expected id — which is the whole trap');
  } finally {
    if (priorAgain) Object.defineProperty(Object.prototype, 'id', priorAgain);
    else delete Object.prototype.id;
  }
  assert.equal(Object.hasOwn(Object.prototype, 'id'), false, 'and the prototype is clean again');
});

// ---------------------------------------------------------------------------
// E-6: THE NON-REGRESSION POSITIVES. The bar is a condition, not a target: an
// implementation that refuses inert caller input has violated the governing addendum, not
// satisfied it. Both of F4's label cases must still SAVE, with no hook anywhere.

test('E-6(a): an inert OBJECT-valued label carrying `identity: null` still SAVES on this build — one write, it reopens, and the stored label deep-equals what was handed in', () => {
  store.clear();
  const kept = control();
  const writesBefore = writes;
  const trip = { ...clone(PERU), history: [] };
  const label = { display: 'fallback label', identity: null };
  const tripWitness = descriptorWitness(trip);
  const labelWitness = descriptorWitness(label);

  const draftId = saveDraftTrip(trip, label, 'Peru');
  assert.ok(draftId, 'the save must LAND: Rule W covers the generated scalars, not caller metadata');
  assert.equal(writes, writesBefore + 1, 'exactly one write');
  assert.equal(loadDraftTrip(draftId).compatible, true, 'and the record reopens');

  const stored = JSON.parse(raw()).find((e) => e.id === draftId);
  assert.deepStrictEqual(stored.label, { display: 'fallback label', identity: null }, 'the stored label is exactly what was handed in');
  assert.equal('identity' in stored.label, true, 'its reserved key was not stripped to make the save fit');
  assert.equal(stored.envelopeVersion, ENVELOPE_VERSION_LITERAL, 'and the envelope is intact');
  assert.equal(typeof stored.savedAt, 'string', 'with an own ISO timestamp');
  assert.deepEqual(listDraftTrips().map((d) => d.id).sort(), [kept, draftId].sort(), 'both records are listed');
  assert.deepStrictEqual(descriptorWitness(trip), tripWitness, 'the input trip is unmutated');
  assert.deepStrictEqual(descriptorWitness(label), labelWitness, 'and so is the label argument');
});

test('E-6(b): `label: undefined` still SAVES on this build — one write, it reopens, and the stored record has NO OWN `label` key, which is the key loss the subset direction exists to allow', () => {
  store.clear();
  const kept = control();
  const writesBefore = writes;
  const trip = { ...clone(PERU), history: [] };

  const draftId = saveDraftTrip(trip, undefined, 'Peru');
  assert.ok(draftId, 'the save must LAND: exact key equality here would be the R1 failure repeated');
  assert.equal(writes, writesBefore + 1, 'exactly one write');
  assert.equal(loadDraftTrip(draftId).compatible, true, 'and the record reopens');

  const stored = JSON.parse(raw()).find((e) => e.id === draftId);
  // KEY ABSENCE, not equality between two missing reads.
  assert.equal(Object.hasOwn(stored, 'label'), false, 'the stored record carries no own `label` key at all');
  assert.equal(Object.keys(stored).includes('label'), false, 'under Object.keys either');
  assert.deepStrictEqual(Object.keys(stored), ['envelopeVersion', 'id', 'destinationLabel', 'savedAt', 'trip'], 'the own key set is the assembly set minus the dropped label');
  assert.equal(stored.envelopeVersion, ENVELOPE_VERSION_LITERAL);
  assert.equal(loadDraftTrip(draftId).compatible, true, 'and a record with no label still reopens');
  assert.deepEqual(listDraftTrips().map((d) => d.id).sort(), [kept, draftId].sort());
});

// ---------------------------------------------------------------------------
// E-7: the success control on this fixture. Not a uniqueness claim across saves — F8's
// generator collisions remain accepted residue and Rule W creates no uniqueness guarantee.

test('E-7: a clean save on this build returns an id that REOPENS — the success control on this fixture, and not proof of id uniqueness across saves', () => {
  store.clear();
  const writesBefore = writes;
  const trip = { ...clone(PERU), history: [] };
  const draftId = saveDraftTrip(trip, 'e7', 'e7');
  assert.ok(draftId, 'the clean save lands');
  assert.equal(writes, writesBefore + 1, 'with exactly one write');
  const loaded = loadDraftTrip(draftId);
  assert.equal(loaded.compatible, true, `and what it wrote reopens: ${loaded.reason ?? ''}`);
  const stored = JSON.parse(raw()).find((e) => e.id === draftId);
  assert.equal(stored.id, draftId, 'the stored own id is the id returned');
  assert.equal(Object.hasOwn(stored, 'id'), true, 'present as an OWN property');
  assert.equal(stored.envelopeVersion, ENVELOPE_VERSION_LITERAL);
  assert.equal(typeof stored.savedAt, 'string');
});

// ---------------------------------------------------------------------------
// E-8a: PRESERVATION. Every existing check value still produces its exact check, schema,
// field and message text, byte for byte. Additive means additive; this is asserted, not
// assumed. B2.2: the existing check values are schema, identity and shape — THREE, not
// four. `evidence_version_unsupported` is a shape detail carried in `field`, never a
// fourth check value.

test('E-8a: every EXISTING check value keeps its exact check, schema, field and message text — schema, identity and shape, with evidence_version_unsupported as a shape FIELD and not a fourth check', () => {
  const cases = [
    { ctor: ['schema', 'door2-v5'], check: 'schema', schema: 'door2-v5', field: 'versions.schema', message: SCHEMA_MESSAGE_V5 },
    { ctor: ['identity', 'door2-v8'], check: 'identity', schema: 'door2-v8', field: 'identity', message: FROZEN.message },
    { ctor: ['shape', 'status'], check: 'shape', schema: 'door2-v7', field: 'status', message: SHAPE_MESSAGE.status },
    { ctor: ['shape', 'trip'], check: 'shape', schema: 'door2-v7', field: 'trip', message: SHAPE_MESSAGE.trip },
    { ctor: ['shape', 'evidence'], check: 'shape', schema: 'door2-v7', field: 'evidence', message: SHAPE_MESSAGE.evidence },
    {
      ctor: ['shape', 'evidence_version_unsupported'],
      check: 'shape',
      schema: 'door2-v7',
      field: 'evidence_version_unsupported',
      message: SHAPE_MESSAGE.evidence_version_unsupported
    }
  ];
  for (const c of cases) {
    const err = new DraftNotStorableError(...c.ctor);
    const where = `(${c.ctor.join(', ')})`;
    assert.equal(err.name, 'DraftNotStorableError', `${where}: the class name`);
    assert.equal(err.check, c.check, `${where}: check`);
    assert.equal(err.schema, c.schema, `${where}: schema`);
    assert.equal(err.field, c.field, `${where}: field`);
    assert.equal(err.message, c.message, `${where}: the message text, byte for byte`);
  }
  // THREE existing check values, enumerated — the enumeration itself is the B2.2 assertion.
  assert.deepStrictEqual([...new Set(cases.map((c) => c.check))], ['schema', 'identity', 'shape'], 'three existing check values, not four');
});

// ---------------------------------------------------------------------------
// E-8b: THE NEW CONTRACT, asserted against independent literals. B2.3: an expectation
// generated by calling the same production constructor under test can reproduce the same
// mistake, so every expected value below is written out. For detail `id` the expected
// message contains the characters `(id)` — never the characters of an interpolation.

test('E-8b: the NEW envelope contract, asserted against independent literals — the existing class, name DraftNotStorableError, check envelope, schema door2-v7, field the violated field, and the fixed message spelled out', () => {
  assert.equal(
    ENVELOPE_MESSAGE.id,
    'The record this save assembled was not the record it was about to write (id), so nothing was saved.',
    'the expectation itself is a literal, not a template evaluated against the production constructor'
  );
  for (const field of ['id', 'envelopeVersion', 'savedAt', 'smuggledKey']) {
    const err = new DraftNotStorableError('envelope', field);
    assert.ok(err instanceof DraftNotStorableError, `${field}: the existing class`);
    assert.ok(err instanceof Error, `${field}: still an Error`);
    assert.equal(err.constructor.name, 'DraftNotStorableError', `${field}: no subclass`);
    assert.equal(err.name, 'DraftNotStorableError', `${field}: name`);
    assert.equal(err.check, 'envelope', `${field}: check`);
    assert.equal(err.schema, 'door2-v7', `${field}: schema is ENVELOPE_SCHEMA, not the detail`);
    assert.equal(err.field, field, `${field}: field is the violated field, not versions.schema`);
    assert.equal(err.message, ENVELOPE_MESSAGE[field], `${field}: the message, against the literal`);
    assert.equal(err.message.includes('${detail}'), false, `${field}: the detail is interpolated, not left as source characters`);
    assert.equal(err.message.includes(`(${field})`), true, `${field}: and the message names the field in parentheses`);
  }
});

// ---------------------------------------------------------------------------
// E-9: PROTOTYPE HYGIENE after every fixture that touches Object.prototype. The complete
// own-descriptor map is compared, not a presence check: restoring a descriptor and deleting
// a key are different acts, and only the map tells them apart.

test('E-9: Object.prototype is left exactly as it was found — the complete own-descriptor map is identical after an armed envelope hook and after an armed inherited getter', () => {
  const protoBefore = prototypeWitness();
  const namesBefore = Object.getOwnPropertyNames(Object.prototype);

  // An armed envelope hook, restored in its finally.
  store.clear();
  control();
  const real = recorder();
  withInheritedEnvelopeHook('entry', (e) => (record(real, e), { ...e, id: 'SUBSTITUTED_ID' }), () => {
    assert.throws(() => saveDraftTrip({ ...clone(PERU), history: [] }, 'e9', 'e9'), DraftNotStorableError);
  });
  assert.deepStrictEqual(prototypeWitness(), protoBefore, 'after the envelope hook: descriptors identical');

  // An armed inherited getter, restored from its descriptor rather than deleted.
  const priorId = Object.getOwnPropertyDescriptor(Object.prototype, 'id');
  try {
    Object.defineProperty(Object.prototype, 'id', { get: () => 'x', configurable: true, enumerable: false });
  } finally {
    if (priorId) Object.defineProperty(Object.prototype, 'id', priorId);
    else delete Object.prototype.id;
  }
  assert.deepStrictEqual(prototypeWitness(), protoBefore, 'after the inherited getter: descriptors identical');
  assert.deepStrictEqual(Object.getOwnPropertyNames(Object.prototype), namesBefore, 'and no key was added or lost');
  assert.equal(Object.hasOwn(Object.prototype, 'toJSON'), false);
  assert.equal(Object.hasOwn(Object.prototype, 'id'), false);
});

// ---------------------------------------------------------------------------
// E-10: MIXED-FAULT PRECEDENCE (C2). Four pairs, each combining the SAME changed envelope
// id with one materialized-payload fault, asserting the EXISTING refusal wins with its
// exact contract. Placement is the subject: step 8b runs AFTER the existing step-8 checks,
// so a payload fault and an envelope fault together keep the payload's refusal.
//
// B2.1: the full §4 envelope contract is asserted for NEW envelope refusals. Here E-10
// asserts its own table's EXISTING contracts in full instead — `check: 'envelope'` must NOT
// appear in a mixed-fault case that has to preserve `identity` or `shape`.
//
// Two hard requirements (C2, B5.3). The payload fault is introduced AT MATERIALIZATION TIME
// ONLY: putting identity or a missing status into the original candidate would let step 5
// refuse first, which would make the row-31 placement mutation undetectable. And the
// in-memory candidate is shown to PASS phase 1 — by the paired control, which saves the
// very same input on the very same build — so each pair is genuinely about step-8 ordering.
// The materialization-hit counter is positive and nothing is armed during setup.

const E10_ID = 'SUBSTITUTED_ID';
const E10_IDENTITY = { version: 1, used: [], blocks: {}, edits: {} };
const E10_UNKNOWN_RULESET = 'f6-evidence@99';

const E10_PAIRS = [
  {
    pair: '(a)',
    fault: 'root identity introduced by the hook',
    payload: (trip) => ({ ...trip, identity: E10_IDENTITY }),
    check: 'identity',
    schema: 'door2-v8',
    field: 'identity',
    message: FROZEN.message
  },
  {
    pair: '(b)',
    fault: 'required `status` removed',
    payload: (trip) => ({ ...trip, status: undefined }),
    check: 'shape',
    schema: 'door2-v7',
    field: 'status',
    message: SHAPE_MESSAGE.status
  },
  {
    pair: '(c)',
    fault: 'evidence marker present, no valid evidence object',
    payload: (trip) => ({ ...trip, evidence: { marker: 'present but not a valid evidence object' } }),
    check: 'shape',
    schema: 'door2-v7',
    field: 'evidence',
    message: SHAPE_MESSAGE.evidence
  },
  {
    pair: '(d)',
    fault: 'well-structured evidence, unknown ruleset',
    payload: (trip) => ({
      ...trip,
      evidence: { rulesetVersion: E10_UNKNOWN_RULESET, generatedAt: '2026-10-20T12:00:00.000Z', entries: [] },
      versions: { ...trip.versions, connectionEvidence: E10_UNKNOWN_RULESET }
    }),
    check: 'shape',
    schema: 'door2-v7',
    field: 'evidence_version_unsupported',
    message: SHAPE_MESSAGE.evidence_version_unsupported
  }
];

for (const c of E10_PAIRS) {
  test(`E-10 ${c.pair}: the SAME changed envelope id combined with a materialized-payload fault (${c.fault}) keeps the EXISTING ${c.check} refusal with its exact contract — zero writes, bytes retained — and is not re-routed to the new envelope check`, () => {
    store.clear();
    const kept = control();
    const before = raw();
    const records = JSON.parse(before).length;
    const writesBefore = writes;

    const trip = { ...clone(PERU), history: [] };
    const tripWitness = descriptorWitness(trip);
    const protoBefore = prototypeWitness();

    // The fault exists ONLY in what the hook returns. Nothing is planted in the candidate.
    assert.deepStrictEqual(identityKeysIn(trip), [], 'the in-memory candidate carries no reserved key');
    assert.equal(typeof trip.status, 'string', 'and it has its required status in memory');

    let err = null;
    const { seen } = withInheritedEnvelopeHook('entry', (e) => ({ ...e, id: E10_ID, trip: c.payload(e.trip) }), () => {
      err = refuses(() => saveDraftTrip(trip, 'e10', 'e10'), c.check);
    });

    assert.deepStrictEqual(prototypeWitness(), protoBefore, 'Object.prototype is restored exactly');

    // The EXISTING contract, in full, against literals (E-10 / B2.1).
    assert.ok(err instanceof DraftNotStorableError);
    assert.equal(err.name, 'DraftNotStorableError');
    assert.equal(err.check, c.check, 'the EXISTING check wins');
    assert.notEqual(err.check, 'envelope', 'and it is NOT the new envelope check');
    assert.equal(err.schema, c.schema);
    assert.equal(err.field, c.field);
    assert.equal(err.message, c.message, 'with its existing message text, byte for byte');

    // The fault really reached materialization: a positive hit counter, not a getter armed
    // during setup, and the returned frame really carried the envelope alteration too.
    assert.ok(seen.targets > 0, `the hook must reach the envelope frame; targets=${seen.targets}`);
    assert.equal(seen.captured.scalars.id.value, E10_ID, 'the envelope fault is present as well as the payload fault');

    assert.equal(writes, writesBefore, 'ZERO writes — counted');
    assert.equal(raw(), before, 'the stored bytes are byte-identical');
    assert.equal(JSON.parse(raw()).length, records, 'the record count is unchanged');
    assert.deepEqual(listDraftTrips().map((d) => d.id), [kept], 'nothing was appended');
    assert.deepStrictEqual(descriptorWitness(trip), tripWitness, 'the input is unmutated');

    // The paired control, which is ALSO the phase-1 proof: this very input, on this very
    // build, saves once nothing alters the materialized record.
    const ok = saves({ ...clone(PERU), history: [] }, `e10 ${c.pair} control`);
    assert.equal(loadDraftTrip(ok.draftId).compatible, true, 'the control reopens — so phase 1 admitted this candidate');
  });
}

test('E-10 (the shared control): that SAME envelope alteration with a VALID payload reaches the NEW envelope refusal — which is what makes the four pairs above discriminating rather than merely green', () => {
  const real = recorder();
  const err = envelopeRefusal({
    field: 'id',
    label: 'e10 control',
    transform: (e) => (record(real, e), { ...e, id: E10_ID }),
    expectCapture: () => ({ ownKeys: ALL_KEYS, scalars: ownScalars(real, { id: { own: true, value: E10_ID } }) })
  });
  assert.equal(err.check, 'envelope', 'the same alteration, with nothing wrong in the payload, is the ENVELOPE refusal');
  assert.equal(err.field, 'id');
  assert.equal(err.message, ENVELOPE_MESSAGE.id);
  // It demonstrably uses the SAME envelope alteration as the four pairs (B5's condition for
  // one shared control being sufficient).
  assert.equal(E10_ID, 'SUBSTITUTED_ID', 'the same substituted id the four pairs use');
});
