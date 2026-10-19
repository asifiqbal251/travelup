// Q8 packet 1b — the correction round for the independent review of f4b6f18.
//
// R1  removing a selected excursion must RETIRE its identity, so re-selection issues a
//     distinct luid instead of inheriting the old one.
// R2  a returning placement's retained intent must reach the ITINERARY, not only the map.
// R3  the seven public opt-in routes must be proved by SUCCESSFUL paths. The row that
//     escaped before used ids like 'none', refused, ran its proposal loop zero times and
//     incremented a counter anyway. An empty loop is not coverage, and a counter that
//     increments on a refusal path asserts nothing — which is why R1 escaped detection.
// R4  relocation must re-check its SOURCE's lifecycle state, at enumeration and again at
//     acceptance.
// R5  D-A §6.2's transition writes, from an explicitly supplied deterministic time input.
//
// Every assertion here runs through the real public opted-in routes on real producer
// output, with the paired default control, and asserts the complete effect.

import { strict as assert } from 'node:assert';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import * as id from '../../src/lib/door2/identity.js';
import * as rs from '../../src/lib/door2/restructure.js';
import * as edit from '../../src/lib/door2/edit.js';
import { compileFamilies } from '../../src/lib/door2/families.js';
import { buildFilledTrip } from '../../src/lib/door2/planner.js';
import { eligibleItemsForBlock } from '../../src/lib/door2/fill.js';
import { synBundle, synSpec } from './helpers/syntheticHub.js';

// ---------------------------------------------------------------------------
// The harness. Synthetic PACKAGE input driven through the real producer and the real
// public previews — the brief's own route for reaching surfaces pilot data cannot
// (§5.3 T-O1(d)). Nothing here is a hand-built trip: every trip below is `buildFilledTrip`
// output, and every structural change goes through a `preview*` export and `applyProposal`.

const B = synBundle(compileFamilies);

const clone = (v) => JSON.parse(JSON.stringify(v));

/** A producer trip for one synthetic variant. */
function producerTrip(totalDays, routeTemplateId) {
  const trip = buildFilledTrip(synSpec(totalDays, { routeTemplateId }), B.data, { content: B.content });
  assert.ok(trip && trip.days?.length > 0, `the producer built no trip for ${routeTemplateId} at ${totalDays}d`);
  return trip;
}

/**
 * A deterministic harness: a counting token source, the opted-in option bag and the paired
 * default bag built from the SAME options, so the only difference between the two is the
 * opt-in itself.
 */
function harness(prefix = 'k') {
  const state = { calls: 0 };
  const tokens = { crypto: { randomUUID: () => `${prefix}${++state.calls}` } };
  const common = { data: B.data, content: B.content, families: B.families };
  return {
    tokens,
    state,
    optIn: { ...common, identity: true, tokens },
    dflt: { ...common },
    /** A seeded trip, through the engine's own fresh-build entry point. */
    seed(trip) {
      const seeded = id.initialiseIdentityForBuild(trip, { data: B.data, tokens });
      assert.equal(seeded.ok, true, `seeding failed: ${seeded.reason} ${JSON.stringify(seeded.detail ?? {})}`);
      return { ...trip, identity: seeded.identity };
    }
  };
}

/** Every placement's state, which is the map's complete lifecycle picture. */
const states = (trip) => Object.fromEntries(Object.entries(trip.identity.blocks).map(([k, p]) => [k, p.state]));

/** A trip without its map, for comparing the two modes' complete itineraries. */
function withoutIdentity(trip) {
  const { identity, ...rest } = trip;
  return rest;
}

const blockOf = (trip, blockId) => trip.days.flatMap((d) => d.blocks).find((b) => b.id === blockId);
const blockIds = (trip) => trip.days.flatMap((d) => d.blocks).map((b) => b.id);

/** One opted-in preview and apply, asserting the mode and that the apply really landed. */
function applyOptedIn(trip, preview, options) {
  const result = preview(trip, options);
  assert.equal(result.ok, true, `the opted-in preview must succeed: ${result.reason ?? ''}/${result.why ?? ''}`);
  assert.ok(result.proposals.length > 0, 'a successful preview must carry at least one proposal');
  assert.equal(result.proposals[0].identityMode, true, 'the proposal must record the opted-in mode');
  const applied = rs.applyProposal(trip, result.proposals[0]);
  assert.equal(applied.ok, true, `the opted-in apply must succeed: ${applied.reason ?? ''} ${JSON.stringify(applied.detail ?? {})}`);
  assert.ok(applied.trip.identity, 'the opted-in apply must install a map');
  assert.deepStrictEqual(
    id.validateIdentity(applied.trip, applied.trip.identity, { data: B.data }),
    { ok: true },
    'the committed map must pass full validation'
  );
  return applied.trip;
}

// ---------------------------------------------------------------------------
// R1 — removing a selected excursion retires its identity.

