import { test } from 'node:test';
import assert from 'node:assert/strict';

// ODI, the one-destination-intent postcondition on the classic planner's two
// intent setters. Build brief
// docs/briefs/q8-p2-getter/build-brief-stale-multistop-legs-override-2026-10-27-rev2.md,
// §2.1-§2.2 (W-1 … W-6) and §4.2 (T-1 … T-7).
//
// The defect: stored multiStopLegs took unconditional precedence over the
// destination the traveller had just selected (TripDetail.jsx:61-63), so a
// stale multi-stop plan kept resolving in place of the new single-destination
// trip -- and the saved snapshot was built from the same stale legs.
//
// The invariant: after a successful setSelectedDestinationId(id) with a
// non-null id, persisted state holds no multi-stop legs; after a successful
// setMultiStopLegs(legs) with a non-empty array, it holds no selected
// destination. A null/undefined id is "no single destination chosen", NOT
// "abandon the plan", so it leaves legs alone -- DoorB.jsx:242-243 writes the
// legs and then nulls the selection, and clearing there would destroy every
// multi-stop trip at the moment it is built.
//
// Every test seeds REAL encoded bytes under travelup_state_v1 and lets the
// shipped getters and setters parse them. Setup and assertion never share one
// mutable in-memory object: each fixture is stringified on the way in, and
// every expectation is an independent literal.

import {
  getMultiStopLegs,
  getSelectedDestinationId,
  setMultiStopLegs,
  setSelectedDestinationId
} from '../../src/lib/storage.js';

const KEY = 'travelup_state_v1';

// A storage double that records every attempted write, so "exactly one
// persistState call" (W-4) and "one attempted write, bytes retained" (T-6)
// are observable rather than inferred.
let store;
let writes;      // every value setItem was CALLED with, including failed ones
let removals;
let failWrite;   // when set, a factory for the error setItem throws

globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => {
    writes.push(String(v));
    if (failWrite) throw failWrite();
    store.set(k, String(v));
  },
  removeItem: (k) => { removals.push(k); store.delete(k); },
  clear: () => { store.clear(); }
};

/** Reset the double and seed `state` as real encoded bytes. */
function seed(state) {
  store = new Map();
  writes = [];
  removals = [];
  failWrite = null;
  if (state !== undefined) store.set(KEY, JSON.stringify(state));
}

const raw = () => (store.has(KEY) ? store.get(KEY) : null);
const parsed = () => JSON.parse(raw());
const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

const quotaError = () => {
  const e = new Error('persistent storage is full');
  e.name = 'QuotaExceededError';
  e.code = 22;
  return e;
};

// ---- T-1: a non-null selection retires the stored legs ----

test('T-1: setSelectedDestinationId with a non-null id clears stored multi-stop legs, and the serialized record loses the key', () => {
  seed({ multiStopLegs: [{ destinationId: 'kerala', days: 4 }, { destinationId: 'goa', days: 3 }] });

  // The legs really are there, parsed back out of the seeded bytes, before the act.
  assert.deepEqual(getMultiStopLegs(), [{ destinationId: 'kerala', days: 4 }, { destinationId: 'goa', days: 3 }]);

  setSelectedDestinationId('X');

  assert.equal(getMultiStopLegs(), null);
  assert.equal(getSelectedDestinationId(), 'X');
  assert.equal(hasOwn(parsed(), 'multiStopLegs'), false, 'the serialized record must not carry a multiStopLegs key');
  assert.equal(raw().includes('multiStopLegs'), false, 'the stored bytes must not mention multiStopLegs at all');
});

// ---- T-2: a non-empty leg list retires the stored selection ----

test('T-2: setMultiStopLegs with a non-empty array nulls the stored selection and writes the legs exactly as handed in', () => {
  seed({ selectedDestinationId: 'kerala' });
  assert.equal(getSelectedDestinationId(), 'kerala');

  setMultiStopLegs([{ destinationId: 'goa', days: 2 }, { destinationId: 'jaipur', days: 5 }, { destinationId: 'delhi', days: 1 }]);

  assert.equal(getSelectedDestinationId(), null);
  const legs = getMultiStopLegs();
  assert.equal(legs.length, 3, 'leg count must be exactly what was written');
  assert.deepEqual(legs.map((l) => l.destinationId), ['goa', 'jaipur', 'delhi']);
  assert.deepEqual(legs.map((l) => l.days), [2, 5, 1], 'per-leg days must survive verbatim and in order');
  assert.equal(parsed().selectedDestinationId, null);
});

