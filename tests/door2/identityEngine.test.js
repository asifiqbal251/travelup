// Q8 packet 1b — the identity engine. Build brief draft 4 §5.2 (D-A §11's acceptance
// cases 1-17 plus 18-20) and §5.3's phase, validation and relocation targets.
//
// THE STANDARD. Every test asserts the COMPLETE EFFECT — the whole resolved map, or the
// whole trip — with a paired control proving the same operation lands when it should.
// `ok` flags and counts are never sufficient on their own.
//
// Synthetic constructions are named as such in the test title. Where the brief names real
// producer output — the Niagara reversal, Peru's fixed excursion — the test drives the
// live `buildF6Trip` path, not a fabricated trip.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as id from '../../src/lib/door2/identity.js';
import { compileFamilies } from '../../src/lib/door2/families.js';
import { PILOT_ROUTE_FAMILIES } from '../../src/lib/door2/pilotData.js';
import { blockContext, classifySlot } from '../../src/lib/door2/fill.js';
import { buildTripFromRoutePlan, findRoutePackage } from '../../src/lib/door2/planner.js';
import * as rs from '../../src/lib/door2/restructure.js';
import * as edit from '../../src/lib/door2/edit.js';
import {
  PILOT_CONTENT,
  PILOT_DATA,
  PREVIEW_OPTIONS,
  buildFamily,
  buildFamilyWithIdentity,
  clone,
  constantTokens,
  countingTokens,
  excursionSiteBlock,
  liveExcursion,
  livePlacement,
  map,
  opBlock,
  restBlock,
  spec,
  synthTrip,
  travelBlock
} from './helpers/identityFixtures.js';

const stopSet = (trip) => new Set(trip.routePlan.stops.map((s) => s.key));
const states = (identity) =>
  Object.fromEntries(Object.entries(identity.blocks).map(([luid, p]) => [luid, p.state]));
const addresses = (identity) =>
  Object.fromEntries(Object.entries(identity.blocks).map(([luid, p]) => [luid, p.address]));

/** Correspondence over a synthetic next build, from a hand-built prior map. */
function correspondOnto(prior, nextTrip) {
  const found = id.qualifyingTargets(nextTrip, { data: PILOT_DATA });
  assert.equal(found.ok, true, `targets refused: ${found.reason ?? ''}`);
  return id.correspond(prior, found.targets, stopSet(nextTrip));
}

// ---------------------------------------------------------------------------
// The parser (§3.1), and mutations 15a / 15b's dedicated fixtures.

test('the op: parser reads the scheduler grammar, and ordinal is 1 only when no :k suffix exists', () => {
  const plain = id.identityTargetFor(opBlock({ stopKey: 'b', dayOffset: 2, slot: 'half' }));
  assert.deepStrictEqual(plain, {
    ok: true,
    kind: 'open',
    stopKey: 'b',
    address: { dayOffset: 2, ordinal: 1, slot: 'half' },
    blockId: 'op:b:d2',
    key: plain.key
  });
  const second = id.identityTargetFor(opBlock({ stopKey: 'b', dayOffset: 2, ordinal: 3, slot: 'half' }));
  assert.deepStrictEqual(second.address, { dayOffset: 2, ordinal: 3, slot: 'half' });
  assert.equal(second.blockId, 'op:b:d2:3');
  // A stop key containing the delimiter still parses, because the suffix is read from the
  // right; the anchor cross-check is what makes that safe.
  const odd = id.identityTargetFor({ ...opBlock({ stopKey: 'x', dayOffset: 0 }), id: 'op:a:b:d0', anchor: { stopId: 'a:b', contentId: null } });
  assert.equal(odd.ok, true);
  assert.equal(odd.stopKey, 'a:b');
});

test('mutation 15a fixture: a malformed suffix fails by name and never defaults ordinal to 1', () => {
  for (const [badId, reason] of [
    ['op:b:d2:', 'op_id_malformed'],
    ['op:b:d2:x', 'op_id_malformed'],
    ['op:b:d2:1', 'op_id_ordinal_invalid'],
    ['op:b:d2:0', 'op_id_ordinal_invalid'],
    ['op:b:d2:02', 'op_id_ordinal_invalid'],
    ['op:b:dx', 'op_id_malformed'],
    ['op:b:d-1', 'op_id_malformed'],
    ['op::d0', 'op_id_malformed']
  ]) {
    const block = { ...opBlock({ stopKey: 'b', dayOffset: 2 }), id: badId };
    const result = id.identityTargetFor(block);
    assert.equal(result.ok, false, `${badId} must not parse`);
    assert.equal(result.reason, reason, `${badId}`);
  }
});

test('mutation 15b fixture: an anchor mismatch fails by name, for both minting shapes', () => {
  const op = id.identityTargetFor({ ...opBlock({ stopKey: 'b', dayOffset: 0 }), anchor: { stopId: 'c', contentId: null } });
  assert.equal(op.ok, false);
  assert.equal(op.reason, 'op_id_stop_mismatch');
  assert.deepStrictEqual(op.detail, { blockId: 'op:b:d0', parsed: 'b', anchorStopId: 'c' });

  const ex = id.identityTargetFor({ ...excursionSiteBlock({ stopKey: 'b', excursionPlaceId: 'site_a' }), anchor: { stopId: 'c', contentId: null } });
  assert.equal(ex.ok, false);
  assert.equal(ex.reason, 'excursion_id_stop_mismatch');
});

test('the minting surface: op: and ex:…:site mint, everything else mints nothing', () => {
  assert.equal(id.identityTargetFor(travelBlock('a', 'b')), null);
  assert.equal(id.identityTargetFor(restBlock(4)), null);
  assert.equal(id.identityTargetFor({ id: 'day:d3', anchor: { stopId: 'b' } }), null);
  const out = { ...excursionSiteBlock({ stopKey: 'b', excursionPlaceId: 'site_a' }), id: 'ex:b:site_a:out' };
  const back = { ...out, id: 'ex:b:site_a:back' };
  assert.equal(id.identityTargetFor(out), null, 'an excursion outbound leg is transport');
  assert.equal(id.identityTargetFor(back), null, 'an excursion return leg is transport');
  const site = id.identityTargetFor(excursionSiteBlock({ stopKey: 'b', excursionPlaceId: 'site_a' }));
  assert.equal(site.kind, 'excursion');
  assert.deepStrictEqual(site.address, { excursionPlaceId: 'site_a' });
  // Mutation 17: an ex:…:site parsed as an op: block would give it an open address.
  assert.equal(Object.keys(site.address).join(','), 'excursionPlaceId');
  const malformed = id.identityTargetFor({ ...out, id: 'ex:b:site_a:middle' });
  assert.equal(malformed.ok, false);
  assert.equal(malformed.reason, 'excursion_id_malformed');
});

// ---------------------------------------------------------------------------
// Test 19 — the two offset definitions agree, over op: blocks only.

test('test 19: the parsed dayOffset and slot agree with blockContext over every op: block of every family, and only those', () => {
  let checked = 0;
  for (const family of ['nyc-single-base', 'peru', 'japan-tokyo-single-base', 'japan-multi-stop', 'eastern-canada-reversible']) {
    const trip = buildFamily(family);
    assert.ok(trip, `${family} must build`);
    const found = id.qualifyingTargets(trip, { data: PILOT_DATA });
    assert.equal(found.ok, true, `${family}: ${found.reason ?? ''}`);
    for (const target of found.targets) {
      if (target.kind !== 'open') continue;
      // fill.js's OWN definition, computed from the trip rather than parsed from the id.
      const context = blockContext(trip, target.block);
      assert.equal(target.address.dayOffset, context.dayOffset, `${family} ${target.blockId}: dayOffset`);
      assert.equal(target.address.slot, context.slot, `${family} ${target.blockId}: slot`);
      checked += 1;
    }
    // tr:, rest: and ex: are excluded by construction: a rest block carries
    // anchor.stopId null (schedule.js:427) and blockContext can throw on it.
    const excluded = trip.days.flatMap((d) => d.blocks).filter((b) => !b.id.startsWith('op:'));
    for (const block of excluded) {
      const target = id.identityTargetFor(block);
      assert.ok(target === null || target.kind === 'excursion', `${block.id} must not be read as an op: block`);
    }
  }
  assert.ok(checked >= 30, `the cross-check must cover a real surface, covered ${checked}`);
});



// ---------------------------------------------------------------------------
// Tests 1-6 — the six governing cases of D-A §5.5.