test('R1: through the real public opted-in routes, add -> remove -> re-select RETIRES the removed excursion and issues a DISTINCT luid, with the complete itinerary and the complete map asserted', () => {
  const h = harness('r1');
  const start = h.seed(producerTrip(4, 'syn_hub'));

  // The seeded map covers exactly the two open windows this build has, and nothing else.
  assert.deepStrictEqual(blockIds(start), [
    'tr:origin_out>lx_base', 'op:lx_base:d1', 'op:lx_base:d2', 'tr:lx_base>origin_home'
  ]);
  assert.deepStrictEqual(states(start), { r11: 'live', r12: 'live' });

  // --- 1. Select the excursion through the real public add route. -------------------
  const added = applyOptedIn(start, (t, o) => rs.previewAddExcursion(t, 'lx_base', 'sintra', o), h.optIn);
  // The complete itinerary: the three excursion blocks exist and only the site block minted.
  assert.deepStrictEqual(blockIds(added), [
    'tr:origin_out>lx_base',
    'ex:lx_base:syn_sintra:out', 'ex:lx_base:syn_sintra:site', 'ex:lx_base:syn_sintra:back',
    'op:lx_base:d1', 'op:lx_base:d2', 'tr:lx_base>origin_home'
  ]);
  const firstLuid = Object.entries(added.identity.blocks).find(([, p]) => p.kind === 'excursion')[0];
  assert.deepStrictEqual(added.identity.blocks[firstLuid], {
    stopKey: 'lx_base', kind: 'excursion', address: { excursionPlaceId: 'syn_sintra' },
    state: 'live', excursionId: 'sintra'
  });
  // The reshaped full-day window was displaced and a new half-day window minted.
  assert.deepStrictEqual(states(added), { r11: 'displaced', r12: 'live', r13: 'live', r14: 'live' });
  assert.equal(firstLuid, 'r13');

  // --- 2. Pin the excursion's site block, so the removal has a real edit to retain. --
  const pinned = edit.pinActivity(added, 'ex:lx_base:syn_sintra:site', { data: B.data, tokens: h.tokens });
  assert.equal(pinned.ok, true, `pinning the site block must land: ${pinned.reason ?? ''}`);
  const withPin = pinned.trip;
  assert.deepStrictEqual(withPin.identity.edits, {
    r13: { intent: 'pin', contentId: 'sintra_half_1', locked: true, userEdited: false, provenance: 'pinActivity' }
  });

  // --- 3. Remove it through the real public remove route. ---------------------------
  const removed = applyOptedIn(withPin, (t, o) => rs.previewRemoveExcursion(t, 'lx_base', 'sintra', o), h.optIn);

  // THE DEFECT: this read `displaced` before the correction, so re-selection matched it.
  assert.equal(removed.identity.blocks.r13.state, 'retired', 'a removed selection is RETIRED, never displaced');
  // Retained, exactly as the governing rule requires: the edit and the registry entry.
  assert.deepStrictEqual(removed.identity.edits.r13, withPin.identity.edits.r13, 'the retired edit is retained verbatim');
  assert.ok(removed.identity.used.includes('r13'), 'and its registry entry is retained');
  // Its address is retained too, so the retirement is a state change and nothing else.
  assert.deepStrictEqual(removed.identity.blocks.r13.address, { excursionPlaceId: 'syn_sintra' });
  // The complete map: the full-day window recovered, the half-day one displaced in its turn.
  assert.deepStrictEqual(states(removed), { r11: 'live', r12: 'live', r13: 'retired', r14: 'displaced' });
  // The complete itinerary genuinely round-trips: removing the excursion restores the
  // producer's own days, block for block.
  assert.deepStrictEqual(removed.days, start.days, 'the itinerary after add -> remove is the producer itinerary again');

  // --- 4. Re-select through the same public add route. ------------------------------
  const reselected = applyOptedIn(removed, (t, o) => rs.previewAddExcursion(t, 'lx_base', 'sintra', o), h.optIn);
  const freshLuid = Object.entries(reselected.identity.blocks)
    .find(([, p]) => p.kind === 'excursion' && p.state === 'live')[0];

  assert.notEqual(freshLuid, firstLuid, 'RE-SELECTION MUST ISSUE A DISTINCT LUID, not reuse the retired one');
  assert.equal(freshLuid, 'r15');
  assert.equal(reselected.identity.edits[freshLuid], undefined, 'the fresh identity inherits no edit');
  assert.deepStrictEqual(reselected.identity.edits.r13, withPin.identity.edits.r13, 'the retired edit is still retained');
  assert.equal(reselected.identity.blocks.r13.state, 'retired', 'and the retired placement stays retired');
  assert.deepStrictEqual(states(reselected), { r11: 'displaced', r12: 'live', r13: 'retired', r14: 'live', r15: 'live' });
  // The complete itinerary again: re-selecting rebuilds exactly the first selection's days.
  assert.deepStrictEqual(reselected.days, added.days, 'the re-selected itinerary is the first selection itinerary');
});

test('R1 (CONTROL): an open window losing its address is still DISPLACED and still recovers — only the excursion kind retires', () => {
  const h = harness('r1c');
  const start = h.seed(producerTrip(4, 'syn_hub'));
  const added = applyOptedIn(start, (t, o) => rs.previewAddExcursion(t, 'lx_base', 'sintra', o), h.optIn);

  // The reshaped `op:` window is displaced, NOT retired, and its address is untouched.
  assert.equal(added.identity.blocks.r1c1.state, 'displaced');
  assert.deepStrictEqual(added.identity.blocks.r1c1.address, start.identity.blocks.r1c1.address);

  // And it recovers when its exact window returns, which retirement would have prevented.
  const removed = applyOptedIn(added, (t, o) => rs.previewRemoveExcursion(t, 'lx_base', 'sintra', o), h.optIn);
  assert.equal(removed.identity.blocks.r1c1.state, 'live', 'a displaced OPEN window recovers its own identity');
});

