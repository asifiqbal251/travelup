// Q8 packet 1b — the opt-in route, the fingerprint, undo and bounded-edit intent.
// Build brief draft 4 §5.3: T-O1, T-O2, T-A1, T-A2, T-F1-T-F3, T-U1-T-U4, T-E1, T-D1.
//
// THE STANDARD. Every test asserts the COMPLETE EFFECT with a paired control proving the
// same operation lands when it should. "It refused" is never on its own evidence that the
// intended digest ran, which is why T-O1 begins by asserting that its fixture's two
// fingerprints genuinely differ.
//
// The absolute bc58722 literals for every touched export live in the landed P1-D oracle
// (`identityDormancyOracle.test.js`), captured from the unchanged source before any edit
// in this packet. This file asserts what that oracle cannot: that the opt-in changes
// NOTHING BUT THE MAP, and that the identity work really happens when it is asked for.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as rs from '../../src/lib/door2/restructure.js';
import * as edit from '../../src/lib/door2/edit.js';
import * as id from '../../src/lib/door2/identity.js';
import { identityDigest, tripFingerprint } from '../../src/lib/door2/fingerprint.js';
import { loadDraftTrip, saveDraftTrip } from '../../src/lib/door2/draftStorage.js';
import {
  FAMILY_SPECS,
  PILOT_CONTENT,
  PILOT_DATA,
  PREVIEW_OPTIONS,
  buildFamily,
  buildFamilyWithIdentity,
  clone,
  countingTokens,
  livePlacement,
  map,
  TRANSITION_AT
} from './helpers/identityFixtures.js';

// A localStorage stand-in, the same shape flowDraftStorage's seeding pattern uses.
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => store.get(k) ?? null,
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k)
};
const STORAGE_KEY = 'door2_drafts_v1';

/**
 * The one-argument fingerprints recorded at bc58722, extracted mechanically from the
 * landed P1-D oracle's own FREE table rather than typed by hand. The oracle captured them
 * from the unchanged source; this file re-asserts them against the identity-BEARING form
 * of the same trips, which is the claim the oracle's free class cannot make.
 */
const BASE_FINGERPRINTS = {
  'nyc-single-base': 'c8bee609e888e',
  peru: 'bbaa1d8694043',
  'japan-tokyo-single-base': 'c39ab1c37eb83',
  'japan-multi-stop': 'ba5db53cf59ea',
  'eastern-canada-reversible': '1d0e8cffe949b'
};

// D-A §6.2's supplied time travels with the opt-in, because a COMMITTING lifecycle
// transition requires one (R5) and several routes below displace a window. It is a fixed
// value, so every run is identical; the default bags deliberately carry none.
const OPT_IN = Object.freeze({ ...PREVIEW_OPTIONS, identity: true, data: PILOT_DATA, at: TRANSITION_AT });

/** The opt-in preview options with a counting token source wired in. */
const optInWith = (tokens, data = PILOT_DATA) => ({ ...PREVIEW_OPTIONS, identity: true, data, tokens, at: TRANSITION_AT });

/**
 * An identity-bearing door2-v7 record the reader admits, built the way the landed oracle
 * builds one: a real envelope `saveDraftTrip` itself produced, with the map injected into
 * the stored payload — because the writer refuses identity-bearing input by design
 * (`draftStorage.js:137`, Rule B) — then read back through the REAL reader.
 */
function admittedIdentityBearing(trip, identity) {
  store.clear();
  const draftId = saveDraftTrip({ ...trip, history: [] }, 'optin', 'optin');
  const raw = JSON.parse(store.get(STORAGE_KEY));
  raw[0].trip = { ...raw[0].trip, identity: clone(identity) };
  store.set(STORAGE_KEY, JSON.stringify(raw));
  const loaded = loadDraftTrip(draftId);
  assert.equal(loaded.compatible, true, 'the reader must still admit this record');
  assert.equal(loaded.readOnly ?? null, null, 'and must not lock it');
  assert.ok(loaded.trip.identity, 'and must not strip its map');
  return loaded.trip;
}

/** The same stored record read back WITHOUT any map: the identity-free control class. */
function admittedLegacy(trip) {
  store.clear();
  const draftId = saveDraftTrip({ ...trip, history: [] }, 'optin', 'optin');
  const loaded = loadDraftTrip(draftId);
  assert.equal(loaded.compatible, true);
  return loaded.trip;
}

/** A complete, valid map for a real producer trip, with reproducible tokens. */
function seededMap(trip, prefix = 's') {
  const seeded = id.initialiseIdentityForBuild(trip, { data: PILOT_DATA, tokens: countingTokens(prefix).env });
  assert.equal(seeded.ok, true, seeded.reason);
  return seeded.identity;
}

const withoutIdentity = (value) => {
  const copy = clone(value);
  const strip = (node) => {
    if (node && typeof node === 'object') {
      if (!Array.isArray(node)) delete node.identity;
      for (const v of Object.values(node)) strip(v);
    }
  };
  strip(copy);
  return copy;
};

// ---------------------------------------------------------------------------
// T-F1, T-F2, T-F3 — the fingerprint.

test('T-F1: the one-argument fingerprint is byte-identical to the bc58722 literal for every family, AND unchanged by the presence of a map (mutation 11)', () => {
  for (const family of Object.keys(FAMILY_SPECS)) {
    const trip = buildFamily(family);
    assert.ok(trip, `${family} must build`);
    assert.equal(tripFingerprint(trip), BASE_FINGERPRINTS[family], `${family}: the one-argument fingerprint moved`);
    // The same trip carrying a complete map: still byte-identical with one argument.
    const bearing = { ...trip, identity: seededMap(trip) };
    assert.equal(tripFingerprint(bearing), BASE_FINGERPRINTS[family], `${family}: a map changed the one-argument fingerprint`);
    assert.equal(tripFingerprint(bearing, null), BASE_FINGERPRINTS[family], `${family}: an explicit null is not the default`);
    assert.equal(tripFingerprint(bearing, false), BASE_FINGERPRINTS[family], `${family}: a falsy opt-in is not an opt-in`);
    // And the opt-in really does change it, so the test above is not vacuous.
    assert.notEqual(tripFingerprint(bearing, true), BASE_FINGERPRINTS[family], `${family}: the opt-in digest is inert`);
  }
});

test('T-F1 (admitted legacy): an identity-bearing v7 record read through the real reader keeps its bc58722 fingerprint', () => {
  const trip = buildFamily('peru');
  const bearing = admittedIdentityBearing(trip, map({
    used: ['luid-old', 'luid-later'],
    blocks: { 'luid-old': livePlacement(trip.routePlan.stops[0].key, 0, 1, 'full') },
    edits: { 'luid-old': { intent: 'pin', contentId: null, locked: true, userEdited: true, provenance: 'seed' } }
  }));
  assert.equal(tripFingerprint(bearing), BASE_FINGERPRINTS.peru);
  assert.notEqual(tripFingerprint(bearing, true), BASE_FINGERPRINTS.peru, 'the opt-in sees the map');
});