test('test 1 (case 1): a night added to a middle stop keeps every exact match live, issues one new luid, and leaves the later stop untouched', () => {
  const stops = ['a', 'b', 'c'];
  const before = synthTrip({
    stops,
    days: [
      [travelBlock('origin', 'a')], [opBlock({ stopKey: 'a', dayOffset: 0, slot: 'half' })], [opBlock({ stopKey: 'a', dayOffset: 1 })],
      [travelBlock('a', 'b')], [opBlock({ stopKey: 'b', dayOffset: 0, slot: 'half' })], [opBlock({ stopKey: 'b', dayOffset: 1 })], [opBlock({ stopKey: 'b', dayOffset: 2 })],
      [travelBlock('b', 'c')], [opBlock({ stopKey: 'c', dayOffset: 0, slot: 'half' })], [opBlock({ stopKey: 'c', dayOffset: 1 })]
    ]
  });
  const seeded = id.initialiseIdentityForBuild(before, { data: PILOT_DATA, tokens: countingTokens('p').env });
  assert.equal(seeded.ok, true);
  const prior = { ...before, identity: seeded.identity };

  // B gains a fourth day; everything else is identical.
  const after = synthTrip({
    stops,
    days: [
      ...before.days.slice(0, 7).map((d) => d.blocks),
      [opBlock({ stopKey: 'b', dayOffset: 3 })],
      ...before.days.slice(7).map((d) => d.blocks)
    ]
  });

  const tokens = countingTokens('n');
  const committed = id.commitIdentity({ currentTrip: prior, nextTrip: after, data: PILOT_DATA, tokens: tokens.env });
  assert.equal(committed.ok, true, committed.reason);

  // The complete effect: every prior luid is still live at its own address, and exactly
  // one new luid exists, at the new address.
  assert.deepStrictEqual(states(committed.identity), {
    p1: 'live', p2: 'live', p3: 'live', p4: 'live', p5: 'live', p6: 'live', p7: 'live', n1: 'live'
  });
  assert.deepStrictEqual(addresses(committed.identity).p1, { dayOffset: 0, ordinal: 1, slot: 'half' });
  assert.deepStrictEqual(addresses(committed.identity).n1, { dayOffset: 3, ordinal: 1, slot: 'full' });
  assert.deepStrictEqual(committed.identity.used, ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'n1']);
  assert.equal(tokens.calls, 1, 'exactly one token was generated, for the one new window');
  // C's placements kept their own offsets, which are relative to C's own arrival.
  const cPlacements = Object.entries(committed.identity.blocks).filter(([, p]) => p.stopKey === 'c');
  assert.deepStrictEqual(cPlacements.map(([, p]) => p.address), [
    { dayOffset: 0, ordinal: 1, slot: 'half' },
    { dayOffset: 1, ordinal: 1, slot: 'full' }
  ]);
});

test('test 2 (case 2): a mid-route optional stop issues new luids and no existing placement can match one of its windows', () => {
  const before = synthTrip({
    stops: ['a', 'b'],
    days: [[travelBlock('origin', 'a')], [opBlock({ stopKey: 'a', dayOffset: 0 })], [travelBlock('a', 'b')], [opBlock({ stopKey: 'b', dayOffset: 0 })]]
  });
  const seeded = id.initialiseIdentityForBuild(before, { data: PILOT_DATA, tokens: countingTokens('p').env });
  const prior = { ...before, identity: seeded.identity };

  // X is inserted between A and B, with an address that is identical EXCEPT for its stop.
  const after = synthTrip({
    stops: ['a', 'x', 'b'],
    days: [
      [travelBlock('origin', 'a')], [opBlock({ stopKey: 'a', dayOffset: 0 })],
      [travelBlock('a', 'x')], [opBlock({ stopKey: 'x', dayOffset: 0 })],
      [travelBlock('x', 'b')], [opBlock({ stopKey: 'b', dayOffset: 0 })]
    ]
  });
  const committed = id.commitIdentity({ currentTrip: prior, nextTrip: after, data: PILOT_DATA, tokens: countingTokens('n').env });
  assert.equal(committed.ok, true, committed.reason);
  assert.deepStrictEqual(states(committed.identity), { p1: 'live', p2: 'live', n1: 'live' });
  // The proof that a match requires the same stopKey: X's window has A's exact address.
  assert.deepStrictEqual(committed.identity.blocks.n1, {
    stopKey: 'x', kind: 'open', address: { dayOffset: 0, ordinal: 1, slot: 'full' }, state: 'live'
  });
  assert.equal(committed.identity.blocks.p1.stopKey, 'a');
});

test('test 3 (case 3): add then remove an excursion — the displaced pin returns to live with its edit intact, and a dismissed one does not', () => {
  // B has three windows. Adding the excursion reshapes d1 from full to half.
  const windows = (d1Slot) => synthTrip({
    stops: ['b'],
    days: [
      [travelBlock('origin', 'b')],
      [opBlock({ stopKey: 'b', dayOffset: 0, slot: 'half' })],
      [opBlock({ stopKey: 'b', dayOffset: 1, slot: d1Slot })],
      [opBlock({ stopKey: 'b', dayOffset: 2 })]
    ]
  });
  const before = windows('full');
  const prior = {
    ...before,
    identity: map({
      used: ['b6', 'b7', 'b8'],
      blocks: {
        b6: livePlacement('b', 0, 1, 'half'),
        b7: livePlacement('b', 1, 1, 'full'),
        b8: livePlacement('b', 2, 1, 'full')
      },
      edits: {
        b7: { intent: 'pin', contentId: 'teotihuacan', locked: true, userEdited: true, provenance: 'pinActivity' },
        b8: { intent: 'pin', contentId: 'other', locked: true, userEdited: true, provenance: 'pinActivity' }
      }
    })
  };

  // E added: d1 becomes half.
  const reshaped = windows('half');
  const step1 = id.commitIdentity({ currentTrip: prior, nextTrip: reshaped, data: PILOT_DATA, tokens: countingTokens('e').env });
  assert.equal(step1.ok, true, step1.reason);
  assert.deepStrictEqual(states(step1.identity), { b6: 'live', b7: 'displaced', b8: 'live', e1: 'live' });
  // Its address is NOT rewritten on displacement — that is what lets it recover.
  assert.deepStrictEqual(step1.identity.blocks.b7.address, { dayOffset: 1, ordinal: 1, slot: 'full' });
  assert.deepStrictEqual(step1.identity.edits.b7, prior.identity.edits.b7, 'the displaced edit is retained verbatim');

  // E removed: d1 full returns, and b7 is in the domain because displaced is retained.
  const restored = { ...reshaped, identity: step1.identity };
  const step2 = id.commitIdentity({ currentTrip: restored, nextTrip: windows('full'), data: PILOT_DATA, tokens: countingTokens('z').env });
  assert.equal(step2.ok, true, step2.reason);
  assert.deepStrictEqual(states(step2.identity), { b6: 'live', b7: 'live', b8: 'live', e1: 'displaced' });
  assert.deepStrictEqual(step2.identity.edits.b7, prior.identity.edits.b7, 'the pin is intact');

  // PAIRED CONTROL: a dismissed placement is terminal and does not recover.
  const dismissed = {
    ...reshaped,
    identity: { ...step1.identity, blocks: { ...step1.identity.blocks, b7: { ...step1.identity.blocks.b7, state: 'dismissed' } } }
  };
  const step3 = id.commitIdentity({ currentTrip: dismissed, nextTrip: windows('full'), data: PILOT_DATA, tokens: countingTokens('y').env });
  assert.equal(step3.ok, true, step3.reason);
  assert.equal(step3.identity.blocks.b7.state, 'dismissed', 'a dismissed placement never reclaims its address');
  assert.equal(step3.identity.blocks.y1.state, 'live', 'the returning window received a NEW luid');
  assert.deepStrictEqual(step3.identity.blocks.y1.address, { dayOffset: 1, ordinal: 1, slot: 'full' });
});

test('test 5 (case 5): across two previews, an apply, an undo and a second apply, no luid is issued twice', () => {
  const base = synthTrip({ stops: ['a'], days: [[travelBlock('origin', 'a')], [opBlock({ stopKey: 'a', dayOffset: 0 })]] });
  const seeded = id.initialiseIdentityForBuild(base, { data: PILOT_DATA, tokens: countingTokens('s').env });
  const trip0 = { ...base, identity: seeded.identity };

  const grown = synthTrip({ stops: ['a'], days: [[travelBlock('origin', 'a')], [opBlock({ stopKey: 'a', dayOffset: 0 })], [opBlock({ stopKey: 'a', dayOffset: 1 })]] });
  const tokens = countingTokens('q');
  const applyQ = id.commitIdentity({ currentTrip: trip0, nextTrip: grown, data: PILOT_DATA, tokens: tokens.env });
  assert.equal(applyQ.ok, true);
  assert.deepStrictEqual(applyQ.identity.used, ['s1', 'q1']);

  // Undo: blocks and edits rewind with the snapshot, `used` unions and keeps q1.
  const undone = id.undoIdentity(trip0, { ...grown, identity: applyQ.identity });
  assert.equal(undone.ok, true);
  assert.deepStrictEqual(undone.identity.used, ['s1', 'q1'], 'the issued token survives the undo');
  assert.deepStrictEqual(Object.keys(undone.identity.blocks), ['s1'], 'blocks rewound');

  // Apply P from the restored trip: it must NOT receive q1.
  const applyP = id.commitIdentity({ currentTrip: { ...base, identity: undone.identity }, nextTrip: grown, data: PILOT_DATA, tokens: tokens.env });
  assert.equal(applyP.ok, true);
  assert.deepStrictEqual(applyP.identity.used, ['s1', 'q1', 'q2']);
  const fresh = Object.keys(applyP.identity.blocks).filter((k) => k !== 's1');
  assert.deepStrictEqual(fresh, ['q2'], 'P received a different token');
});

test('test 6 (case 6): when a stop is gone every placement there is orphaned, edits retained, never reattached', () => {
  const before = synthTrip({
    stops: ['a', 'b'],
    days: [[travelBlock('origin', 'a')], [opBlock({ stopKey: 'a', dayOffset: 0 })], [travelBlock('a', 'b')], [opBlock({ stopKey: 'b', dayOffset: 0 })]]
  });
  const prior = {
    ...before,
    identity: map({
      used: ['x1', 'x2'],
      blocks: { x1: livePlacement('a', 0, 1, 'full'), x2: livePlacement('b', 0, 1, 'full') },
      edits: { x2: { intent: 'pin', contentId: 'c', locked: true, userEdited: true, provenance: 'pinActivity' } }
    })
  };
  const after = synthTrip({ stops: ['a'], days: [[travelBlock('origin', 'a')], [opBlock({ stopKey: 'a', dayOffset: 0 })]] });
  const committed = id.commitIdentity({ currentTrip: prior, nextTrip: after, data: PILOT_DATA, tokens: countingTokens('n').env });
  assert.equal(committed.ok, true, committed.reason);
  assert.deepStrictEqual(states(committed.identity), { x1: 'live', x2: 'orphaned' });
  assert.deepStrictEqual(committed.identity.edits.x2, prior.identity.edits.x2);

  // PAIRED CONTROL: the same missing address with the stop still present is displaced,
  // not orphaned — the distinction is the stop, not the window.
  const stopKept = synthTrip({
    stops: ['a', 'b'],
    days: [[travelBlock('origin', 'a')], [opBlock({ stopKey: 'a', dayOffset: 0 })], [travelBlock('a', 'b')]]
  });
  const kept = id.commitIdentity({ currentTrip: prior, nextTrip: stopKept, data: PILOT_DATA, tokens: countingTokens('m').env });
  assert.equal(kept.ok, true, kept.reason);
  assert.equal(kept.identity.blocks.x2.state, 'displaced');
});