// ---------------------------------------------------------------------------
// R2 — a returning placement's retained intent reaches the itinerary.

test('R2: a pin displaced and then returned is restored to the ITINERARY, not only to the map, with the complete trip asserted', () => {
  const h = harness('r2');
  const seeded = h.seed(producerTrip(4, 'syn_hub'));

  // Pin the real full-day activity through the real `pinActivity`.
  const pinned = edit.pinActivity(seeded, 'op:lx_base:d1', { data: B.data, tokens: h.tokens });
  assert.equal(pinned.ok, true, `${pinned.reason ?? ''}`);
  const start = pinned.trip;
  const luid = Object.entries(start.identity.blocks).find(([, p]) => p.address.dayOffset === 1)[0];
  const pinnedContent = blockOf(start, 'op:lx_base:d1').anchor.contentId;
  assert.equal(blockOf(start, 'op:lx_base:d1').locked, true, 'the pin really landed in the itinerary');
  assert.deepStrictEqual(start.identity.edits[luid], {
    intent: 'pin', contentId: pinnedContent, locked: true, userEdited: false, provenance: 'pinActivity'
  });

  // Adding the excursion reshapes that day, so the pinned window is displaced.
  const displaced = applyOptedIn(start, (t, o) => rs.previewAddExcursion(t, 'lx_base', 'sintra', o), h.optIn);
  assert.equal(displaced.identity.blocks[luid].state, 'displaced');
  assert.deepStrictEqual(displaced.identity.edits[luid], start.identity.edits[luid], 'the displaced edit is retained');

  // Removing it returns the exact full-day address.
  const returned = applyOptedIn(displaced, (t, o) => rs.previewRemoveExcursion(t, 'lx_base', 'sintra', o), h.optIn);
  assert.equal(returned.identity.blocks[luid].state, 'live', 'the exact window returned and recovered its identity');

  // THE DEFECT: the map said the pin survived while the returned block read `locked: false`,
  // so every later command saw an unpinned window. Map and itinerary must now agree.
  const block = blockOf(returned, 'op:lx_base:d1');
  assert.equal(returned.identity.edits[luid].locked, true, 'the map records the pin');
  assert.equal(block.locked, true, 'AND THE RETURNED ITINERARY BLOCK CARRIES IT');
  assert.equal(block.anchor.contentId, returned.identity.edits[luid].contentId, 'map and itinerary name the same content');
  assert.equal(block.anchor.contentId, pinnedContent, 'which is the content that was pinned');
  assert.equal(block.type, 'activity');

  // The complete trip: the itinerary is the pinned producer itinerary again, block for block.
  assert.deepStrictEqual(returned.days, start.days, 'the complete itinerary returned to its pre-displacement state');
});

test('R2 (CONTROL — the address does NOT return): the retained intent stays retained and is written nowhere', () => {
  const h = harness('r2c');
  const pinned = edit.pinActivity(h.seed(producerTrip(4, 'syn_hub')), 'op:lx_base:d1', { data: B.data, tokens: h.tokens });
  const start = pinned.trip;
  const luid = Object.entries(start.identity.blocks).find(([, p]) => p.address.dayOffset === 1)[0];
  const intent = start.identity.edits[luid];

  // The excursion stays selected, so the full-day address never comes back.
  const displaced = applyOptedIn(start, (t, o) => rs.previewAddExcursion(t, 'lx_base', 'sintra', o), h.optIn);
  assert.equal(displaced.identity.blocks[luid].state, 'displaced', 'the address did not return');
  assert.deepStrictEqual(displaced.identity.edits[luid], intent, 'the intent is retained, unchanged');

  // Nothing was restored anywhere: no block in the trip was locked on this placement's behalf.
  const lockedBlocks = displaced.days.flatMap((d) => d.blocks).filter((b) => b.locked === true);
  assert.deepStrictEqual(lockedBlocks.map((b) => b.id), [], 'no block was locked while the address was away');
  // And the restoration pass itself reports nothing to do for a map with no recovery.
  const none = id.restoreRecoveredIntents(displaced, displaced.identity, [], { content: B.content });
  assert.deepStrictEqual(none.restored, []);
  assert.deepStrictEqual(none.unrestorable, []);
  assert.equal(none.trip, displaced, 'with nothing recovered the trip is returned untouched, by identity');
});