test('T-F2: under the opt-in an identity-only change invalidates an open preview, and the same change is invisible without it', () => {
  const trip = buildFamilyWithIdentity('peru');
  const stopKey = trip.routePlan.stops[0].key;
  const preview = rs.previewAdjustNights(trip, stopKey, 1, OPT_IN);
  assert.equal(preview.ok, true, `${preview.why ?? ''}`);
  const proposal = preview.proposals[0];

  // An identity-ONLY change: one placement dismissed. Nothing in spec, routePlan or days.
  const firstLuid = Object.keys(trip.identity.blocks)[0];
  const changed = {
    ...trip,
    identity: { ...trip.identity, blocks: { ...trip.identity.blocks, [firstLuid]: { ...trip.identity.blocks[firstLuid], state: 'dismissed' } } }
  };
  assert.deepStrictEqual(withoutIdentity(changed), withoutIdentity(trip), 'the change really is confined to trip.identity');
  assert.equal(tripFingerprint(changed), tripFingerprint(trip), 'the existing guard cannot see it — which is why the addition exists');
  assert.notEqual(tripFingerprint(changed, true), tripFingerprint(trip, true), 'the opt-in digest does see it');

  const refused = rs.applyProposal(changed, proposal);
  assert.equal(refused.ok, false);
  assert.equal(refused.reason, 'stale_preview');

  // PAIRED CONTROL: the unchanged trip applies through the same proposal.
  const landed = rs.applyProposal(trip, proposal);
  assert.equal(landed.ok, true, `${landed.reason ?? ''} ${JSON.stringify(landed.detail ?? {})}`);

  // And the existing, non-identity staleness still fires exactly as before.
  const structural = { ...trip, spec: { ...trip.spec, totalDays: trip.spec.totalDays + 3 } };
  assert.equal(rs.applyProposal(structural, proposal).reason, 'stale_preview');
});

test('T-F3: used is excluded from the identity digest (mutation 10)', () => {
  const trip = buildFamilyWithIdentity('peru');
  const extraUsed = { ...trip, identity: { ...trip.identity, used: [...trip.identity.used, 'a_token_from_elsewhere'] } };
  assert.equal(tripFingerprint(extraUsed, true), tripFingerprint(trip, true), 'a used-only change must not invalidate a preview');
  assert.equal(identityDigest(extraUsed.identity), identityDigest(trip.identity));

  // PAIRED CONTROL: any other field of the map does change the digest.
  const editsChanged = {
    ...trip,
    identity: { ...trip.identity, edits: { ...trip.identity.edits, [trip.identity.used[0]]: { intent: 'pin', contentId: 'x', locked: true, userEdited: true, provenance: 'p' } } }
  };
  assert.notEqual(tripFingerprint(editsChanged, true), tripFingerprint(trip, true));
  const versionChanged = { ...trip, identity: { ...trip.identity, version: 2 } };
  assert.notEqual(tripFingerprint(versionChanged, true), tripFingerprint(trip, true));

  // And a preview built on the trip still applies after a used-only change, which is the
  // behavioural point of the exclusion.
  const preview = rs.previewAdjustNights(trip, trip.routePlan.stops[0].key, 1, OPT_IN);
  assert.equal(preview.ok, true);
  const applied = rs.applyProposal(extraUsed, preview.proposals[0]);
  assert.equal(applied.ok, true, `${applied.reason ?? ''}`);
  assert.ok(applied.trip.identity.used.includes('a_token_from_elsewhere'), 'and the foreign token is carried forward, never dropped');
});

// ---------------------------------------------------------------------------
// T-O1 — the real public-preview route, end to end.

test('T-O1 fixture requirement (C1): the fixture default and identity-inclusive fingerprints genuinely differ, so no case below can be vacuous', () => {
  const trip = buildFamilyWithIdentity('peru');
  const plain = tripFingerprint(trip);
  const inclusive = tripFingerprint(trip, true);
  assert.notEqual(plain, inclusive, 'the two digests must differ or every T-O1 case is vacuous');
  assert.equal(plain, BASE_FINGERPRINTS.peru, 'and the default one is still the bc58722 literal');
});

test('T-O1(a): through the real preview export, with the opt-in and an UNCHANGED trip, apply SUCCEEDS — mutation 24 and 25 detector', () => {
  const trip = buildFamilyWithIdentity('peru');
  const preview = rs.previewAdjustNights(trip, trip.routePlan.stops[0].key, 1, OPT_IN);
  assert.equal(preview.ok, true, `${preview.why ?? ''}`);
  const proposal = preview.proposals[0];

  // The mode is recorded on the proposal, and the capture really used it.
  assert.equal(proposal.identityMode, true);
  assert.equal(proposal.baseFingerprint, tripFingerprint(trip, true), 'captured in the opt-in mode');
  assert.notEqual(proposal.baseFingerprint, tripFingerprint(trip), 'and NOT in the default mode');

  const applied = rs.applyProposal(trip, proposal);
  assert.equal(applied.ok, true, `a valid proposal must not be refused stale: ${applied.reason ?? ''}`);
  // The complete effect: a valid, complete map on the committed trip.
  assert.deepStrictEqual(id.validateIdentity(applied.trip, applied.trip.identity, { data: PILOT_DATA }), { ok: true });
  assert.equal(JSON.stringify(applied.trip.identity).includes('#new'), false);
  for (const luid of Object.keys(trip.identity.blocks)) {
    assert.ok(luid in applied.trip.identity.blocks, `${luid} survived the apply`);
  }
  assert.ok(trip.identity.used.every((t) => applied.trip.identity.used.includes(t)), 'used is monotonic');
});

test('T-O1(b): with the opt-in, an identity-only change covered by the digest refuses stale BEFORE any token-source call — the both-omit detector', () => {
  const trip = buildFamilyWithIdentity('peru');
  const tokens = countingTokens('n');
  const preview = rs.previewAdjustNights(trip, trip.routePlan.stops[0].key, 1, optInWith(tokens.env));
  assert.equal(preview.ok, true, `${preview.why ?? ''}`);
  const proposal = preview.proposals[0];
  assert.equal(tokens.calls, 0, 'a preview mints nothing');

  const firstLuid = Object.keys(trip.identity.blocks)[0];
  const changed = {
    ...trip,
    identity: { ...trip.identity, blocks: { ...trip.identity.blocks, [firstLuid]: { ...trip.identity.blocks[firstLuid], state: 'dismissed' } } }
  };
  const snapshot = clone(changed);
  const refused = rs.applyProposal(changed, proposal);
  assert.equal(refused.ok, false);
  assert.equal(refused.reason, 'stale_preview');
  assert.equal(tokens.calls, 0, 'zero token-source calls on a stale refusal');
  assert.deepStrictEqual(changed, snapshot);

  // A stale refusal alone would prove nothing, so the paired control is explicit: the
  // SAME proposal against the unchanged trip applies and really does reach phase 2.
  const landed = rs.applyProposal(trip, proposal);
  assert.equal(landed.ok, true, `${landed.reason ?? ''}`);
  assert.ok(tokens.calls > 0, 'the control proves the digest path reaches issuance');
});