// ---------------------------------------------------------------------------
// Test 7 — §5.4's two-pin counterexample, worked with every affected identity.

test('test 7: the two-pin counterexample — the survivor keeps its id, the displaced pin is flagged, and no offer points at an occupied window', () => {
  const windows = (d1Slot) => synthTrip({
    stops: ['b'],
    days: [
      [travelBlock('origin', 'b')],
      [opBlock({ stopKey: 'b', dayOffset: 0, slot: 'half', placeId: 'p_b', contentId: 'unedited' })],
      [opBlock({ stopKey: 'b', dayOffset: 1, slot: d1Slot, placeId: 'p_b' })],
      [opBlock({ stopKey: 'b', dayOffset: 2, placeId: 'p_b', contentId: 'other_pin', locked: true, userEdited: true })]
    ]
  });
  const prior = {
    ...windows('full'),
    identity: map({
      used: ['b6', 'b7', 'b8'],
      blocks: { b6: livePlacement('b', 0, 1, 'half'), b7: livePlacement('b', 1, 1, 'full'), b8: livePlacement('b', 2, 1, 'full') },
      edits: {
        b7: { intent: 'pin', contentId: 'teotihuacan', locked: true, userEdited: true, provenance: 'pinActivity' },
        b8: { intent: 'pin', contentId: 'other_pin', locked: true, userEdited: true, provenance: 'pinActivity' }
      }
    })
  };
  const reshaped = windows('half');
  const committed = id.commitIdentity({ currentTrip: prior, nextTrip: reshaped, data: PILOT_DATA, tokens: countingTokens('e').env });
  assert.equal(committed.ok, true, committed.reason);
  assert.deepStrictEqual(states(committed.identity), { b6: 'live', b7: 'displaced', b8: 'live', e1: 'live' });
  assert.deepStrictEqual(committed.identity.blocks.b8.address, { dayOffset: 2, ordinal: 1, slot: 'full' }, 'the survivor keeps its own address');

  // No offer may point at d2, which b8 holds and has pinned.
  const withMap = { ...reshaped, identity: committed.identity };
  const offers = id.relocationOffers(withMap, 'b7', { data: PILOT_DATA, content: PILOT_CONTENT });
  assert.equal(offers.ok, true, offers.reason);
  assert.equal(offers.offers.some((o) => o.luid === 'b8'), false, 'the occupied, pinned window is never offered');
  for (const offer of offers.offers) {
    assert.equal(committed.identity.edits[offer.luid], undefined, 'no offered window carries an edit of its own');
  }
});

// ---------------------------------------------------------------------------
// Tests 14, 15 — §5.1's two ambiguity rules, and mutations 1, 2, 3.

test('test 14 (case A): the established holder keeps the window, the dormant claimant is retired, and a SECOND rebuild does not displace the holder again', () => {
  const trip = synthTrip({ stops: ['b'], days: [[travelBlock('origin', 'b')], [opBlock({ stopKey: 'b', dayOffset: 0 })]] });
  const contested = map({
    used: ['holder', 'claimant'],
    blocks: {
      holder: livePlacement('b', 0, 1, 'full'),
      claimant: { ...livePlacement('b', 0, 1, 'full'), state: 'displaced' }
    },
    edits: {
      holder: { intent: 'pin', contentId: 'h', locked: true, userEdited: true, provenance: 'pinActivity' },
      claimant: { intent: 'pin', contentId: 'c', locked: true, userEdited: true, provenance: 'pinActivity' }
    }
  });

  const first = id.commitIdentity({ currentTrip: { ...trip, identity: contested }, nextTrip: trip, data: PILOT_DATA, tokens: countingTokens('n').env });
  assert.equal(first.ok, true, first.reason);
  assert.deepStrictEqual(states(first.identity), { holder: 'live', claimant: 'retired' });
  assert.deepStrictEqual(first.identity.edits.claimant, contested.edits.claimant, 'the retired claimant keeps its edit');
  assert.deepStrictEqual(first.identity.used, ['holder', 'claimant'], 'no token was issued for a matched window');

  // The second rebuild is the whole point: retired is terminal, so nothing contests again.
  const second = id.commitIdentity({ currentTrip: { ...trip, identity: first.identity }, nextTrip: trip, data: PILOT_DATA, tokens: countingTokens('m').env });
  assert.equal(second.ok, true, second.reason);
  assert.deepStrictEqual(states(second.identity), { holder: 'live', claimant: 'retired' });
  assert.deepStrictEqual(second.identity.blocks.holder, first.identity.blocks.holder, 'the holder was not displaced again');
});

test('test 15 (case B): a genuine tie refuses the apply whole, names both edits, and retains the current trip unchanged', () => {
  const trip = synthTrip({ stops: ['b'], days: [[travelBlock('origin', 'b')], [opBlock({ stopKey: 'b', dayOffset: 0 })]] });
  const tie = map({
    used: ['one', 'two'],
    blocks: {
      one: { ...livePlacement('b', 0, 1, 'full'), state: 'displaced' },
      two: { ...livePlacement('b', 0, 1, 'full'), state: 'displaced' }
    },
    edits: {
      one: { intent: 'pin', contentId: 'a', locked: true, userEdited: true, provenance: 'pinActivity' },
      two: { intent: 'pin', contentId: 'b', locked: true, userEdited: true, provenance: 'pinActivity' }
    }
  });
  const current = { ...trip, identity: tie };
  const snapshot = clone(current);
  const tokens = countingTokens('n');

  const refused = id.commitIdentity({ currentTrip: current, nextTrip: trip, data: PILOT_DATA, tokens: tokens.env });
  assert.equal(refused.ok, false);
  assert.equal(refused.reason, 'address_tie');
  assert.deepStrictEqual(refused.detail.conflicting.sort(), ['one', 'two']);
  assert.deepStrictEqual(refused.detail.address, { dayOffset: 0, ordinal: 1, slot: 'full' });
  assert.deepStrictEqual(current, snapshot, 'the current trip, map included, is exactly as it was');
  assert.equal(tokens.calls, 0, 'a phase-1 abort makes zero token-source calls');

  // PAIRED CONTROL: one established holder among the same claimants resolves as case A.
  const resolvable = { ...current, identity: { ...tie, blocks: { ...tie.blocks, one: livePlacement('b', 0, 1, 'full') } } };
  const landed = id.commitIdentity({ currentTrip: resolvable, nextTrip: trip, data: PILOT_DATA, tokens: countingTokens('m').env });
  assert.equal(landed.ok, true, landed.reason);
  assert.deepStrictEqual(states(landed.identity), { one: 'live', two: 'retired' });
});

test('mutation 1 guard: correspondence never falls back to a nearest window — an off-by-one offset does not match', () => {
  const trip = synthTrip({ stops: ['b'], days: [[travelBlock('origin', 'b')], [opBlock({ stopKey: 'b', dayOffset: 1 })]] });
  const prior = { ...trip, identity: map({ used: ['x'], blocks: { x: livePlacement('b', 0, 1, 'full') }, edits: {} }) };
  const committed = id.commitIdentity({ currentTrip: prior, nextTrip: trip, data: PILOT_DATA, tokens: countingTokens('n').env });
  assert.equal(committed.ok, true, committed.reason);
  assert.equal(committed.identity.blocks.x.state, 'displaced', 'd0 does not match d1');
  assert.equal(committed.identity.blocks.n1.state, 'live');
  // PAIRED CONTROL: the exact address does match.
  const exact = { ...trip, identity: map({ used: ['x'], blocks: { x: livePlacement('b', 1, 1, 'full') }, edits: {} }) };
  const matched = id.commitIdentity({ currentTrip: exact, nextTrip: trip, data: PILOT_DATA, tokens: countingTokens('m').env });
  assert.deepStrictEqual(states(matched.identity), { x: 'live' });
});

// ---------------------------------------------------------------------------
// Test 18 — ordinal re-numbering. EXPLICITLY A SYNTHETIC ADVERSARIAL CASE.
//
// D-A §2 records the `:k` branch as unreached in the current scheduler's observed output,
// and the cross-check in test 19 above confirms no family produces a second gap on one
// day. So this is constructed, and is NOT described as measured pilot behaviour.