test('R2 (CONTROL — the retained content is no longer eligible): the block is left exactly as the filler left it, the edit is kept, and the placement is REPORTED', () => {
  const h = harness('r2u');
  const trip = h.seed(producerTrip(4, 'syn_hub'));
  const luid = Object.entries(trip.identity.blocks).find(([, p]) => p.address.dayOffset === 1)[0];
  const target = { luid, target: id.identityTargetFor(blockOf(trip, 'op:lx_base:d1')) };

  // A retained intent naming content that is not in the shelf at all, so it cannot be placed.
  const withIntent = {
    ...trip,
    identity: {
      ...trip.identity,
      edits: { [luid]: { intent: 'pin', contentId: 'not_a_real_item', locked: true, userEdited: true, provenance: 'pinActivity' } }
    }
  };
  const before = clone(withIntent.days);
  const result = id.restoreRecoveredIntents(withIntent, withIntent.identity, [target], { content: B.content });

  assert.equal(result.ok, true, result.reason);
  assert.deepStrictEqual(result.restored, [], 'nothing was restored');
  assert.deepStrictEqual(result.unrestorable, [
    { luid, blockId: 'op:lx_base:d1', contentId: 'not_a_real_item', why: 'content_not_eligible' }
  ], 'and the placement is reported rather than silently diverging');
  assert.deepStrictEqual(result.trip.days, before, 'the itinerary is untouched — no content the traveller never chose is pinned');
  assert.deepStrictEqual(result.trip.identity.edits[luid], withIntent.identity.edits[luid], 'the edit is kept');
});

test('R2: only a DISPLACED placement is reported as recovered — a window that was live and stays live is not restored over', () => {
  const h = harness('r2r');
  const trip = h.seed(producerTrip(4, 'syn_hub'));
  const targets = id.qualifyingTargets(trip, { data: B.data });
  assert.equal(targets.ok, true);

  // One placement live, one displaced, both matching a target of this very build.
  const [liveLuid] = Object.entries(trip.identity.blocks).find(([, p]) => p.address.dayOffset === 1);
  const [awayLuid] = Object.entries(trip.identity.blocks).find(([, p]) => p.address.dayOffset === 2);
  const prior = {
    ...trip.identity,
    blocks: { ...trip.identity.blocks, [awayLuid]: { ...trip.identity.blocks[awayLuid], state: 'displaced' } }
  };
  const corr = id.correspond(prior, targets.targets, new Set(['lx_base']));
  assert.equal(corr.ok, true, corr.reason);

  // Both are live again, but only the one that was AWAY counts as a recovery. Reporting a
  // live-and-stays-live window would let the restoration pass overwrite the content the
  // rebuild itself chose — behaviour packet 1b does not have and must not acquire.
  assert.equal(corr.blocks[liveLuid].state, 'live');
  assert.equal(corr.blocks[awayLuid].state, 'live');
  assert.deepStrictEqual(
    corr.recovered.map((r) => r.luid),
    [awayLuid],
    'only the displaced placement is a recovery'
  );
});

test('R2: restoration cannot move an address — only content and the intent flags change', () => {
  const h = harness('r2a');
  const trip = h.seed(producerTrip(4, 'syn_hub'));
  const block = blockOf(trip, 'op:lx_base:d1');
  const luid = Object.entries(trip.identity.blocks).find(([, p]) => p.address.dayOffset === 1)[0];
  // A genuinely eligible alternative for that very window, found through the engine's own
  // gate rather than guessed: the shelf and the used-item scan decide what is eligible.
  const alternative = eligibleItemsForBlock(trip, block, B.content)
    .find((item) => item.id !== block.anchor.contentId);
  assert.ok(alternative, 'the control needs a genuinely eligible alternative to exist');
  assert.equal(id.relocationTargetEligible(trip, block, alternative.id, B.content).eligible, true);

  const withIntent = {
    ...trip,
    identity: {
      ...trip.identity,
      edits: { [luid]: { intent: 'swap', contentId: alternative.id, locked: true, userEdited: true, provenance: 'swapActivity' } }
    }
  };
  const result = id.restoreRecoveredIntents(
    withIntent, withIntent.identity,
    [{ luid, target: id.identityTargetFor(block) }],
    { content: B.content }
  );
  assert.equal(result.ok, true, result.reason);
  const after = blockOf(result.trip, 'op:lx_base:d1');
  assert.equal(after.anchor.contentId, alternative.id, 'the eligible retained content was placed');
  assert.equal(after.locked, true);
  assert.equal(after.userEdited, true);
  // The address components, and therefore the whole map's validity, are untouched.
  assert.equal(after.id, block.id);
  assert.equal(after.startTime, block.startTime);
  assert.equal(after.durationHours, block.durationHours);
  assert.equal(after.anchor.stopId, block.anchor.stopId);
  assert.deepStrictEqual(id.identityTargetFor(after).address, id.identityTargetFor(block).address, 'the address did not move');
  assert.deepStrictEqual(id.validateIdentity(result.trip, result.trip.identity, { data: B.data }), { ok: true });
});

// ---------------------------------------------------------------------------
// R3 — the seven public routes, proved by SUCCESSFUL paths in both modes.
//
// Each row is a real supported call that LANDS. The previous rows passed ids such as
// 'none', refused, and proved nothing about the engine behind them. There is no counter
// here: every row is a named subtest and an empty row would fail its own assertions.