test('T-O1(c): WITHOUT the opt-in, the same public path on an admitted identity-bearing v7 record is deep-equal to the same record without its map', () => {
  const built = buildFamily('peru');
  const identity = map({
    used: ['luid-old', 'luid-later'],
    blocks: { 'luid-old': livePlacement(built.routePlan.stops[0].key, 0, 1, 'full') },
    edits: { 'luid-old': { intent: 'pin', contentId: null, locked: true, userEdited: true, provenance: 'seed' } }
  });
  const bearing = admittedIdentityBearing(built, identity);
  // The control is the SAME stored record read back without the injected map, so the only
  // difference between the two inputs is identity itself — not the writer's own stamp.
  const trip = admittedLegacy(built);
  const stopKey = bearing.routePlan.stops[0].key;
  assert.deepStrictEqual(withoutIdentity(bearing), trip, 'the two inputs differ only by the map');

  // The reader gives back the same trip plus a map, so the preview must give back the same
  // proposals plus nothing at all.
  const free = rs.previewAdjustNights(trip, stopKey, 1, PREVIEW_OPTIONS);
  const admitted = rs.previewAdjustNights(bearing, stopKey, 1, PREVIEW_OPTIONS);
  assert.equal(admitted.ok, true);
  assert.deepStrictEqual(withoutIdentity(admitted), withoutIdentity(free), 'the default preview is blind to the map');
  for (const proposal of admitted.proposals) {
    assert.equal('identityMode' in proposal, false, 'no identityMode key on the default route');
    assert.equal('identityData' in proposal, false);
    assert.equal('identityAllocation' in proposal, false);
  }

  const applied = rs.applyProposal(bearing, admitted.proposals[0]);
  assert.equal(applied.ok, true, `${applied.reason ?? ''}`);
  const appliedFree = rs.applyProposal(trip, free.proposals[0]);
  assert.equal(appliedFree.ok, true);
  assert.deepStrictEqual(withoutIdentity(applied), withoutIdentity(appliedFree), 'the committed trip is the same but for the map');
  // The map rode through on the default path exactly as it does at base: untouched.
  assert.deepStrictEqual(applied.trip.identity, undefined, 'the proposal trip carried no map, so the committed trip has none — exactly as at base');
});

test('T-O1(d): synthetic/custom data is honoured across the whole route, never defaulted to PILOT_DATA (mutation 22)', () => {
  const trip = buildFamilyWithIdentity('peru');
  const stopKey = trip.routePlan.stops[0].key;

  // A data object that is PILOT_DATA with the Machu Picchu excursion given a MENU entry
  // for its place, so a lookup that honoured the caller resolves an id where the pilot
  // lookup resolves none.
  const custom = clone(PILOT_DATA);
  const pkg = custom.routePackages.concat(custom.allRoutePackages ?? []).filter((p) => p.id === trip.routePlan.variantId);
  assert.ok(pkg.length > 0, 'the variant must be in the custom data');
  for (const p of pkg) {
    const stop = p.stops.find((s) => s.id === 'pc_aguas');
    if (stop) stop.excursionMenu = [{ id: 'custom_mp', placeId: 'machu_picchu', connectionId: 'c', hoursOnSite: 6, status: 'approved' }];
  }

  const pilotTargets = id.qualifyingTargets(trip, { data: PILOT_DATA });
  const customTargets = id.qualifyingTargets(trip, { data: custom });
  assert.equal(pilotTargets.targets.find((t) => t.kind === 'excursion').excursionId, null, 'with pilot data it is unresolved');
  assert.equal(customTargets.targets.find((t) => t.kind === 'excursion').excursionId, 'custom_mp', 'with the caller data it resolves');

  // And the whole public route honours it: the committed map records the resolved id.
  const preview = rs.previewAdjustNights(trip, stopKey, 1, { ...PREVIEW_OPTIONS, identity: true, data: custom, at: TRANSITION_AT });
  assert.equal(preview.ok, true, `${preview.why ?? ''}`);
  assert.equal(preview.proposals[0].identityData, custom, 'the proposal carries the caller data, not a default');
  const applied = rs.applyProposal(trip, preview.proposals[0]);
  assert.equal(applied.ok, true, `${applied.reason ?? ''} ${JSON.stringify(applied.detail ?? {})}`);
  const excursionPlacement = Object.values(applied.trip.identity.blocks).find((p) => p.kind === 'excursion');
  assert.equal(excursionPlacement.excursionId, 'custom_mp', 'a lookup defaulting to PILOT_DATA would record null here');
});

// ---------------------------------------------------------------------------
// T-O2 — capture and comparison cannot diverge.

/**
 * The two proposals T-O2 compares: one captured in each mode, from the SAME unchanged
 * trip. That the two captures differ is the whole hazard — if apply re-derived the mode
 * itself, one of the two would be refused as stale.
 */
function bothModeProposals() {
  const trip = buildFamilyWithIdentity('peru');
  const stopKey = trip.routePlan.stops[0].key;
  const optedIn = rs.previewAdjustNights(trip, stopKey, 1, OPT_IN);
  const defaulted = rs.previewAdjustNights(trip, stopKey, 1, PREVIEW_OPTIONS);
  assert.equal(optedIn.ok, true, `${optedIn.why ?? ''}`);
  assert.equal(defaulted.ok, true, `${defaulted.why ?? ''}`);
  assert.notEqual(optedIn.proposals[0].baseFingerprint, defaulted.proposals[0].baseFingerprint, 'the two captures must differ or T-O2 is vacuous');
  assert.equal(optedIn.proposals[0].baseFingerprint, tripFingerprint(trip, true));
  assert.equal(defaulted.proposals[0].baseFingerprint, tripFingerprint(trip));
  return { trip, optedIn: optedIn.proposals[0], defaulted: defaulted.proposals[0] };
}

test('T-O2 (OPTED-IN CASE): a proposal built with the opt-in applies against the UNCHANGED trip rather than being refused stale (mutations 24, 25)', () => {
  const { trip, optedIn } = bothModeProposals();
  const applied = rs.applyProposal(trip, optedIn);
  assert.equal(applied.ok, true, `the opted-in proposal must apply: ${applied.reason ?? ''}`);
  assert.ok(applied.trip.identity, 'and the opted-in apply installed a map');
  assert.deepStrictEqual(id.validateIdentity(applied.trip, applied.trip.identity, { data: PILOT_DATA }), { ok: true });
});

test('T-O2 (DEFAULT-MODE CASE): a proposal built without the opt-in compares exactly as today and applies', () => {
  const { trip, defaulted } = bothModeProposals();
  const applied = rs.applyProposal(trip, defaulted);
  assert.equal(applied.ok, true, `the default proposal must apply: ${applied.reason ?? ''}`);
  assert.equal(applied.trip.identity, undefined, 'and the default apply installed no map');
});