test('test 18 (synthetic, not producer-reproduced): ordinal re-numbering moves a placement to displaced, never onto its neighbour', () => {
  const two = synthTrip({
    stops: ['b'],
    days: [[travelBlock('origin', 'b')], [opBlock({ stopKey: 'b', dayOffset: 0, slot: 'half' }), opBlock({ stopKey: 'b', dayOffset: 0, ordinal: 2, slot: 'short' })]]
  });
  const prior = {
    ...two,
    identity: map({
      used: ['first', 'second'],
      blocks: { first: livePlacement('b', 0, 1, 'half'), second: livePlacement('b', 0, 2, 'short') },
      edits: { second: { intent: 'pin', contentId: 'late', locked: true, userEdited: true, provenance: 'pinActivity' } }
    })
  };
  // The second gap disappears, so only ordinal 1 remains.
  const one = synthTrip({ stops: ['b'], days: [[travelBlock('origin', 'b')], [opBlock({ stopKey: 'b', dayOffset: 0, slot: 'half' })]] });
  const committed = id.commitIdentity({ currentTrip: prior, nextTrip: one, data: PILOT_DATA, tokens: countingTokens('n').env });
  assert.equal(committed.ok, true, committed.reason);
  assert.deepStrictEqual(states(committed.identity), { first: 'live', second: 'displaced' });
  assert.deepStrictEqual(committed.identity.blocks.second.address, { dayOffset: 0, ordinal: 2, slot: 'short' }, 'the address is untouched by displacement');
  assert.deepStrictEqual(committed.identity.edits.second, prior.identity.edits.second);
});

// ---------------------------------------------------------------------------
// Test 10 — the Niagara reversal, THROUGH THE REAL PRODUCER.

/**
 * One direction of a real compiled variant, built and filled through the engine's own
 * producer path: `buildTripFromRoutePlan` is the structural producer `restructure.js`
 * itself calls, and `reconcile` is what fills and validates a skeleton. Nothing here is
 * fabricated; only the variant is named rather than ranked.
 */
function realVariantTrip(variantId, totalDays) {
  const pkg = findRoutePackage(PILOT_DATA, variantId);
  assert.ok(pkg, `the compiled variant ${variantId} must exist`);
  const plan = { variantId, stops: pkg.stops.map((s) => ({ key: s.id, nights: s.minNights })), nightsSource: 'package' };
  const skeleton = buildTripFromRoutePlan({ ...spec('CA', totalDays), routeTemplateId: variantId }, plan, PILOT_DATA, { reviewPolicy: 'allow_drafts' });
  assert.notEqual(skeleton.ok, false, `${variantId} must schedule at ${totalDays} days`);
  return rs.reconcile(skeleton, skeleton, PILOT_CONTENT).trip;
}

test('test 10: the Niagara 8-day reversal, THROUGH THE REAL PRODUCER — every stopKey survives, the full-to-half placement is displaced with its address and edit intact, and nothing collapses onto one window', () => {
  const FORWARD = 'ec_corridor#west_to_east+niagara@toronto_spur';
  const REVERSED = 'ec_corridor#east_to_west+niagara@toronto_spur';
  const forward = realVariantTrip(FORWARD, 8);
  const reversed = realVariantTrip(REVERSED, 8);

  // The measured fact D-A §5.4 case 4 records, reproduced here rather than asserted by
  // comment: ec_toronto_hub keeps its stop and its d0 offset, and its slot class changes.
  const addressesOf = (trip) => {
    const found = id.qualifyingTargets(trip, { data: PILOT_DATA });
    assert.equal(found.ok, true, found.reason);
    return found.targets.map((t) => `${t.stopKey}|d${t.address.dayOffset}|${t.address.slot}`);
  };
  const before = addressesOf(forward);
  const after = addressesOf(reversed);
  assert.ok(before.includes('ec_toronto_hub|d0|full'), `forward must hold the full window: ${before.join(' ')}`);
  assert.ok(after.includes('ec_toronto_hub|d0|half'), `reversed must reshape it to half: ${after.join(' ')}`);
  assert.deepStrictEqual(
    new Set(forward.routePlan.stops.map((s) => s.key)),
    new Set(reversed.routePlan.stops.map((s) => s.key)),
    'every stopKey survives the reversal'
  );

  const seeded = id.initialiseIdentityForBuild(forward, { data: PILOT_DATA, tokens: countingTokens('f').env });
  assert.equal(seeded.ok, true, seeded.reason);
  const withMap = { ...forward, identity: seeded.identity };
  const committed = id.commitIdentity({ currentTrip: withMap, nextTrip: reversed, data: PILOT_DATA, tokens: countingTokens('n').env });
  assert.equal(committed.ok, true, `${committed.reason ?? ''} ${JSON.stringify(committed.detail ?? {})}`);

  // THE COMPLETE EFFECT. Every prior placement takes exactly the state its own exact
  // address dictates, and because every stop survives, no placement is orphaned.
  const nextKeys = new Set(id.qualifyingTargets(reversed, { data: PILOT_DATA }).targets.map((t) => t.key));
  const expected = {};
  for (const [luid, placement] of Object.entries(seeded.identity.blocks)) {
    expected[luid] = nextKeys.has(id.placementKey(placement)) ? 'live' : 'displaced';
  }
  const priorStates = Object.fromEntries(Object.entries(states(committed.identity)).filter(([luid]) => luid in seeded.identity.blocks));
  assert.deepStrictEqual(priorStates, expected);
  assert.equal(Object.values(expected).filter((s) => s === 'displaced').length, 2, 'exactly the two reshaped windows are displaced');

  // The reshaped placement specifically: displaced, address untouched, edit retained.
  const hubLuid = Object.entries(seeded.identity.blocks).find(([, p]) => p.stopKey === 'ec_toronto_hub' && p.address.dayOffset === 0)[0];
  assert.equal(committed.identity.blocks[hubLuid].state, 'displaced');
  assert.deepStrictEqual(committed.identity.blocks[hubLuid].address, { dayOffset: 0, ordinal: 1, slot: 'full' }, 'the address is NOT rewritten on displacement');

  // Two placements never collapse onto one window, and the result is a valid map.
  const liveKeys = Object.values(committed.identity.blocks).filter((p) => p.state === 'live').map(id.placementKey);
  assert.equal(new Set(liveKeys).size, liveKeys.length, 'no two live placements share an address');
  assert.deepStrictEqual(id.validateIdentity(reversed, committed.identity, { data: PILOT_DATA }), { ok: true });
});

// ---------------------------------------------------------------------------
// Tests 9, 12, 13 and T-P1-T-P4 — the phases and the token contract.

test('test 12: a proposal that ADDS a block passes provisional validation, is issued, and commits — the case revision 4 ordering would have rejected (mutation 4)', () => {
  const before = synthTrip({ stops: ['a'], days: [[travelBlock('origin', 'a')], [opBlock({ stopKey: 'a', dayOffset: 0 })]] });
  const seeded = id.initialiseIdentityForBuild(before, { data: PILOT_DATA, tokens: countingTokens('p').env });
  const prior = { ...before, identity: seeded.identity };
  const after = synthTrip({ stops: ['a'], days: [[travelBlock('origin', 'a')], [opBlock({ stopKey: 'a', dayOffset: 0 })], [opBlock({ stopKey: 'a', dayOffset: 1 })]] });

  // The allocation carries a provisional key, which is NOT in any registry and cannot be.
  const allocation = id.allocateIdentity(prior, after, { data: PILOT_DATA });
  assert.equal(allocation.ok, true);
  assert.deepStrictEqual(Object.keys(allocation.identity.blocks).filter(id.isProvisionalKey), ['#new1']);
  assert.equal(allocation.identity.used.includes('#new1'), false, 'a provisional key never enters used');

  const committed = id.commitIdentity({ currentTrip: prior, nextTrip: after, data: PILOT_DATA, tokens: countingTokens('n').env, allocation: allocation.identity });
  assert.equal(committed.ok, true, `${committed.reason ?? ''} ${JSON.stringify(committed.detail ?? {})}`);
  assert.deepStrictEqual(states(committed.identity), { p1: 'live', n1: 'live' });
  assert.deepStrictEqual(committed.identity.used, ['p1', 'n1']);
});

test('test 13: apply with an incomplete map is refused on coverage in phase 3, and nothing is installed', () => {
  const trip = synthTrip({ stops: ['a'], days: [[travelBlock('origin', 'a')], [opBlock({ stopKey: 'a', dayOffset: 0 })], [opBlock({ stopKey: 'a', dayOffset: 1 })]] });
  // A map that is internally consistent but covers only one of the two windows, and
  // claims BOTH are already issued so no minting can repair it.
  const incomplete = map({ used: ['only'], blocks: { only: livePlacement('a', 0, 1, 'full') }, edits: {} });
  const current = { ...trip, identity: incomplete };
  const snapshot = clone(current);
  // Driven through validateIdentity, which is exactly what phase 3 runs.
  const result = id.validateIdentity(trip, incomplete, { data: PILOT_DATA });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'coverage_target_uncovered');
  assert.equal(result.detail.blockId, 'op:a:d1');
  assert.deepStrictEqual(current, snapshot);

  // PAIRED CONTROL: the complete map over the same build passes.
  const complete = map({ used: ['only', 'second'], blocks: { only: livePlacement('a', 0, 1, 'full'), second: livePlacement('a', 1, 1, 'full') }, edits: {} });
  assert.deepStrictEqual(id.validateIdentity(trip, complete, { data: PILOT_DATA }), { ok: true });
});