// ---- T-3: a null or undefined selection leaves the plan standing ----

test('T-3a: setSelectedDestinationId(null) leaves stored multi-stop legs present and unchanged', () => {
  seed({ multiStopLegs: [{ destinationId: 'kerala', days: 4 }, { destinationId: 'goa', days: 3 }] });

  setSelectedDestinationId(null);

  assert.deepEqual(getMultiStopLegs(), [{ destinationId: 'kerala', days: 4 }, { destinationId: 'goa', days: 3 }]);
  assert.equal(hasOwn(parsed(), 'multiStopLegs'), true);
  assert.equal(getSelectedDestinationId(), null);
});

test('T-3b: setSelectedDestinationId(undefined) leaves stored multi-stop legs present and unchanged', () => {
  seed({ multiStopLegs: [{ destinationId: 'kerala', days: 4 }, { destinationId: 'goa', days: 3 }] });

  setSelectedDestinationId(undefined);

  assert.deepEqual(getMultiStopLegs(), [{ destinationId: 'kerala', days: 4 }, { destinationId: 'goa', days: 3 }]);
  assert.equal(hasOwn(parsed(), 'multiStopLegs'), true);
  assert.equal(getSelectedDestinationId(), null);
});

// ---- T-4: both fields move in ONE write (W-4) ----

test('T-4a: a setSelectedDestinationId that also clears legs performs exactly one localStorage write', () => {
  seed({ multiStopLegs: [{ destinationId: 'kerala', days: 4 }] });

  setSelectedDestinationId('X');

  assert.equal(writes.length, 1, 'both fields must change on one loaded object and persist in a single call');
  assert.equal(removals.length, 0, 'the setter must not reach for removeItem');
  // The single write already carries both halves of the postcondition.
  const written = JSON.parse(writes[0]);
  assert.equal(written.selectedDestinationId, 'X');
  assert.equal(hasOwn(written, 'multiStopLegs'), false);
});

test('T-4b: a setMultiStopLegs that also nulls the selection performs exactly one localStorage write', () => {
  seed({ selectedDestinationId: 'kerala' });

  setMultiStopLegs([{ destinationId: 'goa', days: 2 }]);

  assert.equal(writes.length, 1, 'both fields must change on one loaded object and persist in a single call');
  assert.equal(removals.length, 0, 'the setter must not reach for removeItem');
  const written = JSON.parse(writes[0]);
  assert.equal(written.selectedDestinationId, null);
  assert.deepEqual(written.multiStopLegs, [{ destinationId: 'goa', days: 2 }]);
});

// ---- T-5: the legacy record that already holds both ----

test('T-5: a pre-fix record holding BOTH a selection and legs is normalized by the next explicit selection, unrelated keys intact', () => {
  seed({
    selectedDestinationId: 'goa',
    multiStopLegs: [{ destinationId: 'kerala', days: 4 }, { destinationId: 'goa', days: 3 }],
    prefs: { departureCity: 'Vancouver', travelDays: 7, interests: ['food'] },
    guestSavePromptDismissed: true
  });

  setSelectedDestinationId('X');

  const after = parsed();
  assert.equal(hasOwn(after, 'multiStopLegs'), false, 'the conflicting legs must be gone');
  assert.equal(getMultiStopLegs(), null);
  assert.equal(getSelectedDestinationId(), 'X');
  assert.deepEqual(after.prefs, { departureCity: 'Vancouver', travelDays: 7, interests: ['food'] });
  assert.equal(after.guestSavePromptDismissed, true);
});

// ---- T-6: a failed persist changes nothing ----