test('T-O2: the two modes select identity work ONLY — the committed trips agree on everything else', () => {
  const { trip, optedIn, defaulted } = bothModeProposals();
  const a = rs.applyProposal(trip, optedIn);
  const b = rs.applyProposal(trip, defaulted);
  assert.equal(a.ok, true);
  assert.equal(b.ok, true);
  assert.deepStrictEqual(withoutIdentity(a), withoutIdentity(b));

  // A proposal whose recorded mode is removed compares as today — and is then stale,
  // because its captured digest was the identity-inclusive one. That asymmetry is exactly
  // what recording the mode ON THE PROPOSAL prevents.
  const modeStripped = { ...optedIn };
  delete modeStripped.identityMode;
  assert.equal(rs.applyProposal(trip, modeStripped).reason, 'stale_preview');
});

// ---------------------------------------------------------------------------
// T-A1, T-A2 — the token contract at the guards.

test('T-A1: zero token-source calls on a stale refusal', () => {
  const trip = buildFamilyWithIdentity('peru');
  const tokens = countingTokens('n');
  const preview = rs.previewAdjustNights(trip, trip.routePlan.stops[0].key, 1, optInWith(tokens.env));
  assert.equal(preview.ok, true);
  const proposal = preview.proposals[0];

  const moved = { ...trip, spec: { ...trip.spec, totalDays: trip.spec.totalDays + 2 } };
  const refused = rs.applyProposal(moved, proposal);
  assert.equal(refused.ok, false);
  assert.equal(refused.reason, 'stale_preview');
  assert.equal(tokens.calls, 0);

  // PAIRED CONTROL: the same proposal on the unchanged trip reaches issuance.
  assert.equal(rs.applyProposal(trip, proposal).ok, true);
  assert.ok(tokens.calls > 0, 'the control proves tokens are reachable at all');
});

test('T-A2: zero token-source calls on an evidence refusal, at BOTH the trip and the proposal.trip guard', () => {
  const trip = buildFamilyWithIdentity('peru');
  const tokens = countingTokens('n');
  const preview = rs.previewAdjustNights(trip, trip.routePlan.stops[0].key, 1, optInWith(tokens.env));
  assert.equal(preview.ok, true);
  const proposal = preview.proposals[0];
  // The pilot families carry no `evidence` with this context, so the guard is made
  // reachable the only honest way: by handing it a trip whose evidence really is invalid.
  // `hasEvidence` is true as soon as the key exists (`connectionEvidence.js:11`).
  assert.equal(trip.evidence, undefined, 'the fixture itself is legacy, which the guard passes');

  // The `trip` guard.
  const brokenTrip = { ...trip, evidence: { ...trip.evidence, entries: 'not-an-array' } };
  const first = rs.applyProposal(brokenTrip, proposal);
  assert.equal(first.ok, false);
  assert.equal(first.reason, 'evidence_invalid');
  assert.equal(tokens.calls, 0);

  // The `proposal.trip` guard, with a sound current trip.
  const brokenProposal = { ...proposal, trip: { ...proposal.trip, evidence: { ...proposal.trip.evidence, entries: 'not-an-array' } } };
  const second = rs.applyProposal(trip, brokenProposal);
  assert.equal(second.ok, false);
  assert.equal(second.reason, 'evidence_invalid');
  assert.equal(tokens.calls, 0, 'still zero after both guards');

  // PAIRED CONTROL: with both sound, the apply lands and tokens are generated.
  assert.equal(rs.applyProposal(trip, proposal).ok, true);
  assert.ok(tokens.calls > 0);
});

// ---------------------------------------------------------------------------
// T-U1-T-U4 — undo.

test('T-U4(a): with identity null, current used [old, later] and prior [old] returns [old] — THE BASE RESULT, not the union (mutation 9)', () => {
  const trip = buildFamily('peru');
  const prior = { ...trip, identity: map({ used: ['old'], blocks: {}, edits: {} }), history: [] };
  const current = admittedIdentityBearing(trip, map({ used: ['old', 'later'], blocks: {}, edits: {} }));
  const stacked = { ...current, history: [prior] };

  const base = edit.undo(stacked);
  assert.equal(base.ok, true);
  assert.deepStrictEqual(base.trip.identity.used, ['old'], 'the default path restores the snapshot as-is');
  assert.deepStrictEqual(base.trip.identity, prior.identity, 'the whole restored map is the snapshot verbatim');

  // PAIRED OPT-IN CONTROL: the union.
  const optedIn = edit.undo(stacked, { data: PILOT_DATA });
  assert.equal(optedIn.ok, true);
  assert.deepStrictEqual(optedIn.trip.identity.used, ['old', 'later'], 'the opt-in unions');
});

test('T-U4(b): with identity null, a current trip with a map and a snapshot without one SUCCEEDS, as at base — not refused (mutation 9b)', () => {
  const trip = buildFamily('peru');
  const snapshotWithoutMap = { ...clone(trip), history: [] };
  delete snapshotWithoutMap.identity;
  const current = admittedIdentityBearing(trip, map({ used: ['only-here'], blocks: {}, edits: {} }));
  const stacked = { ...current, history: [snapshotWithoutMap] };

  const base = edit.undo(stacked);
  assert.equal(base.ok, true, 'the default path must not refuse mixed history');
  assert.equal(base.trip.identity, undefined, 'and restores the snapshot, which had no map');
  assert.deepStrictEqual(base.trip, { ...snapshotWithoutMap, history: [] });

  // PAIRED OPT-IN CONTROL: the named refusal.
  const refused = edit.undo(stacked, { data: PILOT_DATA });
  assert.equal(refused.ok, false);
  assert.equal(refused.reason, 'mixed_history');
  assert.deepStrictEqual(refused.detail, { snapshot: false, current: true });

  // And the mirror case — a snapshot with a map, a current trip without — also refuses.
  const mirrored = { ...snapshotWithoutMap, history: [{ ...clone(trip), identity: map({ used: ['x'], blocks: {}, edits: {} }), history: [] }] };
  const mirrorRefused = edit.undo(mirrored, { data: PILOT_DATA });
  assert.equal(mirrorRefused.ok, false);
  assert.equal(mirrorRefused.reason, 'mixed_history');
  assert.equal(edit.undo(mirrored).ok, true, 'and its default path still succeeds');
});

test('T-U1: under the opt-in, used unions while blocks and edits rewind with the snapshot', () => {
  const trip = buildFamilyWithIdentity('peru');
  const act = trip.days.flatMap((d) => d.blocks).find((b) => b.type === 'activity');
  const swapped = edit.swapActivity(trip, act.id, null, PILOT_CONTENT, { data: PILOT_DATA });
  assert.equal(swapped.ok, true, `${swapped.reason ?? ''}`);
  assert.notDeepStrictEqual(swapped.trip.identity.edits, trip.identity.edits, 'the swap really recorded intent');

  // A token issued after the snapshot, as an apply would leave it.
  const grown = { ...swapped.trip, identity: { ...swapped.trip.identity, used: [...swapped.trip.identity.used, 'issued_later'] } };
  const undone = edit.undo(grown, { data: PILOT_DATA });
  assert.equal(undone.ok, true);
  assert.deepStrictEqual(undone.identity, undefined);
  assert.deepStrictEqual(undone.trip.identity.blocks, trip.identity.blocks, 'blocks rewound');
  assert.deepStrictEqual(undone.trip.identity.edits, trip.identity.edits, 'edits rewound');
  assert.deepStrictEqual(undone.trip.identity.used, [...trip.identity.used, 'issued_later'], 'used did not');
});

