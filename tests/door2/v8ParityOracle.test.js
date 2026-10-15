import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

// P1 — the v6/v7 parity oracle (build brief draft 7 §5.4).
//
// Packet 1a must not change one byte of v6 or v7 behaviour. The existing suite says a
// great deal about that, but it asserts properties; this asserts identity. A fixed set
// of builds and edits runs through the real buildF6Trip path with every input pinned
// and the clock frozen, and the canonical hash of each result is checked against a
// literal recorded below.
//
// Those literals were produced by running this same matrix against the UNCHANGED source
// at 2eb9133def7d1a69cd2584832914b0070d8f2ab2, with the packet's three edited files
// stashed, then restored. The new implementation is therefore never compared against
// itself. If a literal moves, v6/v7 output changed, and that is a stop condition.
//
// Excluded nondeterminism, named individually:
//   - a draft's id and savedAt, which embed Date.now() and Math.random(): the
//     save/reopen case hashes the reopened trip, not the envelope that wrapped it.
//   - evidence.generatedAt, pinned through the frozen connectionContext below.
// Fresh-v7 save bytes are deliberately NOT required to match across independent saves
// at different times.
//
// The connectionContext is passed exactly where the page passes it
// (Door2Plan.jsx:1850). Omitting it takes the F5 branch and would not reproduce the
// page's F6 path, so a parity claim built without it would measure the wrong code.

import { buildF6Trip } from '../../src/lib/door2/connectionBuild.js';
import { PILOT_DATA } from '../../src/lib/door2/planner.js';
import { PILOT_CONTENT } from '../../src/lib/door2/pilotContent.js';
import { makeDayLighter, swapActivity, undo } from '../../src/lib/door2/edit.js';
import { applyProposal, previewAdjustNights } from '../../src/lib/door2/restructure.js';
import { loadDraftTrip, saveDraftTrip } from '../../src/lib/door2/draftStorage.js';

const store = new Map();
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) };

const FROZEN = '2026-10-14T12:00:00.000Z';
const CONTEXT = {
  schemaVersion: 1,
  sequenceId: 'p1a-parity-oracle',
  generatedAt: FROZEN,
  estimatorRulesetVersion: 'flight-gc-v1',
  estimates: []
};
const OPTIONS = { reviewPolicy: 'allow_drafts', content: PILOT_CONTENT, connectionContext: CONTEXT };

/** Key order is normalised, so a hash depends on values and not on insertion order. */
function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
}
const hash = (value) => createHash('sha256').update(canonical(value)).digest('hex').slice(0, 16);

const spec = (destination, totalDays, requiredPlaceIds = []) => ({
  originPlaceId: 'vancouver',
  destination,
  travelMonth: 10,
  totalDays,
  travellerType: 'couple',
  interests: [],
  pace: 'balanced',
  budget: 'mid',
  routeTemplateId: null,
  stops: [],
  requiredPlaceIds,
  choices: { pinned: [], rejected: [], placed: [] }
});

// The four named families, pinned here rather than derived: one single-base, two
// multi-stop, and the reversible corridor.
const FAMILIES = {
  'nyc-single-base': spec({ kind: 'country', id: 'US' }, 7),
  peru: spec({ kind: 'country', id: 'PE' }, 10),
  'japan-multi-stop': spec({ kind: 'country', id: 'JP' }, 7),
  'eastern-canada-reversible': spec({ kind: 'country', id: 'CA' }, 10)
};

function run(family) {
  const out = {};
  const res = buildF6Trip(FAMILIES[family], PILOT_DATA, OPTIONS);
  out.build = hash(res);
  const built = res && res.ok === true && res.value && res.value.trip ? res.value.trip : res;
  if (!Array.isArray(built.days) || !built.routePlan) {
    out.nonTrip = true;
    return out;
  }

  const activity = built.days.flatMap((d) => d.blocks).find((b) => b.type === 'activity');
  if (activity) {
    const swapped = swapActivity(built, activity.id);
    out.swap = hash(swapped);
    if (swapped.ok) out.undo = hash(undo(swapped.trip));
  }

  out.makeLighter = hash(makeDayLighter(built, built.days[0].dayNumber));

  const stopKey = built.routePlan?.stops?.[0]?.key;
  if (stopKey) {
    const preview = previewAdjustNights(built, stopKey, 1, { generatedAt: FROZEN });
    out.preview = hash(preview);
    if (preview.ok && preview.proposals?.[0]) out.apply = hash(applyProposal(built, preview.proposals[0]));
  }

  store.clear();
  const id = saveDraftTrip({ ...built, history: [] }, 'parity', 'parity');
  const reopened = loadDraftTrip(id);
  out.saveReopen = hash(reopened.trip);
  // The legacy result's own key set, which must stay exactly { compatible, trip }.
  out.saveReopenShape = hash(Object.keys(reopened).sort());
  return out;
}

// Recorded from the unchanged source at 2eb9133 (see the header).
const BASELINE = {
  'nyc-single-base': {
    build: '78edb712ff3ced28',
    swap: '4621bac2fea7d043',
    undo: '8b4c45f1092f6634',
    makeLighter: '3bee34abd1d1389f',
    preview: '6bba9fbe01a697ea',
    apply: '3b47a9ffb3bc4a7b',
    saveReopen: 'e47db4a7f3f45733',
    saveReopenShape: '8730ba748bea7f9b'
  },
  peru: {
    build: 'edd4ef8d75bad0d3',
    swap: 'e80c319695dbadad',
    undo: '3b22e4fb91ce41e4',
    makeLighter: 'f26ed924fcbefe80',
    preview: '8f96590e0519dcab',
    apply: '66e35264a917805a',
    saveReopen: '54d67f8e035a6ab5',
    saveReopenShape: '8730ba748bea7f9b'
  },
  'japan-multi-stop': {
    build: '31f1ef6d4e7b1d24',
    swap: 'b77c8bd7e4ba51dc',
    undo: '354629ee2ece229d',
    makeLighter: '03f5c94cfc820c45',
    preview: '7e04169c44ad9dd6',
    apply: '103a39daaa105c75',
    saveReopen: 'bfbe51434c876c02',
    saveReopenShape: '8730ba748bea7f9b'
  },
  'eastern-canada-reversible': {
    build: 'b76d8eba56be2bfe',
    swap: '221553ecdb468848',
    undo: '56f1cda6ee54b5b9',
    makeLighter: 'd268578fb929165f',
    preview: 'a095998e0b365ef8',
    apply: 'bb86c21664b42a91',
    saveReopen: '41adf90e3be217e9',
    saveReopenShape: '8730ba748bea7f9b'
  }
};

// The hash of the whole observed matrix at baseline, so a family that silently stops
// producing a trip cannot pass by omission.
const BASELINE_ALL = '541c9b1b4e6b83b1';

test('P1: v6/v7 output is identical to the pre-change baseline, family by family', () => {
  const observed = {};
  for (const family of Object.keys(FAMILIES)) observed[family] = run(family);

  for (const [family, expected] of Object.entries(BASELINE)) {
    assert.deepStrictEqual(observed[family], expected, `${family}: v6/v7 output changed`);
  }
  assert.deepEqual(Object.keys(observed).sort(), Object.keys(BASELINE).sort(), 'the family set itself changed');
  assert.equal(hash(Object.fromEntries(Object.entries(observed))), BASELINE_ALL, 'the full observed matrix changed');
});