/** The seven public previews, each with a producer trip it genuinely succeeds on. */
const PUBLIC_ROUTES = [
  ['previewAdjustNights', () => producerTrip(4, 'syn_hub'), (t, o) => rs.previewAdjustNights(t, 'lx_base', 1, o)],
  ['previewChangeLength', () => producerTrip(4, 'syn_hub'), (t, o) => rs.previewChangeLength(t, t.spec.totalDays + 1, o)],
  ['previewAddOptional', () => producerTrip(6, 'syn_hub'), (t, o) => rs.previewAddOptional(t, 'spur', 'after_base', o)],
  ['previewRemoveOptional', () => producerTrip(6, 'syn_hub+spur@after_base'), (t, o) => rs.previewRemoveOptional(t, 'spur', o)],
  ['previewMoveOptional', () => producerTrip(6, 'syn_line#fwd+mid@ab'), (t, o) => rs.previewMoveOptional(t, 'mid', 'bc', o)],
  ['previewAddExcursion', () => producerTrip(4, 'syn_hub'), (t, o) => rs.previewAddExcursion(t, 'lx_base', 'sintra', o)],
  ['previewRemoveExcursion', null, (t, o) => rs.previewRemoveExcursion(t, 'lx_base', 'sintra', o)]
];

/** The remove-excursion row needs a trip that already holds the excursion. */
function tripWithExcursion(h) {
  return applyOptedIn(h.seed(producerTrip(4, 'syn_hub')), (t, o) => rs.previewAddExcursion(t, 'lx_base', 'sintra', o), h.optIn);
}

for (const [name, makeTrip, call] of PUBLIC_ROUTES) {
  test(`R3 (${name}): the real public route SUCCEEDS under the opt-in — the mode is recorded, the apply lands, the map is complete, and the full trip equals the default route's`, () => {
    const h = harness('o');
    const trip = makeTrip === null ? tripWithExcursion(h) : h.seed(makeTrip());

    // --- The opted-in route, end to end. --------------------------------------------
    const preview = call(trip, h.optIn);
    assert.equal(preview.ok, true, `the opted-in preview must SUCCEED on a real supported input: ${preview.reason ?? ''}/${preview.why ?? ''}`);
    assert.ok(preview.proposals.length > 0, 'and carry a real proposal — an empty proposal list is not coverage');
    for (const proposal of preview.proposals) {
      assert.equal(proposal.identityMode, true, `${name}: every opted-in proposal must record the mode`);
      assert.ok(proposal.identityAllocation, `${name}: an opted-in proposal must carry its allocation`);
      assert.equal(proposal.identityAllocation.ok, true, `${name}: the allocation must have succeeded`);
    }
    const applied = rs.applyProposal(trip, preview.proposals[0]);
    assert.equal(applied.ok, true, `${name}: the opted-in apply must land: ${applied.reason ?? ''} ${JSON.stringify(applied.detail ?? {})}`);

    // The identity effects, in full: a complete map that validates, covering every
    // qualifying target of the committed build and no provisional key anywhere.
    assert.ok(applied.trip.identity, `${name}: the apply installed no map`);
    assert.deepStrictEqual(
      id.validateIdentity(applied.trip, applied.trip.identity, { data: B.data }),
      { ok: true },
      `${name}: the committed map must pass full validation`
    );
    const targets = id.qualifyingTargets(applied.trip, { data: B.data });
    assert.equal(targets.ok, true);
    const live = Object.values(applied.trip.identity.blocks).filter((p) => p.state === 'live');
    assert.equal(live.length, targets.targets.length, `${name}: every qualifying target is covered exactly once`);
    assert.equal(
      JSON.stringify(applied.trip.identity).includes('"#new'),
      false,
      `${name}: no provisional key survived the commit`
    );
    for (const luid of Object.keys(applied.trip.identity.blocks)) {
      assert.ok(applied.trip.identity.used.includes(luid), `${name}: ${luid} is not in the registry`);
    }

    // --- The paired DEFAULT control, on the same input. -----------------------------
    const dflt = call(trip, h.dflt);
    assert.equal(dflt.ok, true, `${name}: the default route must succeed on the same input: ${dflt.reason ?? ''}/${dflt.why ?? ''}`);
    for (const proposal of dflt.proposals) {
      assert.equal('identityMode' in proposal, false, `${name}: a default proposal acquired a mode`);
      assert.equal('identityAllocation' in proposal, false, `${name}: a default proposal acquired an allocation`);
      assert.equal('identityData' in proposal, false, `${name}: a default proposal acquired identity data`);
      assert.equal('identityContent' in proposal, false, `${name}: a default proposal acquired identity content`);
      assert.equal(proposal.trip.identity, undefined, `${name}: a default proposal trip acquired a map`);
    }
    const dfltApplied = rs.applyProposal(trip, dflt.proposals[0]);
    assert.equal(dfltApplied.ok, true, `${name}: the default apply must land: ${dfltApplied.reason ?? ''}`);
    assert.equal(dfltApplied.trip.identity, undefined, `${name}: the default apply installed a map`);

    // THE FULL RESULTING TRIP: the opt-in changes identity and nothing else.
    assert.deepStrictEqual(
      withoutIdentity(applied.trip),
      withoutIdentity(dfltApplied.trip),
      `${name}: the opted-in route changed something other than identity`
    );
  });
}