test('T-U2: a token issued after the snapshot is not reissuable after an undo', () => {
  const trip = buildFamilyWithIdentity('peru');
  const stopKey = trip.routePlan.stops[0].key;
  const tokens = countingTokens('t');
  const preview = rs.previewAdjustNights(trip, stopKey, 1, optInWith(tokens.env));
  const applied = rs.applyProposal(trip, preview.proposals[0]);
  assert.equal(applied.ok, true, `${applied.reason ?? ''}`);
  const issued = applied.trip.identity.used.filter((t) => !trip.identity.used.includes(t));
  assert.ok(issued.length > 0, 'the apply really issued something');

  const undone = edit.undo(applied.trip, { data: PILOT_DATA });
  assert.equal(undone.ok, true);
  for (const token of issued) {
    assert.ok(undone.trip.identity.used.includes(token), `${token} survives the undo so it can never be reissued`);
    assert.equal(token in undone.trip.identity.blocks, false, `${token}'s placement rewound with the snapshot`);
  }

  // A constant source fixed on an already-issued token cannot reuse it: it reminds or refuses.
  const reissue = id.commitIdentity({
    currentTrip: undone.trip,
    nextTrip: preview.proposals[0].trip,
    data: PILOT_DATA,
    tokens: { crypto: { randomUUID: () => issued[0] } },
    at: TRANSITION_AT
  });
  assert.equal(reissue.ok, false);
  assert.equal(reissue.reason, 'token_exhausted');
});

test('T-U3(a): the writer still refuses an identity-bearing save by name, with the stored bytes unchanged', () => {
  const trip = buildFamilyWithIdentity('peru');
  store.clear();
  const soundId = saveDraftTrip({ ...buildFamily('peru'), history: [] }, 'control', 'control');
  assert.ok(soundId, 'a control save really works');
  const bytes = store.get(STORAGE_KEY);

  let thrown = null;
  try {
    saveDraftTrip({ ...trip, history: [] }, 'bearing', 'bearing');
  } catch (err) {
    thrown = err;
  }
  assert.ok(thrown, 'an identity-bearing save must be refused');
  assert.equal(thrown.check, 'identity', `refused by name, got ${thrown.check}`);
  assert.equal(store.get(STORAGE_KEY), bytes, 'the stored bytes are unchanged');
  // THIS CLAIMS NO SUCCESSFUL LIVE SAVE of identity: Rule B holds, by design.
});

test('T-U3(b): seeded identity data, used included, survives serialise-and-read through the real reader', () => {
  const trip = buildFamily('peru');
  const seeded = map({
    used: ['luid-old', 'luid-later'],
    blocks: {
      'luid-old': livePlacement(trip.routePlan.stops[0].key, 0, 1, 'full'),
      'luid-later': { ...livePlacement(trip.routePlan.stops[0].key, 1, 1, 'full'), state: 'displaced' }
    },
    edits: { 'luid-old': { intent: 'pin', contentId: 'c', locked: true, userEdited: true, provenance: 'seed' } }
  });
  const loaded = admittedIdentityBearing(trip, seeded);
  assert.deepStrictEqual(loaded.identity, seeded, 'the whole map round-tripped, used included');
});

// ---------------------------------------------------------------------------
// T-E1 — bounded-edit intent, per export across all seven of §2.1.

/** Resolve the luid of a block through the engine's own lookup. */
const luidOf = (trip, block) => {
  const found = id.placementForBlock(trip, block);
  assert.equal(found.ok, true, `${block.id}: ${found.reason ?? ''}`);
  return found.luid;
};

/**
 * One shared fixture for every T-E1 row. `japan-multi-stop` is the family because
 * `makeDayLighter` genuinely CHANGES something on it and `swappableDays` offers a real
 * pair, so no row below can pass by doing nothing. (On Peru, `makeDayLighter` changes no
 * day at all — probed across all five families, not assumed.)
 */
function editFixture() {
  const base = buildFamilyWithIdentity('japan-multi-stop');
  const activity = base.days.flatMap((d) => d.blocks).find((b) => b.type === 'activity' && b.id.startsWith('op:'));
  assert.ok(activity, 'the fixture must hold a real op: activity block');
  return { base, activity };
}

/**
 * The assertions every T-E1 row shares, so each row states only what is its own.
 *
 * - the opt-in changes NOTHING BUT THE MAP (the paired control);
 * - the default path leaves the map exactly as it found it;
 * - `blocks` is never written by intent, and no token is issued;
 * - every intent entry is COMPLETE and keyed on a real live placement.
 */
function assertIntentRow({ base, name, intent, run, expectLuids, expectLocked }) {
  const defaulted = run(base, null);
  const optedIn = run(base, { data: PILOT_DATA });
  assert.equal(defaulted.ok, true, `${name} default: ${defaulted.reason ?? ''}`);
  assert.equal(optedIn.ok, true, `${name} opt-in: ${optedIn.reason ?? ''} ${JSON.stringify(optedIn.detail ?? {})}`);

  assert.deepStrictEqual(withoutIdentity(optedIn), withoutIdentity(defaulted), `${name}: the opt-in changed the trip itself`);
  assert.deepStrictEqual(defaulted.trip.identity, base.identity, `${name}: the default path left the map exactly as it found it`);
  assert.deepStrictEqual(optedIn.trip.identity.blocks, base.identity.blocks, `${name}: blocks must be untouched by intent`);
  assert.deepStrictEqual(optedIn.trip.identity.used, base.identity.used, `${name}: a bounded edit issues no token`);

  const written = Object.entries(optedIn.trip.identity.edits).filter(([, e]) => e.provenance === name);
  assert.ok(written.length > 0, `${name}: no intent was recorded`);
  for (const [luid, entry] of written) {
    assert.deepStrictEqual(Object.keys(entry).sort(), ['contentId', 'intent', 'locked', 'provenance', 'userEdited'], `${name}: incomplete entry`);
    assert.equal(entry.intent, intent, `${name}: intent`);
    assert.ok(luid in base.identity.blocks, `${name}: ${luid} is a real placement`);
    assert.equal(base.identity.blocks[luid].state, 'live', `${name}: ${luid} is live`);
  }
  if (expectLuids) {
    assert.deepStrictEqual(written.map(([luid]) => luid), expectLuids, `${name}: the wrong placements were written`);
  }
  if (expectLocked !== undefined) {
    assert.equal(written[0][1].locked, expectLocked, `${name}: locked`);
  }
  return { defaulted, optedIn, written };
}