test('T-6a: W-1 over throwing storage attempts one write, retains the stored bytes byte-for-byte, and does not throw past the setter', () => {
  seed({ multiStopLegs: [{ destinationId: 'kerala', days: 4 }], prefs: { travelDays: 7 } });
  const before = raw();
  failWrite = quotaError;

  assert.doesNotThrow(() => setSelectedDestinationId('X'), 'persistState swallows the failure; the setter must stay void');

  assert.equal(writes.length, 1, 'exactly one attempted write -- no retry, no second call');
  assert.equal(raw(), before, 'the stored record must be byte-unchanged after a failed persist');
  // And the pre-fix state genuinely survives: no recovery is established.
  failWrite = null;
  assert.deepEqual(getMultiStopLegs(), [{ destinationId: 'kerala', days: 4 }]);
  assert.equal(getSelectedDestinationId(), null);
});

test('T-6b: W-2 over throwing storage attempts one write, retains the stored bytes byte-for-byte, and does not throw past the setter', () => {
  seed({ selectedDestinationId: 'kerala', prefs: { travelDays: 7 } });
  const before = raw();
  failWrite = quotaError;

  assert.doesNotThrow(() => setMultiStopLegs([{ destinationId: 'goa', days: 2 }]));

  assert.equal(writes.length, 1, 'exactly one attempted write -- no retry, no second call');
  assert.equal(raw(), before, 'the stored record must be byte-unchanged after a failed persist');
  failWrite = null;
  assert.equal(getMultiStopLegs(), null);
  assert.equal(getSelectedDestinationId(), 'kerala');
});

// ---- T-7: W-6, everything else is left exactly as it was ----

// Built fresh for each sub-case, and compared against an independently
// constructed expectation, so neither side can be mutated into agreement.
const unrelatedFixture = () => ({
  prefs: { residenceCountry: 'Canada', departureCity: 'Vancouver', travelDays: 9, interests: ['food', 'history'] },
  prefsHistory: [{ departureCity: 'Toronto', travelDays: 5 }],
  packing: { kerala: { checked: ['a'], custom: ['towel'] } },
  packingByTrip: { 'v1:{}': { checkedItemIds: ['x'], customItems: [], removedItemIds: ['y'] } },
  savedTrips: [{ schemaVersion: 1, id: 't1', fingerprint: 'v1:fp', destination: { id: 'kerala' }, itinerary: [] }],
  pendingTripSnapshot: { schemaVersion: 1, id: 't2', fingerprint: 'v1:fp2', destination: { id: 'goa' }, itinerary: [] },
  pendingEmailVerification: { email: 'traveller@example.com', startedAt: '2026-10-01T00:00:00.000Z' },
  guestSavePromptDismissed: true
});

const UNRELATED_KEYS = [
  'prefs', 'prefsHistory', 'packing', 'packingByTrip', 'savedTrips',
  'pendingTripSnapshot', 'pendingEmailVerification', 'guestSavePromptDismissed'
];

test('T-7: setSelectedDestinationId preserves every unrelated key byte-identically', () => {
  seed({ ...unrelatedFixture(), multiStopLegs: [{ destinationId: 'kerala', days: 4 }] });
  const expected = unrelatedFixture();

  setSelectedDestinationId('X');

  const after = parsed();
  for (const k of UNRELATED_KEYS) {
    assert.equal(JSON.stringify(after[k]), JSON.stringify(expected[k]), `unrelated key ${k} must be untouched`);
  }
  assert.equal(hasOwn(after, 'multiStopLegs'), false);
  assert.equal(after.selectedDestinationId, 'X');
});

test('T-7: setMultiStopLegs preserves every unrelated key byte-identically', () => {
  seed({ ...unrelatedFixture(), selectedDestinationId: 'kerala' });
  const expected = unrelatedFixture();

  setMultiStopLegs([{ destinationId: 'goa', days: 2 }]);

  const after = parsed();
  for (const k of UNRELATED_KEYS) {
    assert.equal(JSON.stringify(after[k]), JSON.stringify(expected[k]), `unrelated key ${k} must be untouched`);
  }
  assert.deepEqual(after.multiStopLegs, [{ destinationId: 'goa', days: 2 }]);
  assert.equal(after.selectedDestinationId, null);
});