test('R3 (forwarding): every public preview wrapper forwards its caller options UNCHANGED to the unchecked builder', () => {
  // The behavioural detector is each R3 row above: a wrapper that forwarded
  // `{ ...options, identity: false }` would silently take the default path, no proposal
  // would record a mode, and that row would fail by name. This is the second, independent
  // detector — it names the exact line a forwarding mutation has to touch.
  const source = readFileSync('src/lib/door2/restructure.js', 'utf8');
  const expected = [
    ['previewAdjustNights', 'previewAdjustNightsUnchecked(trip, stopKey, delta, options)'],
    ['previewChangeLength', 'previewChangeLengthUnchecked(trip, newTotalDays, options)'],
    ['previewAddOptional', 'previewAddOptionalUnchecked(trip, optionalId, positionId, options)'],
    ['previewRemoveOptional', 'previewRemoveOptionalUnchecked(trip, optionalId, options)'],
    ['previewMoveOptional', 'previewMoveOptionalUnchecked(trip, optionalId, positionId, options)'],
    ['previewAddExcursion', 'previewAddExcursionUnchecked(trip, stopKey, excursionId, options)'],
    ['previewRemoveExcursion', 'previewRemoveExcursionUnchecked(trip, stopKey, excursionId, options)']
  ];
  for (const [name, forwarding] of expected) {
    assert.ok(
      source.includes(forwarding),
      `${name}: the wrapper no longer forwards its caller options unchanged — an opt-in passed to it would be dropped`
    );
  }
  assert.equal(expected.length, 7, 'all seven public previews are covered');
});

test('R3: applyProposal is exercised in BOTH modes from a real public route, and refuses a planted mode it never captured', () => {
  const h = harness('a');
  const trip = h.seed(producerTrip(4, 'syn_hub'));

  const optedIn = rs.previewAdjustNights(trip, 'lx_base', 1, h.optIn);
  const dflt = rs.previewAdjustNights(trip, 'lx_base', 1, h.dflt);
  assert.equal(optedIn.ok, true);
  assert.equal(dflt.ok, true);
  assert.equal(rs.applyProposal(trip, optedIn.proposals[0]).ok, true);
  assert.equal(rs.applyProposal(trip, dflt.proposals[0]).ok, true);

  // A default proposal with a mode bolted on compares in the wrong mode and refuses stale,
  // rather than running the identity phases against a digest that never included them.
  const planted = { ...dflt.proposals[0], identityMode: true, identityData: B.data, identityContent: B.content };
  assert.equal(rs.applyProposal(trip, planted).reason, 'stale_preview');
});

// ---------------------------------------------------------------------------
// R4 — relocation re-checks its source's lifecycle state.

/** A displaced source carrying a pin, and a clean live target, both from producer output. */
function relocationFixture(sourceState) {
  const h = harness('rl');
  const trip = h.seed(producerTrip(4, 'syn_hub'));
  const entries = Object.entries(trip.identity.blocks);
  const [sourceLuid] = entries.find(([, p]) => p.address.dayOffset === 1);
  const [targetLuid] = entries.find(([, p]) => p.address.dayOffset === 2);
  const targetBlock = blockOf(trip, 'op:lx_base:d2');

  // Vacate the target so the pinned content is genuinely eligible there. `activity` is
  // DELETED rather than set to undefined: an explicit-undefined key is invisible to a JSON
  // snapshot, which would make this fixture's "trip untouched" assertions vacuous.
  const vacate = (b) => {
    const { activity, ...rest } = b;
    return { ...rest, type: 'open', anchor: { ...b.anchor, contentId: null }, locked: false, userEdited: false };
  };
  const vacated = {
    ...trip,
    days: trip.days.map((d) => ({ ...d, blocks: d.blocks.map((b) => (b.id === targetBlock.id ? vacate(b) : b)) }))
  };
  const contentId = targetBlock.anchor.contentId;
  return {
    sourceLuid,
    targetLuid,
    contentId,
    withMap: {
      ...vacated,
      identity: {
        ...trip.identity,
        blocks: { ...trip.identity.blocks, [sourceLuid]: { ...trip.identity.blocks[sourceLuid], state: sourceState } },
        edits: { [sourceLuid]: { intent: 'pin', contentId, locked: true, userEdited: true, provenance: 'pinActivity' } }
      }
    }
  };
}

test('R4 (CONTROL): a DISPLACED source is offered its eligible window and the acceptance lands', () => {
  const { withMap, sourceLuid, targetLuid, contentId } = relocationFixture('displaced');
  const offers = id.relocationOffers(withMap, sourceLuid, { data: B.data, content: B.content });
  assert.equal(offers.ok, true, offers.reason);
  assert.ok(offers.offers.some((o) => o.luid === targetLuid), 'the control must really produce an offer');

  const accepted = id.acceptRelocation(withMap, sourceLuid, targetLuid, { data: B.data, content: B.content });
  assert.equal(accepted.ok, true, accepted.reason);
  assert.deepStrictEqual(accepted.identity.used, withMap.identity.used, 'no token was issued');
  assert.equal(accepted.identity.blocks[sourceLuid].state, 'dismissed');
  assert.equal(accepted.identity.edits[targetLuid].contentId, contentId);
  assert.equal(accepted.identity.edits[targetLuid].provenance, `relocated_from:${sourceLuid}`);
});