test('test 9: a constant token source yields distinct luids via remint or refuses whole — never a duplicate, never a partial install', () => {
  const before = synthTrip({ stops: ['a'], days: [[travelBlock('origin', 'a')]] });
  const after = synthTrip({ stops: ['a'], days: [[travelBlock('origin', 'a')], [opBlock({ stopKey: 'a', dayOffset: 0 })], [opBlock({ stopKey: 'a', dayOffset: 1 })]] });
  const prior = { ...before, identity: map({ used: [], blocks: {}, edits: {} }) };

  // Truly constant: the first issuance succeeds, the second can never clear the registry.
  const constant = constantTokens('same');
  const refused = id.commitIdentity({ currentTrip: prior, nextTrip: after, data: PILOT_DATA, tokens: constant.env });
  assert.equal(refused.ok, false);
  assert.equal(refused.reason, 'token_exhausted');
  assert.equal(refused.detail.attempts, 8);
  assert.ok(constant.calls > 1, 'it really did remint rather than accept the collision');
  assert.deepStrictEqual(prior.identity, { version: 1, used: [], blocks: {}, edits: {} }, 'nothing partial was installed');

  // Constant once, then varying: remint recovers and both luids are distinct.
  const recovering = constantTokens('dup', 1);
  const landed = id.commitIdentity({ currentTrip: prior, nextTrip: after, data: PILOT_DATA, tokens: recovering.env });
  assert.equal(landed.ok, true, landed.reason);
  const issued = Object.keys(landed.identity.blocks);
  assert.equal(issued.length, 2);
  assert.equal(new Set(issued).size, 2, 'the two issued luids are distinct');
  assert.deepStrictEqual(landed.identity.used, issued);
});

test('T-P1: a phase-1 abort makes zero token-source calls and leaves the trip deep-equal to its pre-call value', () => {
  const trip = synthTrip({ stops: ['b'], days: [[travelBlock('origin', 'b')], [opBlock({ stopKey: 'b', dayOffset: 0 })], [opBlock({ stopKey: 'b', dayOffset: 1 })]] });
  const tie = map({
    used: ['one', 'two'],
    blocks: {
      one: { ...livePlacement('b', 0, 1, 'full'), state: 'displaced' },
      two: { ...livePlacement('b', 0, 1, 'full'), state: 'displaced' }
    },
    edits: {}
  });
  const current = { ...trip, identity: tie };
  const snapshot = clone(current);
  const tokens = countingTokens('n');
  const refused = id.commitIdentity({ currentTrip: current, nextTrip: trip, data: PILOT_DATA, tokens: tokens.env });
  assert.equal(refused.ok, false);
  assert.equal(refused.reason, 'address_tie');
  assert.equal(tokens.calls, 0);
  assert.deepStrictEqual(current, snapshot);

  // PAIRED CONTROL: the same build with no tie issues for the uncovered window.
  const clean = { ...trip, identity: map({ used: ['one'], blocks: { one: livePlacement('b', 0, 1, 'full') }, edits: {} }) };
  const landedTokens = countingTokens('m');
  const landed = id.commitIdentity({ currentTrip: clean, nextTrip: trip, data: PILOT_DATA, tokens: landedTokens.env });
  assert.equal(landed.ok, true, landed.reason);
  assert.equal(landedTokens.calls, 1, 'the control really does reach phase 2');
});

test('T-P2: a phase-3 failure after a REAL issuance attempt commits nothing — and token calls having occurred is not a failure', () => {
  // The proposal adds a new window AND the resulting build carries a separate defect: a
  // duplicate op: address, which no issuance can repair. So it cannot pass through a
  // no-issuance special case.
  const before = synthTrip({ stops: ['a'], days: [[travelBlock('origin', 'a')], [opBlock({ stopKey: 'a', dayOffset: 0 })]] });
  const prior = { ...before, identity: map({ used: ['p1'], blocks: { p1: livePlacement('a', 0, 1, 'full') }, edits: { p1: { intent: 'pin', contentId: 'c', locked: true, userEdited: true, provenance: 'pinActivity' } } }) };
  const snapshot = clone(prior);

  // Two blocks sharing one id/address, plus a genuinely new window.
  const defective = synthTrip({
    stops: ['a'],
    days: [
      [travelBlock('origin', 'a')],
      [opBlock({ stopKey: 'a', dayOffset: 0 })],
      [opBlock({ stopKey: 'a', dayOffset: 1 })],
      [opBlock({ stopKey: 'a', dayOffset: 1 })]
    ]
  });
  const tokens = countingTokens('n');
  const refused = id.commitIdentity({ currentTrip: prior, nextTrip: defective, data: PILOT_DATA, tokens: tokens.env });
  assert.equal(refused.ok, false);
  assert.equal(refused.reason, 'duplicate_target_address');
  assert.deepStrictEqual(prior, snapshot, 'trip, used, blocks, edits and history are unchanged');
  assert.equal(prior.identity.used.length, 1, 'no candidate became a committed issuance');

  // A defect reached only AFTER issuance: the completed result fails check 3, an edits key
  // naming no placement. Tokens are generated here, and that is explicitly not a failure.
  const sound = synthTrip({ stops: ['a'], days: [[travelBlock('origin', 'a')], [opBlock({ stopKey: 'a', dayOffset: 0 })], [opBlock({ stopKey: 'a', dayOffset: 1 })]] });
  const orphanEdit = { ...prior, identity: { ...prior.identity, edits: { ...prior.identity.edits, ghost: { intent: 'pin', contentId: 'x', locked: true, userEdited: true, provenance: 'pinActivity' } } } };
  const orphanSnapshot = clone(orphanEdit);
  const lateTokens = countingTokens('m');
  const lateRefused = id.commitIdentity({ currentTrip: orphanEdit, nextTrip: sound, data: PILOT_DATA, tokens: lateTokens.env });
  assert.equal(lateRefused.ok, false);
  assert.equal(lateRefused.reason, 'edit_without_placement');
  assert.equal(lateRefused.detail.luid, 'ghost');
  assert.ok(lateTokens.calls > 0, 'phase 2 really ran and generated a candidate');
  assert.deepStrictEqual(orphanEdit, orphanSnapshot, 'and still nothing was committed');
});

test('T-P3: no #new key survives anywhere after a successful commit, by exhaustive scan', () => {
  const before = synthTrip({ stops: ['a'], days: [[travelBlock('origin', 'a')]] });
  const after = synthTrip({
    stops: ['a'],
    days: [[travelBlock('origin', 'a')], [opBlock({ stopKey: 'a', dayOffset: 0 })], [opBlock({ stopKey: 'a', dayOffset: 1 })], [excursionSiteBlock({ stopKey: 'a', excursionPlaceId: 'site_z' })]]
  });
  const prior = { ...before, identity: map({ used: [], blocks: {}, edits: {} }) };
  const allocation = id.allocateIdentity(prior, after, { data: PILOT_DATA });
  assert.equal(allocation.ok, true);
  assert.equal(Object.keys(allocation.identity.blocks).filter(id.isProvisionalKey).length, 3);
  // The allocation also carries intent on a provisional key, which phase 2 must resolve.
  allocation.identity.edits['#new2'] = { intent: 'pin', contentId: 'c', locked: true, userEdited: true, provenance: 'seeded' };

  const committed = id.commitIdentity({ currentTrip: prior, nextTrip: after, data: PILOT_DATA, tokens: countingTokens('n').env, allocation: allocation.identity });
  assert.equal(committed.ok, true, `${committed.reason ?? ''} ${JSON.stringify(committed.detail ?? {})}`);
  const serialised = JSON.stringify(committed.identity);
  assert.equal(serialised.includes('#new'), false, `a provisional key survived: ${serialised}`);
  assert.deepStrictEqual(Object.keys(committed.identity.blocks), ['n1', 'n2', 'n3']);
  assert.deepStrictEqual(Object.keys(committed.identity.edits), ['n2'], 'the provisional intent followed its window to the issued luid');
  assert.equal(committed.identity.edits.n2.provenance, 'seeded');
});

test('T-P4: a map planted on the proposal trip with an unresolved provisional key does not reach the committed trip (mutation 7)', () => {
  // Driven on real producer output, because the planted map has to survive a real apply.
  const real = buildFamilyWithIdentity('peru');
  const realPreview = rs.previewAdjustNights(real, real.routePlan.stops[0].key, 1, { ...PREVIEW_OPTIONS, identity: true, data: PILOT_DATA });
  assert.equal(realPreview.ok, true, `${realPreview.why ?? ''}`);
  const proposal = realPreview.proposals[0];
  const planted = {
    ...proposal,
    trip: { ...proposal.trip, identity: { version: 1, used: ['#new1'], blocks: { '#new1': livePlacement('x', 9, 1, 'full') }, edits: {} } }
  };
  const applied = rs.applyProposal(real, planted);
  assert.equal(applied.ok, true, `${applied.reason ?? ''} ${JSON.stringify(applied.detail ?? {})}`);
  assert.equal(JSON.stringify(applied.trip.identity).includes('#new'), false, 'the planted provisional key did not reach the committed trip');
  assert.equal(applied.trip.identity.used.includes('#new1'), false);
  assert.deepStrictEqual(id.validateIdentity(applied.trip, applied.trip.identity, { data: PILOT_DATA }), { ok: true });

  // PAIRED CONTROL: WITHOUT the opt-in the same planted map rides through untouched, which
  // is exactly the pre-packet behaviour this packet must not change.
  const defaultPreview = rs.previewAdjustNights(real, real.routePlan.stops[0].key, 1, PREVIEW_OPTIONS);
  const defaultPlanted = { ...defaultPreview.proposals[0], trip: planted.trip };
  const defaultApplied = rs.applyProposal(real, defaultPlanted);
  assert.equal(defaultApplied.ok, true, defaultApplied.reason);
  assert.deepStrictEqual(defaultApplied.trip.identity, planted.trip.identity, 'the default path is unchanged: a spread is what it always was');
});

// ---------------------------------------------------------------------------
// T-V1-T-V3 — coverage, and mutations 5, 5b, 6.