test('T-E1 (swapActivity): edits[luid].contentId follows the new content and blocks[luid] is UNTOUCHED (mutation 23)', () => {
  const { base, activity } = editFixture();
  const { optedIn, written } = assertIntentRow({
    base,
    name: 'swapActivity',
    intent: 'swap',
    run: (trip, identity) => edit.swapActivity(trip, activity.id, null, PILOT_CONTENT, identity),
    expectLuids: [luidOf(base, activity)]
  });
  // The recorded content really is the NEW content, not the old.
  const swappedBlock = optedIn.trip.days.flatMap((d) => d.blocks).find((b) => b.id === activity.id);
  assert.equal(written[0][1].contentId, swappedBlock.anchor.contentId);
  assert.notEqual(written[0][1].contentId, activity.anchor.contentId, 'the swap really changed the content');
});

test('T-E1 (pinActivity): a COMPLETE intent entry is constructed where the placement had none, with locked true', () => {
  const { base, activity } = editFixture();
  const luid = luidOf(base, activity);
  assert.equal(base.identity.edits[luid], undefined, 'the placement really had no entry before, so construction is exercised');
  assertIntentRow({
    base,
    name: 'pinActivity',
    intent: 'pin',
    run: (trip, identity) => edit.pinActivity(trip, activity.id, identity),
    expectLuids: [luid],
    expectLocked: true
  });
});

test('T-E1 (unpinActivity): a complete entry is constructed either way, with locked false', () => {
  const { base, activity } = editFixture();
  const pinned = edit.pinActivity(base, activity.id, { data: PILOT_DATA });
  assert.equal(pinned.ok, true, `${pinned.reason ?? ''}`);
  const defaulted = edit.unpinActivity(pinned.trip, activity.id, null);
  const optedIn = edit.unpinActivity(pinned.trip, activity.id, { data: PILOT_DATA });
  assert.equal(optedIn.ok, true, `${optedIn.reason ?? ''}`);
  assert.deepStrictEqual(withoutIdentity(optedIn), withoutIdentity(defaulted));
  assert.deepStrictEqual(defaulted.trip.identity, pinned.trip.identity, 'the default unpin left the map alone');
  const luid = luidOf(base, activity);
  assert.deepStrictEqual(optedIn.trip.identity.edits[luid], {
    intent: 'unpin', contentId: activity.anchor.contentId, locked: false, userEdited: activity.userEdited === true, provenance: 'unpinActivity'
  });
  assert.deepStrictEqual(optedIn.trip.identity.blocks, base.identity.blocks, 'blocks untouched');
});

test('T-E1 (makeDayLighter): intent is recorded per block CHANGED, and the day really does change', () => {
  const { base } = editFixture();
  const dayNumber = lighterDay(base);
  const { written } = assertIntentRow({
    base,
    name: 'makeDayLighter',
    intent: 'make_day_lighter',
    run: (trip, identity) => edit.makeDayLighter(trip, dayNumber, PILOT_CONTENT, identity)
  });
  // Exactly the changed blocks, no more: locked and already-best blocks keep their own.
  const after = edit.makeDayLighter(base, dayNumber, PILOT_CONTENT).trip.days.find((d) => d.dayNumber === dayNumber).blocks;
  const before = base.days.find((d) => d.dayNumber === dayNumber).blocks;
  const changedIds = after.filter((b, i) => JSON.stringify(b) !== JSON.stringify(before[i])).map((b) => b.id);
  assert.ok(changedIds.length > 0, 'the day really changed, so this row is not vacuous');
  assert.deepStrictEqual(
    written.map(([luid]) => luid).sort(),
    changedIds.map((blockId) => luidOf(base, before.find((b) => b.id === blockId))).sort()
  );
});

test('T-E1 (swapDays): the edits follow the moved content while each placement keeps its OWN address', () => {
  const { base } = editFixture();
  const [dayA, dayB] = swappablePair(base);
  const { optedIn, written } = assertIntentRow({
    base,
    name: 'swapDays',
    intent: 'swap_days',
    run: (trip, identity) => edit.swapDays(trip, dayA, dayB, PILOT_CONTENT, identity)
  });
  // Each written entry's content is what MOVED onto that window, not what left it.
  const resultBlocks = optedIn.trip.days.flatMap((d) => d.blocks);
  for (const [luid, entry] of written) {
    const placement = base.identity.blocks[luid];
    const block = resultBlocks.find((b) => id.identityTargetFor(b)?.key === id.placementKey(placement));
    assert.ok(block, `${luid}: its window is still in the trip`);
    assert.equal(entry.contentId, block.anchor.contentId ?? null, `${luid}: the intent follows the content that moved in`);
  }
  // And the placements themselves kept their addresses — a window does not travel.
  assert.deepStrictEqual(optedIn.trip.identity.blocks, base.identity.blocks);
});

/** The narrowed shelf that forces rejectActivity's no-alternative branch. */
function rejectFixture() {
  const { base, activity } = editFixture();
  const onlyCurrent = PILOT_CONTENT.filter((item) => item.id === activity.anchor.contentId);
  assert.equal(onlyCurrent.length, 1, 'the narrowed shelf holds exactly the current item');
  return { base, activity, luid: luidOf(base, activity), onlyCurrent };
}

test('T-E1 (rejectActivity, REPLACEMENT ROW): where an alternative is eligible, edits[luid].contentId is the replacement and userEdited is true', () => {
  const { base, activity, luid } = rejectFixture();
  const replaced = edit.rejectActivity(base, activity.id, PILOT_CONTENT, { data: PILOT_DATA });
  assert.equal(replaced.ok, true, `${replaced.reason ?? ''}`);
  const replacedBlock = replaced.trip.days.flatMap((d) => d.blocks).find((b) => b.id === activity.id);
  assert.equal(replacedBlock.type, 'activity', 'an alternative really was found, so this row is not the gap row');
  assert.notEqual(replacedBlock.anchor.contentId, activity.anchor.contentId);
  assert.deepStrictEqual(replaced.trip.identity.edits[luid], {
    intent: 'reject', contentId: replacedBlock.anchor.contentId, locked: false, userEdited: true, provenance: 'rejectActivity'
  });
  assert.deepStrictEqual(replaced.trip.identity.blocks, base.identity.blocks, 'blocks untouched');
  // And the default path is deep-equal but for the map.
  assert.deepStrictEqual(withoutIdentity(replaced), withoutIdentity(edit.rejectActivity(base, activity.id, PILOT_CONTENT, null)));
});