for (const state of ['live', 'orphaned', 'dismissed', 'retired']) {
  test(`R4 (stale source, ${state}): no window is offered and acceptance refuses BY NAME, changing no target intent and no registry`, () => {
    const { withMap, sourceLuid, targetLuid } = relocationFixture(state);
    const snapshot = clone(withMap);

    const offers = id.relocationOffers(withMap, sourceLuid, { data: B.data, content: B.content });
    assert.equal(offers.ok, false, `a ${state} source must not be offered a window`);
    assert.equal(offers.reason, 'source_not_displaced');
    assert.equal(offers.detail.state, state);
    assert.equal(offers.detail.luid, sourceLuid);

    const accepted = id.acceptRelocation(withMap, sourceLuid, targetLuid, { data: B.data, content: B.content });
    assert.equal(accepted.ok, false, `a ${state} source must not be able to accept`);
    assert.equal(accepted.reason, 'source_not_displaced');
    assert.equal(accepted.identity, undefined, 'a refusal installs nothing');
    assert.deepStrictEqual(withMap, snapshot, 'the caller trip, its target intent and its registry are untouched');
  });
}

test('R4: the source state is re-checked AT ACCEPTANCE, so an offer enumerated while displaced is not actionable once the source is retired', () => {
  const { withMap, sourceLuid, targetLuid } = relocationFixture('displaced');

  // The offer is genuinely enumerated first, exactly as a caller would.
  const offers = id.relocationOffers(withMap, sourceLuid, { data: B.data, content: B.content });
  assert.equal(offers.ok, true);
  assert.ok(offers.offers.some((o) => o.luid === targetLuid), 'the offer really existed');

  // Then the source is superseded — a case-A retirement, or a removed selection (R1).
  const moved = {
    ...withMap,
    identity: {
      ...withMap.identity,
      blocks: { ...withMap.identity.blocks, [sourceLuid]: { ...withMap.identity.blocks[sourceLuid], state: 'retired' } }
    }
  };
  const snapshot = clone(moved);
  const stale = id.acceptRelocation(moved, sourceLuid, targetLuid, { data: B.data, content: B.content });
  assert.equal(stale.ok, false, 'the previously generated offer must no longer be actionable');
  assert.equal(stale.reason, 'source_not_displaced');
  assert.deepStrictEqual(moved, snapshot, 'and it transferred nothing');
});

// ---------------------------------------------------------------------------
// R5 — D-A §6.2's transition writes, from an explicitly supplied deterministic time.

const AT = '2026-10-18T19:30:00.000Z';

test('R5: all four lifecycle transitions write their §6.2 stamp from the SUPPLIED time, through the real public opted-in route', () => {
  const h = harness('t');
  const optInAt = { ...h.optIn, at: AT };
  const start = h.seed(producerTrip(4, 'syn_hub'));

  const preview = rs.previewAddExcursion(start, 'lx_base', 'sintra', optInAt);
  assert.equal(preview.ok, true, preview.why ?? '');
  assert.equal(preview.proposals[0].identityAt, AT, 'the supplied time travels on the proposal');
  const added = rs.applyProposal(start, preview.proposals[0]);
  assert.equal(added.ok, true, added.reason);

  // displaced: the reshaped open window.
  const displacedLuid = Object.entries(added.trip.identity.blocks).find(([, p]) => p.state === 'displaced')[0];
  assert.equal(added.trip.identity.blocks[displacedLuid].displacedAt, AT, 'displacedAt is written at the transition');

  // retired: the removed selection (R1).
  const removed = applyOptedIn(added.trip, (t, o) => rs.previewRemoveExcursion(t, 'lx_base', 'sintra', o), optInAt);
  const retired = Object.entries(removed.identity.blocks).find(([, p]) => p.state === 'retired')[1];
  assert.equal(retired.retiredAt, AT, 'retiredAt is written at the transition');

  // orphaned: the stop itself leaves the build.
  const orphaned = id.correspond(start.identity, [], new Set(['somewhere_else']), AT);
  assert.equal(orphaned.ok, true);
  for (const placement of Object.values(orphaned.blocks)) {
    assert.equal(placement.state, 'orphaned');
    assert.equal(placement.orphanedAt, AT, 'orphanedAt is written at the transition');
  }

  // dismissed: a relocation acceptance.
  const { withMap, sourceLuid, targetLuid } = relocationFixture('displaced');
  const accepted = id.acceptRelocation(withMap, sourceLuid, targetLuid, { data: B.data, content: B.content, at: AT });
  assert.equal(accepted.ok, true, accepted.reason);
  assert.equal(accepted.identity.blocks[sourceLuid].dismissedAt, AT, 'dismissedAt is written at the transition');
});