test('T-V1: a real producer trip with tr:, rest: and excursion blocks validates with a map over its op: blocks and excursion site blocks only (mutation 6)', () => {
  const trip = buildFamily('peru');
  assert.ok(trip);
  const prefixes = new Set(trip.days.flatMap((d) => d.blocks).map((b) => b.id.split(':')[0]));
  assert.ok(prefixes.has('tr'), 'the fixture really contains travel blocks');
  assert.ok(prefixes.has('rest'), 'the fixture really contains a rest filler');
  assert.ok(prefixes.has('ex'), 'the fixture really contains excursion blocks');

  const seeded = id.initialiseIdentityForBuild(trip, { data: PILOT_DATA, tokens: countingTokens('p').env });
  assert.equal(seeded.ok, true, seeded.reason);
  assert.deepStrictEqual(id.validateIdentity(trip, seeded.identity, { data: PILOT_DATA }), { ok: true });

  // The map covers strictly fewer entries than the trip has blocks, and exactly the
  // minting surface — by SHAPE, not merely by count: an `op:` block must yield an `open`
  // placement with a three-part address, and an `ex:…:site` block an `excursion`
  // placement addressed by place. A count alone would not see the two confused.
  const allBlocks = trip.days.flatMap((d) => d.blocks);
  const minting = allBlocks.filter((b) => b.id.startsWith('op:') || /^ex:.+:site$/.test(b.id));
  assert.equal(Object.keys(seeded.identity.blocks).length, minting.length);
  assert.ok(minting.length < allBlocks.length, 'the minting surface is a strict subset');

  const byKind = {};
  for (const block of minting) {
    const target = id.identityTargetFor(block);
    assert.equal(target.ok, true, `${block.id}`);
    const expectedKind = block.id.startsWith('op:') ? 'open' : 'excursion';
    assert.equal(target.kind, expectedKind, `${block.id}: wrong kind`);
    assert.deepStrictEqual(
      Object.keys(target.address).sort(),
      expectedKind === 'open' ? ['dayOffset', 'ordinal', 'slot'] : ['excursionPlaceId'],
      `${block.id}: wrong address shape`
    );
    const placement = Object.values(seeded.identity.blocks).find((p) => id.placementKey(p) === target.key);
    assert.ok(placement, `${block.id}: no placement covers it`);
    assert.equal(placement.kind, expectedKind, `${block.id}: the placement records the wrong kind`);
    byKind[expectedKind] = (byKind[expectedKind] ?? 0) + 1;
  }
  assert.ok(byKind.open > 0 && byKind.excursion > 0, `the fixture must exercise both kinds: ${JSON.stringify(byKind)}`);
});

/** The two-window build T-V2 measures coverage against. */
const twoWindowTrip = () => synthTrip({
  stops: ['a'],
  days: [[travelBlock('origin', 'a')], [opBlock({ stopKey: 'a', dayOffset: 0 })], [opBlock({ stopKey: 'a', dayOffset: 1 })]]
});

test('T-V2(a): the SAME live-placement count with one wrong target address FAILS, with every other invariant intact (mutation 5)', () => {
  const trip = twoWindowTrip();
  const wrong = map({
    used: ['x', 'y'],
    blocks: { x: livePlacement('a', 0, 1, 'full'), y: livePlacement('a', 2, 1, 'full') },
    edits: {}
  });
  assert.equal(Object.keys(wrong.blocks).length, 2, 'the counts really are equal');
  assert.equal(id.qualifyingTargets(trip, { data: PILOT_DATA }).targets.length, 2, 'equal to the target count');
  // Addresses are unique, edits are empty, every key is registered: ONLY coverage fails.
  assert.equal(new Set(Object.values(wrong.blocks).map(id.placementKey)).size, 2);
  const failed = id.validateIdentity(trip, wrong, { data: PILOT_DATA });
  assert.equal(failed.ok, false, 'an equal count must not pass');
  assert.equal(failed.reason, 'coverage_target_uncovered');
  assert.equal(failed.detail.blockId, 'op:a:d1');
});

test('T-V2(b): a VALID map carrying retained displaced/retired entries BEYOND the live surface PASSES (mutation 5b)', () => {
  const trip = twoWindowTrip();
  const withHistory = map({
    used: ['x', 'y', 'old', 'gone', 'let_go', 'superseded'],
    blocks: {
      x: livePlacement('a', 0, 1, 'full'),
      y: livePlacement('a', 1, 1, 'full'),
      old: { ...livePlacement('a', 7, 1, 'full'), state: 'displaced' },
      gone: { ...livePlacement('z', 0, 1, 'full'), state: 'orphaned' },
      let_go: { ...livePlacement('a', 8, 1, 'half'), state: 'dismissed' },
      superseded: { ...livePlacement('a', 0, 1, 'full'), state: 'retired' }
    },
    edits: { old: { intent: 'pin', contentId: 'c', locked: true, userEdited: true, provenance: 'pinActivity' } }
  });
  assert.equal(Object.keys(withHistory.blocks).length, 6, 'the retained entries really outnumber the two-window live surface');
  assert.deepStrictEqual(id.validateIdentity(trip, withHistory, { data: PILOT_DATA }), { ok: true });
});

test('T-V2(c): an empty map on a build with NO block at all passes — the mutation 6 control', () => {
  // NO BLOCKS, deliberately: a build whose days are empty is unaffected by widening
  // coverage to every block, which is what makes it a genuine control for mutation 6. The
  // stronger case — blocks present but none of them qualifying — is T-V1's job, on real
  // producer output carrying tr:, rest: and excursion travel legs.
  const bare = synthTrip({ stops: ['a'], days: [[], []] });
  assert.equal(bare.days.flatMap((d) => d.blocks).length, 0, 'the build really has no block at all');
  assert.equal(id.qualifyingTargets(bare, { data: PILOT_DATA }).targets.length, 0);
  assert.deepStrictEqual(id.validateIdentity(bare, map({ used: [], blocks: {}, edits: {} }), { data: PILOT_DATA }), { ok: true });
});

test('T-V2(c2): a build whose blocks exist but none qualify also passes with an empty map', () => {
  const nonQualifying = synthTrip({ stops: ['a'], days: [[travelBlock('origin', 'a')], [restBlock(2)]] });
  assert.ok(nonQualifying.days.flatMap((d) => d.blocks).length > 0, 'blocks really are present');
  assert.equal(id.qualifyingTargets(nonQualifying, { data: PILOT_DATA }).targets.length, 0, 'and none of them qualifies');
  assert.deepStrictEqual(id.validateIdentity(nonQualifying, map({ used: [], blocks: {}, edits: {} }), { data: PILOT_DATA }), { ok: true });
});

test('T-V2 extra: an unmatched live placement fails coverage in the other direction too', () => {
  const trip = synthTrip({ stops: ['a'], days: [[travelBlock('origin', 'a')], [opBlock({ stopKey: 'a', dayOffset: 0 })]] });
  const extra = map({
    used: ['x', 'ghost'],
    blocks: { x: livePlacement('a', 0, 1, 'full'), ghost: livePlacement('a', 5, 1, 'full') },
    edits: {}
  });
  const failed = id.validateIdentity(trip, extra, { data: PILOT_DATA });
  assert.equal(failed.ok, false);
  assert.equal(failed.reason, 'coverage_placement_unmatched');
  assert.equal(failed.detail.luid, 'ghost');
});

test('T-V3: a duplicate (stopKey, excursionPlaceId) site target is refused by name regardless of provenance (erratum 02 v2)', () => {
  // Provenance 1 — THE COMPILER-ACCEPTED PACKAGE. The fixed excursion list is never
  // checked against itself (families.js:181, :184), so this really does compile.
  const family = clone(PILOT_ROUTE_FAMILIES.find((f) => f.id === 'peru_classic') ?? PILOT_ROUTE_FAMILIES[0]);
  const stopKey = Object.keys(family.stops).find((k) => (family.stops[k].excursions ?? []).length > 0);
  assert.ok(stopKey, 'the pilot family really has a fixed excursion to duplicate');
  family.stops[stopKey].excursions = [...family.stops[stopKey].excursions, clone(family.stops[stopKey].excursions[0])];
  const compiled = compileFamilies([family], { includePending: true });
  assert.ok(Array.isArray(compiled) ? compiled.length > 0 : compiled.ok !== false, 'compileFamilies ACCEPTS the duplicate — this is the compiler gap, recorded as a finding and left to the owner');

  // Provenance 2 — a hand-seeded record, and provenance 3 — a loaded trip carrying two
  // such placements. Both reach the identity boundary the same way, and both refuse.
  const place = family.stops[stopKey].excursions[0].placeId;
  const duplicated = synthTrip({
    stops: [stopKey],
    days: [
      [travelBlock('origin', stopKey)],
      [excursionSiteBlock({ stopKey, excursionPlaceId: place })],
      [excursionSiteBlock({ stopKey, excursionPlaceId: place })]
    ]
  });
  const refusedTargets = id.qualifyingTargets(duplicated, { data: PILOT_DATA });
  assert.equal(refusedTargets.ok, false);
  assert.equal(refusedTargets.reason, 'duplicate_site_target');
  assert.deepStrictEqual(refusedTargets.detail.address, { excursionPlaceId: place });
  assert.deepStrictEqual(refusedTargets.detail.blockIds, [`ex:${stopKey}:${place}:site`, `ex:${stopKey}:${place}:site`]);

  // BEFORE ISSUANCE: the refusal comes from phase 1, with zero token-source calls.
  const tokens = countingTokens('n');
  const refusedCommit = id.commitIdentity({
    currentTrip: { ...duplicated, identity: map({ used: [], blocks: {}, edits: {} }) },
    nextTrip: duplicated,
    data: PILOT_DATA,
    tokens: tokens.env
  });
  assert.equal(refusedCommit.ok, false);
  assert.equal(refusedCommit.reason, 'duplicate_site_target');
  assert.equal(tokens.calls, 0, 'refused before issuance');

  // And validation refuses it too, so a loaded record cannot smuggle it past phase 3.
  const loadedMap = map({
    used: ['e1', 'e2'],
    blocks: { e1: liveExcursion(stopKey, place), e2: liveExcursion(stopKey, place) },
    edits: {}
  });
  const refusedValidate = id.validateIdentity(duplicated, loadedMap, { data: PILOT_DATA });
  assert.equal(refusedValidate.ok, false);
  assert.equal(refusedValidate.reason, 'duplicate_site_target');

  // PAIRED CONTROL: two site blocks at the same stop with DIFFERENT places are fine.
  const distinct = synthTrip({
    stops: [stopKey],
    days: [
      [travelBlock('origin', stopKey)],
      [excursionSiteBlock({ stopKey, excursionPlaceId: place })],
      [excursionSiteBlock({ stopKey, excursionPlaceId: place + '_other' })]
    ]
  });
  const ok = id.qualifyingTargets(distinct, { data: PILOT_DATA });
  assert.equal(ok.ok, true);
  assert.equal(ok.targets.length, 2);
});