test('T-E1 (rejectActivity, OPEN-GAP ROW): with NO eligible alternative the placement stays LIVE at an unchanged address with a null contentId (mutation 26)', () => {
  const { base, activity, luid, onlyCurrent } = rejectFixture();
  const emptied = edit.rejectActivity(base, activity.id, onlyCurrent, { data: PILOT_DATA });
  assert.equal(emptied.ok, true, `${emptied.reason ?? ''}`);

  // The block really became an open gap, at an unchanged id and address.
  const gap = emptied.trip.days.flatMap((d) => d.blocks).find((b) => b.id === activity.id);
  assert.equal(gap.type, 'open', 'the window became an open gap');
  assert.equal(gap.anchor.contentId, null);
  assert.equal(gap.gap.reason, 'no_eligible_content');
  assert.equal(gap.id, activity.id, 'the block id is unchanged');
  assert.equal(gap.anchor.stopId, activity.anchor.stopId, 'and so is its address');
  assert.deepStrictEqual(id.identityTargetFor(gap).address, id.identityTargetFor(activity).address);

  // THE PLACEMENT IS NOT DROPPED. The window still exists; it is empty.
  assert.deepStrictEqual(emptied.trip.identity.blocks, base.identity.blocks);
  assert.equal(emptied.trip.identity.blocks[luid].state, 'live');
  assert.deepStrictEqual(emptied.trip.identity.edits[luid], {
    intent: 'reject', contentId: null, locked: false, userEdited: true, provenance: 'rejectActivity'
  });
  // The resolved map still validates against the trip the rejection produced.
  assert.deepStrictEqual(id.validateIdentity(emptied.trip, emptied.trip.identity, { data: PILOT_DATA }), { ok: true });
});

test('T-E1 (rejectActivity): the null-content intent widens NOTHING trip-wide — choices.rejected keeps exactly its existing meaning', () => {
  const { base, activity, onlyCurrent } = rejectFixture();
  const emptied = edit.rejectActivity(base, activity.id, onlyCurrent, { data: PILOT_DATA });
  const defaulted = edit.rejectActivity(base, activity.id, onlyCurrent, null);
  assert.equal(emptied.ok, true);
  assert.equal(defaulted.ok, true);
  assert.deepStrictEqual(withoutIdentity(emptied), withoutIdentity(defaulted), 'the opt-in changed nothing but the map');
  assert.deepStrictEqual(emptied.trip.spec.choices.rejected, defaulted.trip.spec.choices.rejected);
  assert.ok(emptied.trip.spec.choices.rejected.includes(activity.anchor.contentId), 'the content-id exclusion is exactly what it was');
  // No "keep this time empty forever": the trip-wide rejected list gained ONE content id
  // and nothing else, and the gap carries no placement-scoped rule of its own.
  assert.deepStrictEqual(
    emptied.trip.spec.choices.rejected.filter((x) => !(base.spec.choices.rejected ?? []).includes(x)),
    [activity.anchor.contentId]
  );
});

test('T-E1 (refusals): under the opt-in a trip with no map, or a block no live placement covers, refuses BY NAME and changes nothing', () => {
  const free = buildFamily('peru');
  const activity = free.days.flatMap((d) => d.blocks).find((b) => b.type === 'activity' && b.id.startsWith('op:'));
  const snapshot = clone(free);

  const noMap = edit.pinActivity(free, activity.id, { data: PILOT_DATA });
  assert.equal(noMap.ok, false);
  assert.equal(noMap.reason, 'absent');
  assert.deepStrictEqual(free, snapshot, 'the caller trip is untouched');
  // PAIRED CONTROL: the same call without the opt-in succeeds, exactly as at base.
  assert.equal(edit.pinActivity(free, activity.id).ok, true);

  // A map that covers everything except this block.
  const seeded = seededMap(free);
  const luid = Object.entries(seeded.blocks).find(([, p]) => id.placementKey(p) === id.identityTargetFor(activity).key)[0];
  const holed = { ...free, identity: { ...seeded, blocks: Object.fromEntries(Object.entries(seeded.blocks).filter(([k]) => k !== luid)) } };
  const uncovered = edit.pinActivity(holed, activity.id, { data: PILOT_DATA });
  assert.equal(uncovered.ok, false);
  assert.equal(uncovered.reason, 'coverage_target_uncovered');
  assert.equal(uncovered.detail.blockId, activity.id);
  // PAIRED CONTROL: with the placement present it lands.
  assert.equal(edit.pinActivity({ ...free, identity: seeded }, activity.id, { data: PILOT_DATA }).ok, true);
});

// ---------------------------------------------------------------------------
// T-D1 — dormancy per touched function and per input class.

/**
 * The two input classes, and every function packet 1b touches, keyed by name.
 *
 * Both classes are the SAME stored record read back through the real reader — one with a
 * map injected into the stored payload, one without — so the only difference between the
 * two inputs is identity itself, not the writer's own stamp.
 */
function dormancyMatrix() {
  const built = buildFamily('japan-multi-stop');
  const identity = map({
    used: ['luid-old', 'luid-later'],
    blocks: { 'luid-old': livePlacement(built.routePlan.stops[0].key, 0, 1, 'full') },
    edits: { 'luid-old': { intent: 'pin', contentId: null, locked: true, userEdited: true, provenance: 'seed' } }
  });
  const loadedBearing = admittedIdentityBearing(built, identity);
  const loadedFree = admittedLegacy(built);
  // Both classes are given a REAL history entry, so the `undo` row actually exercises the
  // restore path instead of refusing `nothing_to_undo` for both and proving nothing. The
  // snapshot's `used` is a strict subset of the current trip's, which is the shape that
  // makes the union visible if it ever ran on the default path.
  const snapshotIdentity = map({ used: ['luid-old'], blocks: identity.blocks, edits: identity.edits });
  const bearing = { ...loadedBearing, history: [{ ...clone(loadedBearing), identity: snapshotIdentity, history: [] }] };
  const free = { ...loadedFree, history: [{ ...clone(loadedFree), history: [] }] };
  const stopKey = free.routePlan.stops[0].key;
  const act = (trip) => trip.days.flatMap((d) => d.blocks).find((b) => b.type === 'activity' && b.id.startsWith('op:'));

  const calls = {
    swapActivity: (t, i) => edit.swapActivity(t, act(t).id, null, PILOT_CONTENT, i),
    rejectActivity: (t, i) => edit.rejectActivity(t, act(t).id, PILOT_CONTENT, i),
    pinActivity: (t, i) => edit.pinActivity(t, act(t).id, i),
    unpinActivity: (t, i) => edit.unpinActivity(t, act(t).id, i),
    makeDayLighter: (t, i) => edit.makeDayLighter(t, lighterDay(t), PILOT_CONTENT, i),
    swapDays: (t, i) => { const p = swappablePair(t); return edit.swapDays(t, p[0], p[1], PILOT_CONTENT, i); },
    undo: (t, i) => edit.undo(t, i),
    reconcile: (t, i) => rs.reconcile(t, t, PILOT_CONTENT, i),
    tripFingerprint: (t, i) => tripFingerprint(t, i),
    previewAdjustNights: (t, i) => rs.previewAdjustNights(t, stopKey, 1, i ? { ...OPT_IN } : PREVIEW_OPTIONS),
    previewChangeLength: (t, i) => rs.previewChangeLength(t, t.spec.totalDays + 1, i ? { ...OPT_IN } : PREVIEW_OPTIONS),
    previewAddOptional: (t, i) => rs.previewAddOptional(t, 'none', 'none', i ? { ...OPT_IN } : PREVIEW_OPTIONS),
    previewRemoveOptional: (t, i) => rs.previewRemoveOptional(t, 'none', i ? { ...OPT_IN } : PREVIEW_OPTIONS),
    previewMoveOptional: (t, i) => rs.previewMoveOptional(t, 'none', 'none', i ? { ...OPT_IN } : PREVIEW_OPTIONS),
    previewAddExcursion: (t, i) => rs.previewAddExcursion(t, stopKey, 'none', i ? { ...OPT_IN } : PREVIEW_OPTIONS),
    previewRemoveExcursion: (t, i) => rs.previewRemoveExcursion(t, stopKey, 'none', i ? { ...OPT_IN } : PREVIEW_OPTIONS)
  };
  return { free, bearing, calls, stopKey, snapshotIdentity };
}