test('R5: no ambient clock — with no time supplied no stamp is written, and the engine reaches for no clock of its own', () => {
  const h = harness('n');
  const start = h.seed(producerTrip(4, 'syn_hub'));
  const added = applyOptedIn(start, (t, o) => rs.previewAddExcursion(t, 'lx_base', 'sintra', o), h.optIn);

  for (const [luid, placement] of Object.entries(added.identity.blocks)) {
    for (const field of ['displacedAt', 'orphanedAt', 'dismissedAt', 'retiredAt']) {
      assert.equal(field in placement, false, `${luid}: ${field} was invented with no time supplied`);
    }
  }
  assert.equal(added.identity.blocks.n1.state, 'displaced', 'the transition still happened — only the stamp is absent');

  // The source carries no ambient time source on any map-shaping path. The one `Date.now`
  // reference is the token tier the brief specifies (§3.4's `sessionId.js:34-70` pattern),
  // which names no lifecycle state and is overridable by a supplied token environment.
  const source = readFileSync('src/lib/door2/identity.js', 'utf8');
  const code = source.split('\n').filter((line) => !line.trim().startsWith('//') && !line.trim().startsWith('*'));
  const clocks = code.filter((line) => /Date\.now|new Date|performance\.now|hrtime/.test(line));
  assert.deepStrictEqual(
    clocks.map((l) => l.trim()),
    ["const now = source(env, 'now', () => Date.now);"],
    'the only clock in identity.js is the specified token fallback tier'
  );
});

test('R5: a stamp is written at the TRANSITION only, so an already-displaced placement keeps the moment it happened', () => {
  const h = harness('d');
  const start = h.seed(producerTrip(4, 'syn_hub'));
  const first = applyOptedIn(start, (t, o) => rs.previewAddExcursion(t, 'lx_base', 'sintra', o), { ...h.optIn, at: AT });
  const luid = Object.entries(first.identity.blocks).find(([, p]) => p.state === 'displaced')[0];
  assert.equal(first.identity.blocks[luid].displacedAt, AT);

  // A later operation with a different supplied time leaves the placement displaced.
  const LATER = '2099-01-01T00:00:00.000Z';
  const again = id.correspond(first.identity, [], new Set(['lx_base']), LATER);
  assert.equal(again.ok, true);
  assert.equal(again.blocks[luid].state, 'displaced', 'it is still displaced');
  assert.equal(again.blocks[luid].displacedAt, AT, 'and keeps its ORIGINAL displacedAt, not the later time');
});

test('R5: the supplied time is a value, and an invalid one refuses BY NAME without installing anything', () => {
  const h = harness('v');
  const start = h.seed(producerTrip(4, 'syn_hub'));
  const snapshot = clone(start);

  for (const bad of [{}, [], true, -1, Number.NaN, Number.POSITIVE_INFINITY, '', () => AT]) {
    const refused = id.commitIdentity({ currentTrip: start, nextTrip: start, data: B.data, at: bad, tokens: h.tokens });
    assert.equal(refused.ok, false, `${JSON.stringify(String(bad))} must not be accepted as a time`);
    assert.equal(refused.reason, 'transition_time_invalid');
    assert.equal(refused.identity, undefined, 'a refusal installs nothing');
  }
  // Both accepted forms work.
  for (const good of [AT, 0, 1792000000000]) {
    const ok = id.commitIdentity({ currentTrip: start, nextTrip: start, data: B.data, at: good, tokens: h.tokens });
    assert.equal(ok.ok, true, `${good} must be accepted: ${ok.reason ?? ''}`);
  }
  assert.deepStrictEqual(start, snapshot, 'the caller trip was never touched');
});

test('R5: the engine stays deterministic — one trip, one supplied time, two identical opted-in runs, byte-identical maps', () => {
  const run = () => {
    const h = harness('z');
    const start = h.seed(producerTrip(4, 'syn_hub'));
    return applyOptedIn(start, (t, o) => rs.previewAddExcursion(t, 'lx_base', 'sintra', o), { ...h.optIn, at: AT });
  };
  const a = run();
  const b = run();
  assert.equal(JSON.stringify(a.identity), JSON.stringify(b.identity), 'the map is a function of its inputs alone');
  assert.deepStrictEqual(a.days, b.days);
});

test('R5 (DORMANCY): the time input is opt-in only — no production root passes it, and a default call writes no stamp', () => {
  const h = harness('g');
  const start = h.seed(producerTrip(4, 'syn_hub'));

  // A default preview ignores `at` entirely: no key reaches the proposal.
  const dflt = rs.previewAddExcursion(start, 'lx_base', 'sintra', { ...h.dflt, at: AT });
  assert.equal(dflt.ok, true, dflt.why ?? '');
  assert.equal('identityAt' in dflt.proposals[0], false, 'a default proposal never carries a time');
  assert.equal('identityMode' in dflt.proposals[0], false);
  const applied = rs.applyProposal(start, dflt.proposals[0]);
  assert.equal(applied.ok, true, applied.reason);
  // Base behaviour exactly: a structural apply commits the freshly built proposal trip,
  // which carries no map, so the default path installs none and invents no stamp. It is
  // the OPT-IN that carries a map forward — which is the whole of packet 1b's dormancy.
  assert.equal(applied.trip.identity, undefined, 'the default path installed no map of its own');
  assert.equal(
    JSON.stringify(applied.trip).includes('displacedAt'),
    false,
    'and wrote no lifecycle stamp anywhere in the committed trip'
  );

  // And neither Door 2 page root passes a time, any more than it passes the opt-in.
  for (const path of ['src/pages/Door2Plan.jsx', 'src/pages/Door2Dev.jsx']) {
    const source = readFileSync(path, 'utf8');
    assert.equal(/\bat:\s/.test(source) && /identity:\s*true/.test(source), false, `${path} passes an identity time`);
    assert.equal(source.includes('identity: true'), false, `${path} passes the opt-in`);
  }
});