// ---------------------------------------------------------------------------
// Test 20 — excursion identity on REAL Peru producer output, per erratum 02 v2.

test('test 20: a FIXED excursion site block mints exactly one luid on real Peru producer output, is pinnable through the real pinActivity, and the two travel blocks mint nothing (mutations 16, 17)', () => {
  const trip = buildFamily('peru');
  assert.ok(trip);
  const site = trip.days.flatMap((d) => d.blocks).find((b) => b.id === 'ex:pc_aguas:machu_picchu:site');
  assert.ok(site, 'the real producer must place the Machu Picchu site block');
  const out = trip.days.flatMap((d) => d.blocks).find((b) => b.id === 'ex:pc_aguas:machu_picchu:out');
  const back = trip.days.flatMap((d) => d.blocks).find((b) => b.id === 'ex:pc_aguas:machu_picchu:back');
  assert.ok(out && back, 'and both of its travel legs');

  // This excursion is FIXED: it is on the package stop's `excursions`, not its menu.
  const found = id.qualifyingTargets(trip, { data: PILOT_DATA });
  assert.equal(found.ok, true);
  const excursionTargets = found.targets.filter((t) => t.kind === 'excursion');
  assert.equal(excursionTargets.length, 1, 'exactly one excursion target, not three');
  assert.equal(excursionTargets[0].blockId, 'ex:pc_aguas:machu_picchu:site');
  assert.deepStrictEqual(excursionTargets[0].address, { excursionPlaceId: 'machu_picchu' });
  assert.equal(excursionTargets[0].stopKey, 'pc_aguas');
  assert.equal(id.identityTargetFor(out), null);
  assert.equal(id.identityTargetFor(back), null);

  // The metadata is UNRESOLVED, honestly: a fixed excursion has no id at all.
  assert.equal(excursionTargets[0].excursionId, null);

  const seeded = id.initialiseIdentityForBuild(trip, { data: PILOT_DATA, tokens: countingTokens('p').env });
  assert.equal(seeded.ok, true);
  const siteLuid = Object.entries(seeded.identity.blocks).find(([, p]) => p.kind === 'excursion')[0];
  assert.deepStrictEqual(seeded.identity.blocks[siteLuid], {
    stopKey: 'pc_aguas', kind: 'excursion', address: { excursionPlaceId: 'machu_picchu' }, state: 'live', excursionId: null
  });

  // And it really is pinnable, through the real export, with the pin recorded against
  // that luid. The site block is filled into an activity by type, not by id prefix.
  const withMap = { ...trip, identity: seeded.identity };
  assert.equal(site.type, 'activity', 'the site block really was filled into an activity');
  const pinned = edit.pinActivity(withMap, site.id, { data: PILOT_DATA });
  assert.equal(pinned.ok, true, `${pinned.reason ?? ''} ${JSON.stringify(pinned.detail ?? {})}`);
  assert.deepStrictEqual(pinned.trip.identity.edits[siteLuid], {
    intent: 'pin',
    contentId: site.anchor.contentId,
    locked: true,
    userEdited: site.userEdited === true,
    provenance: 'pinActivity'
  });
  assert.deepStrictEqual(pinned.trip.identity.blocks, seeded.identity.blocks, 'the placement itself is untouched by intent');
  // The block really is locked now, which is the behaviour the identity describes.
  const pinnedSite = pinned.trip.days.flatMap((d) => d.blocks).find((b) => b.id === site.id);
  assert.equal(pinnedSite.locked, true);
});

/** The one pilot family with an excursion menu, and a site block for its first entry. */
function menuFixture() {
  const trip = buildFamily('japan-multi-stop');
  assert.ok(trip);
  const stopKey = 'tokyo_base';
  const menuStop = PILOT_DATA.routePackages
    .concat(PILOT_DATA.allRoutePackages ?? [])
    .flatMap((p) => p.stops)
    .find((s) => s.id === stopKey && (s.excursionMenu ?? []).length > 0);
  assert.ok(menuStop, 'the pilot menu stop must exist');
  const menuItem = menuStop.excursionMenu[0];
  const built = synthTrip({
    stops: [stopKey],
    days: [[travelBlock('origin', stopKey)], [excursionSiteBlock({ stopKey, excursionPlaceId: menuItem.placeId })]],
    variantId: trip.routePlan.variantId
  });
  return { trip, stopKey, menuItem, built };
}

test('test 20 (metadata, PILOT-DATA CASE): a selected excursion resolves its excursionId through the compiled package, not the plan stop (mutation 21)', () => {
  const { stopKey, menuItem, built } = menuFixture();
  // The plan stop carries no menu at all, which is the whole point of resolving through
  // the package: `routePlan.stops[].excursionMenu` does not exist.
  assert.equal(built.routePlan.stops.find((s) => s.key === stopKey).excursionMenu, undefined);
  const resolved = id.qualifyingTargets(built, { data: PILOT_DATA });
  assert.equal(resolved.ok, true);
  assert.equal(resolved.targets[0].excursionId, menuItem.id);
});

test('test 20 (metadata, SYNTHETIC-DATA CASE): custom data is honoured, so a lookup defaulting to PILOT_DATA is detected (mutation 22)', () => {
  const { trip, stopKey, menuItem, built } = menuFixture();
  const synthetic = {
    ...PILOT_DATA,
    routePackages: [{ id: trip.routePlan.variantId, stops: [{ id: stopKey, placeId: 'p_' + stopKey, minNights: 1, maxNights: 3, excursions: [], excursionMenu: [{ id: 'custom_excursion', placeId: menuItem.placeId, connectionId: 'c', hoursOnSite: 5, status: 'approved' }] }] }],
    allRoutePackages: []
  };
  const custom = id.qualifyingTargets(built, { data: synthetic });
  assert.equal(custom.ok, true);
  assert.equal(custom.targets[0].excursionId, 'custom_excursion', 'a PILOT_DATA default would record the pilot id here');
  assert.notEqual(custom.targets[0].excursionId, menuItem.id, 'and the two really differ, so the case is not vacuous');
});

test('test 20 (metadata, UNRESOLVABLE CASE): an unknown variant, a withdrawn entry or absent data keeps the placement and its address, recording the metadata unresolved', () => {
  const { trip, stopKey, menuItem, built } = menuFixture();
  for (const [label, args] of [
    ['unknown variant', { data: PILOT_DATA, trip: { ...built, routePlan: { ...built.routePlan, variantId: 'no_such_variant' } } }],
    ['empty menu', { data: { ...PILOT_DATA, routePackages: [{ id: trip.routePlan.variantId, stops: [{ id: stopKey, excursionMenu: [] }] }], allRoutePackages: [] }, trip: built }],
    ['no data supplied', { data: undefined, trip: built }]
  ]) {
    const result = id.qualifyingTargets(args.trip, { data: args.data });
    assert.equal(result.ok, true, `${label} must not refuse`);
    assert.equal(result.targets.length, 1, `${label} keeps its placement`);
    assert.deepStrictEqual(result.targets[0].address, { excursionPlaceId: menuItem.placeId }, `${label} keeps its address`);
    assert.equal(result.targets[0].excursionId, null, `${label} records the metadata unresolved`);
  }
});

// ---------------------------------------------------------------------------
// Tests 16, 17 and T-R1-T-R3 — the relocation API.

/**
 * A real Peru window pair at one stop: the source is displaced and pinned to the target's
 * own current content, and the target is vacated so the gate's used-item scan cannot be
 * what refuses. Built from real producer output, not fabricated.
 */
function relocationFixture() {
  const trip = buildFamily('peru');
  assert.ok(trip);
  const stopBlocks = trip.days.flatMap((d) => d.blocks).filter((b) => b.id.startsWith('op:') && b.type === 'activity');
  assert.ok(stopBlocks.length >= 2, 'enough real activity windows');
  const source = stopBlocks[0];
  const target = stopBlocks.find((b) => b.anchor.stopId === source.anchor.stopId && b.id !== source.id);
  assert.ok(target, 'two windows at one stop');

  const seeded = id.initialiseIdentityForBuild(trip, { data: PILOT_DATA, tokens: countingTokens('p').env });
  const sourceLuid = Object.entries(seeded.identity.blocks).find(([, p]) => id.placementKey(p) === id.identityTargetFor(source).key)[0];
  const targetLuid = Object.entries(seeded.identity.blocks).find(([, p]) => id.placementKey(p) === id.identityTargetFor(target).key)[0];

  // The source is displaced and carries a pin on the TARGET's own current content, so the
  // gate's own used-item scan cannot be what refuses.
  const vacated = {
    ...trip,
    days: trip.days.map((d) => ({ ...d, blocks: d.blocks.map((b) => (b.id === target.id ? { ...b, type: 'open', activity: undefined, anchor: { ...b.anchor, contentId: null }, userEdited: false, locked: false } : b)) }))
  };
  const contentId = target.anchor.contentId;
  const withMap = {
    ...vacated,
    identity: {
      ...seeded.identity,
      blocks: { ...seeded.identity.blocks, [sourceLuid]: { ...seeded.identity.blocks[sourceLuid], state: 'displaced' } },
      edits: { [sourceLuid]: { intent: 'pin', contentId, locked: true, userEdited: true, provenance: 'pinActivity' } }
    }
  };

  return { withMap, sourceLuid, targetLuid, contentId };
}