test('T-D1 (DEFAULT PATH): without the opt-in, every touched function treats the admitted identity-bearing class exactly as the identity-free class (mutations 9, 18)', () => {
  const { free, bearing, calls, snapshotIdentity } = dormancyMatrix();
  for (const [name, call] of Object.entries(calls)) {
    const onFree = call(free, null);
    const onBearing = call(bearing, null);
    assert.deepStrictEqual(
      withoutIdentity(onBearing),
      withoutIdentity(onFree),
      `${name}: the admitted identity-bearing class diverged from the identity-free class on the default path`
    );
    if (name !== 'tripFingerprint') {
      // Nothing on the default path ever adds an identity key or a mode key.
      const serialised = JSON.stringify(onBearing ?? null);
      assert.equal(serialised.includes('"identityMode"'), false, `${name}: a mode key leaked onto the default path`);
      assert.equal(serialised.includes('"identityAllocation"'), false, `${name}: an allocation leaked onto the default path`);
    }
  }
  // Identity-stripped equality alone would hide an identity-ONLY change, so the map itself
  // is asserted unchanged too: no default-path call may touch `blocks`, `edits` or `used`.
  // (Without this, `undo` applying the union on the default path is invisible here, because
  // the union changes only `used`.)
  let mapChecked = 0;
  for (const [name, call] of Object.entries(calls)) {
    if (name === 'tripFingerprint') continue;
    const result = call(bearing, null);
    if (name === 'reconcile') {
      // `reconcile` spreads the SKELETON it is handed, so a map on that skeleton rides
      // through at base. It must ride through UNCHANGED, and no allocation may appear.
      assert.deepStrictEqual(result.trip.identity, bearing.identity, 'reconcile: the map it carried was modified');
      assert.equal(result.identityAllocation, undefined, 'reconcile: an allocation leaked onto the default path');
      mapChecked += 1;
      continue;
    }
    if (result?.trip) {
      // A bounded edit or an undo: the map is exactly the one it should be holding.
      assert.equal(result.ok, true, `${name}: the default-path call must land for this assertion to mean anything`);
      const expected = name === 'undo' ? snapshotIdentity : bearing.identity;
      assert.deepStrictEqual(result.trip.identity, expected, `${name}: the default path modified the identity map itself`);
      mapChecked += 1;
      continue;
    }
    // A preview: no proposal may carry a map or a mode, whether it succeeded or refused.
    for (const proposal of result?.proposals ?? []) {
      assert.equal(proposal.trip.identity, undefined, `${name}: a proposal trip acquired a map`);
      assert.equal('identityMode' in proposal, false, `${name}: a proposal acquired a mode`);
    }
    mapChecked += 1;
  }
  assert.ok(mapChecked >= 15, `the map-unchanged check must cover the whole surface, covered ${mapChecked}`);

  // The fingerprint is the one call whose two classes must be byte-identical, not merely
  // identity-stripped-equal — and it is still the bc58722 literal.
  assert.equal(tripFingerprint(bearing), tripFingerprint(free));
  assert.equal(tripFingerprint(bearing), BASE_FINGERPRINTS['japan-multi-stop']);
});

test('T-D1 (OPT-IN CONTROL): on a trip with a complete map, every touched function really does the identity work', () => {
  const { calls, stopKey } = dormancyMatrix();
  const complete = buildFamilyWithIdentity('japan-multi-stop');

  assert.notEqual(tripFingerprint(complete, true), tripFingerprint(complete), 'tripFingerprint');
  assert.ok(rs.reconcile(complete, complete, PILOT_CONTENT, { data: PILOT_DATA }).identityAllocation, 'reconcile allocates under the opt-in');
  assert.equal(rs.reconcile(complete, complete, PILOT_CONTENT).identityAllocation, undefined, 'and only under the opt-in');

  for (const name of ['swapActivity', 'rejectActivity', 'pinActivity', 'makeDayLighter', 'swapDays']) {
    const result = calls[name](complete, { data: PILOT_DATA });
    assert.equal(result.ok, true, `${name} opt-in: ${result.reason ?? ''} ${JSON.stringify(result.detail ?? {})}`);
    assert.notDeepStrictEqual(result.trip.identity.edits, complete.identity.edits, `${name}: the opt-in control recorded no intent`);
  }

  const optedInPreview = rs.previewAdjustNights(complete, stopKey, 1, OPT_IN);
  assert.equal(optedInPreview.ok, true, `${optedInPreview.why ?? ''}`);
  assert.equal(optedInPreview.proposals[0].identityMode, true);
  const applied = rs.applyProposal(complete, optedInPreview.proposals[0]);
  assert.equal(applied.ok, true, `${applied.reason ?? ''}`);
  assert.deepStrictEqual(id.validateIdentity(applied.trip, applied.trip.identity, { data: PILOT_DATA }), { ok: true });
});

// ---------------------------------------------------------------------------
// Local helpers that find real, reachable inputs rather than assuming them.

function blockFor(trip, blockId) {
  return trip.days.flatMap((d) => d.blocks).find((b) => b.id === blockId);
}

/** A day `makeDayLighter` really changes something on, so the test is not vacuous. */
function lighterDay(trip) {
  for (const day of trip.days) {
    const before = JSON.stringify(day.blocks);
    const result = edit.makeDayLighter(trip, day.dayNumber, PILOT_CONTENT);
    if (!result.ok) continue;
    const after = JSON.stringify(result.trip.days.find((d) => d.dayNumber === day.dayNumber).blocks);
    if (after !== before) return day.dayNumber;
  }
  throw new Error('identityOptIn: no day in this fixture is changed by makeDayLighter');
}

/** A real swappable day pair, found through the engine's own `swappableDays`. */
function swappablePair(trip) {
  for (const day of trip.days) {
    const options = edit.swappableDays(trip, day.dayNumber, PILOT_CONTENT);
    if (options.length > 0) return [day.dayNumber, options[0]];
  }
  throw new Error('identityOptIn: no swappable day pair in this fixture');
}