test('test 16 (empty-list CONTROL): with no caller exclusions the eligible window really is offered', () => {
  const { withMap, sourceLuid, targetLuid } = relocationFixture();
  assert.deepStrictEqual(withMap.spec.choices.rejected ?? [], [], 'the control really passes an empty exclusion list');
  const offered = id.relocationOffers(withMap, sourceLuid, { data: PILOT_DATA, content: PILOT_CONTENT });
  assert.equal(offered.ok, true, offered.reason);
  assert.ok(offered.offers.some((o) => o.luid === targetLuid), 'with no exclusions the window must be offered');
});

test('test 16: a slot-fit window excluded by choices.rejected is NOT offered, because the API passes the caller exclusions to the engine own gate (mutation 12)', () => {
  const { withMap, sourceLuid, targetLuid, contentId } = relocationFixture();
  const rejectedTrip = { ...withMap, spec: { ...withMap.spec, choices: { ...withMap.spec.choices, rejected: [contentId] } } };
  const excluded = id.relocationOffers(rejectedTrip, sourceLuid, { data: PILOT_DATA, content: PILOT_CONTENT });
  assert.equal(excluded.ok, true);
  assert.equal(excluded.offers.some((o) => o.luid === targetLuid), false, 'an excluded content id is never offered');
});

test('T-R1: an occupied window — one carrying its own edit — is never offered', () => {
  const { withMap, sourceLuid, targetLuid } = relocationFixture();
  const occupied = {
    ...withMap,
    identity: { ...withMap.identity, edits: { ...withMap.identity.edits, [targetLuid]: { intent: 'pin', contentId: 'theirs', locked: true, userEdited: true, provenance: 'pinActivity' } } }
  };
  const none = id.relocationOffers(occupied, sourceLuid, { data: PILOT_DATA, content: PILOT_CONTENT });
  assert.equal(none.ok, true);
  assert.equal(none.offers.some((o) => o.luid === targetLuid), false, 'a window carrying its own edit is never offered');
  for (const offer of none.offers) {
    assert.equal(occupied.identity.edits[offer.luid], undefined, 'and no offered window carries one either');
  }
});

/** A source placement displaced at one window and a clean target at another. */
function acceptanceFixture() {
  const trip = synthTrip({
    stops: ['a'],
    days: [
      [travelBlock('origin', 'a')],
      [opBlock({ stopKey: 'a', dayOffset: 0, placeId: 'lima', contentId: 'lima_miraflores' })],
      [opBlock({ stopKey: 'a', dayOffset: 1, placeId: 'lima' })]
    ]
  });
  const identity = map({
    used: ['src', 'tgt'],
    blocks: { src: { ...livePlacement('a', 0, 1, 'full'), state: 'displaced' }, tgt: livePlacement('a', 1, 1, 'full') },
    edits: { src: { intent: 'pin', contentId: 'lima_barranco', locked: true, userEdited: true, provenance: 'pinActivity' } }
  });
  return { trip, identity, withMap: { ...trip, identity } };
}

test('T-R2: acceptance attaches to the target OWN luid with used UNCHANGED — no token is issued (mutation 14)', () => {
  const { identity, withMap } = acceptanceFixture();
  const snapshot = clone(withMap);

  const offers = id.relocationOffers(withMap, 'src', { data: PILOT_DATA, content: PILOT_CONTENT });
  assert.equal(offers.ok, true, offers.reason);
  assert.deepStrictEqual(offers.offers, [{ luid: 'tgt', blockId: 'op:a:d1', stopKey: 'a', kind: 'open', address: { dayOffset: 1, ordinal: 1, slot: 'full' } }]);

  const accepted = id.acceptRelocation(withMap, 'src', 'tgt', { data: PILOT_DATA, content: PILOT_CONTENT });
  assert.equal(accepted.ok, true, accepted.reason);
  assert.deepStrictEqual(accepted.identity.used, ['src', 'tgt'], 'NO token was issued');
  assert.deepStrictEqual(accepted.identity.blocks.tgt, identity.blocks.tgt, 'the target keeps its own identity and address');
  assert.equal(accepted.identity.blocks.src.state, 'dismissed');
  assert.deepStrictEqual(accepted.identity.edits.tgt, {
    intent: 'pin', contentId: 'lima_barranco', locked: true, userEdited: true, provenance: 'relocated_from:src'
  });
  assert.equal(accepted.identity.edits.src.provenance, 'relocated_to:tgt', 'the source records where its intent went');
  assert.deepStrictEqual(withMap, snapshot, 'the input trip was never mutated');
});

test('test 17: a STALE acceptance — the target edited between offer and acceptance — is refused and overwrites nothing', () => {
  const { identity, withMap } = acceptanceFixture();
  const edited = {
    ...withMap,
    identity: { ...identity, edits: { ...identity.edits, tgt: { intent: 'pin', contentId: 'theirs', locked: true, userEdited: true, provenance: 'pinActivity' } } }
  };
  const editedSnapshot = clone(edited);
  const stale = id.acceptRelocation(edited, 'src', 'tgt', { data: PILOT_DATA, content: PILOT_CONTENT });
  assert.equal(stale.ok, false);
  assert.equal(stale.reason, 'target_not_offered');
  assert.deepStrictEqual(edited, editedSnapshot, 'a stale acceptance overwrites nothing');
});

test('T-R3: a foreign target block produces a named refusal, not a throw (mutation 13)', () => {
  const trip = synthTrip({ stops: ['a'], days: [[travelBlock('origin', 'a')], [opBlock({ stopKey: 'a', dayOffset: 0, placeId: 'lima', contentId: 'lima_miraflores' })]] });
  const foreign = opBlock({ stopKey: 'zz', dayOffset: 4, placeId: 'lima' });
  // The engine's own gate THROWS on a block absent from the trip; the API must not.
  const refused = id.relocationTargetEligible(trip, foreign, 'lima_miraflores', PILOT_CONTENT);
  assert.equal(refused.ok, false);
  assert.equal(refused.reason, 'target_not_in_trip');
  assert.deepStrictEqual(refused.detail, { blockId: 'op:zz:d4' });

  const nullBlock = id.relocationTargetEligible(trip, undefined, 'x', PILOT_CONTENT);
  assert.equal(nullBlock.ok, false);
  assert.equal(nullBlock.reason, 'target_not_in_trip');

  // PAIRED CONTROL: a block that IS in the trip reaches the gate and returns a verdict.
  const present = trip.days[1].blocks[0];
  const verdict = id.relocationTargetEligible(trip, present, 'lima_miraflores', PILOT_CONTENT);
  assert.equal(verdict.ok, true);
  assert.equal(typeof verdict.eligible, 'boolean');

  // And an unknown placement refuses by name rather than reaching the gate at all.
  const unknown = id.relocationOffers({ ...trip, identity: map({ used: [], blocks: {}, edits: {} }) }, 'nope', { data: PILOT_DATA, content: PILOT_CONTENT });
  assert.equal(unknown.ok, false);
  assert.equal(unknown.reason, 'unknown_placement');
});

// ---------------------------------------------------------------------------
// The legacy-initialization entry point, implemented and called from nowhere.

test('the legacy entry point attaches the flags the loaded build genuinely carries, and invents no history', () => {
  const trip = synthTrip({
    stops: ['a'],
    days: [
      [travelBlock('origin', 'a')],
      [opBlock({ stopKey: 'a', dayOffset: 0, contentId: 'c1', locked: true, userEdited: true })],
      [opBlock({ stopKey: 'a', dayOffset: 1, contentId: 'c2' })]
    ]
  });
  const initialised = id.initialiseIdentityForLegacyTrip(trip, { data: PILOT_DATA, tokens: countingTokens('l').env });
  assert.equal(initialised.ok, true, initialised.reason);
  assert.deepStrictEqual(states(initialised.identity), { l1: 'live', l2: 'live' });
  assert.deepStrictEqual(Object.keys(initialised.identity.edits), ['l1'], 'only the block that carried a flag has intent');
  assert.deepStrictEqual(initialised.identity.edits.l1, {
    intent: 'imported', contentId: 'c1', locked: true, userEdited: true, provenance: 'legacy_initialization'
  });
  assert.deepStrictEqual(id.validateIdentity(trip, initialised.identity, { data: PILOT_DATA }), { ok: true });

  // The registry is seeded from the snapshot's own `used` where one exists, so a token it
  // already recorded is never reissued.
  const withUsed = { ...trip, identity: { version: 1, used: ['l1'], blocks: {}, edits: {} } };
  const seededFrom = id.initialiseIdentityForLegacyTrip(withUsed, { data: PILOT_DATA, tokens: countingTokens('l').env });
  assert.equal(seededFrom.ok, true, seededFrom.reason);
  assert.ok(seededFrom.identity.used.includes('l1'));
  assert.equal(Object.keys(seededFrom.identity.blocks).includes('l1'), false, 'the already-recorded token was not reissued');
});
