import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

// P1 — the v6/v7 parity oracle (build brief draft 7 §5.4).
//
// Packet 1a must not change one byte of v6 or v7 behaviour. The existing suite asserts
// properties; this asserts identity. A fixed set of builds and edits runs through the
// real buildF6Trip path with every input pinned and the clock frozen, and the canonical
// hash of each result is checked against a literal recorded below.
//
// Those literals were produced by running this matrix against the UNCHANGED source at
// 2eb9133def7d1a69cd2584832914b0070d8f2ab2, with draftStorage.js — the only file this
// oracle imports that the packet changes — stashed and then restored. The new
// implementation is therefore never compared against itself. If a literal moves, v6/v7
// output changed, and that is a stop condition.
//
// REVISED after the diff review of 7e85395 (R4). The family previously labelled
// "japan-multi-stop" was a 7-day Japan spec, which builds variant tokyo_city with Tokyo
// as its only stop — a single-base trip under a multi-stop name. It is kept under an
// honest label, and a genuine multi-stop Japan family was added: Kyoto is an optional
// spur on the tokyo_city family, so it needs requiredPlaceIds: ['kyoto'] and the days to
// fit kyo_base plus the tokyo_hub night. Every family now records its variant id and
// stop coverage alongside its hashes, so a relabelling cannot hide what is covered.
//
// The four pre-existing families' hashes are unchanged by that addition; only the
// whole-matrix hash moved, because the matrix now has a fifth family.
//
// Excluded nondeterminism, named individually:
//   - a draft's id and savedAt, which embed Date.now() and Math.random(): the
//     save/reopen case hashes the reopened trip, not the envelope that wrapped it.
//   - evidence.generatedAt, pinned through the frozen connectionContext below.
// Fresh-v7 save bytes are NOT required to match across independent saves at different
// times.
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

const FAMILIES = {
  'nyc-single-base': spec({ kind: 'country', id: 'US' }, 7),
  peru: spec({ kind: 'country', id: 'PE' }, 10),
  'japan-tokyo-single-base': spec({ kind: 'country', id: 'JP' }, 7),
  'japan-multi-stop': spec({ kind: 'country', id: 'JP' }, 10, ['kyoto']),
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
  // Recorded in the clear, not hashed: what each family actually covers.
  out.variantId = built.routePlan.variantId;
  out.stopPlaceIds = [...new Set(built.routePlan.stops.map((s) => s.placeId))].join(',');
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
    saveReopenShape: '8730ba748bea7f9b',
    variantId: 'nyc_city',
    stopPlaceIds: 'new_york'
  },
  peru: {
    build: 'edd4ef8d75bad0d3',
    swap: 'e80c319695dbadad',
    undo: '3b22e4fb91ce41e4',
    makeLighter: 'f26ed924fcbefe80',
    preview: '8f96590e0519dcab',
    apply: '66e35264a917805a',
    saveReopen: '54d67f8e035a6ab5',
    saveReopenShape: '8730ba748bea7f9b',
    variantId: 'peru_classic',
    stopPlaceIds: 'lima,cusco,ollantaytambo,aguas_calientes'
  },
  'japan-tokyo-single-base': {
    build: '31f1ef6d4e7b1d24',
    swap: 'b77c8bd7e4ba51dc',
    undo: '354629ee2ece229d',
    makeLighter: '03f5c94cfc820c45',
    preview: '7e04169c44ad9dd6',
    apply: '103a39daaa105c75',
    saveReopen: 'bfbe51434c876c02',
    saveReopenShape: '8730ba748bea7f9b',
    variantId: 'tokyo_city',
    stopPlaceIds: 'tokyo'
  },
  'japan-multi-stop': {
    build: 'eb81cb46f6a2c5b5',
    swap: 'fb02d223c12dcd8d',
    undo: 'f506f6756dda5055',
    makeLighter: '062a46beffc80a25',
    preview: '046a47788c2688c8',
    apply: '08096c206f0f0232',
    saveReopen: 'c374d213a2440648',
    saveReopenShape: '8730ba748bea7f9b',
    variantId: 'tokyo_city+kyoto@after_tokyo',
    stopPlaceIds: 'tokyo,kyoto'
  },
  'eastern-canada-reversible': {
    build: 'b76d8eba56be2bfe',
    swap: '221553ecdb468848',
    undo: '56f1cda6ee54b5b9',
    makeLighter: 'd268578fb929165f',
    preview: 'a095998e0b365ef8',
    apply: 'bb86c21664b42a91',
    saveReopen: '41adf90e3be217e9',
    saveReopenShape: '8730ba748bea7f9b',
    variantId: 'ec_corridor#west_to_east+ottawa@corridor+niagara@toronto_spur',
    stopPlaceIds: 'toronto,niagara_falls,ottawa,montreal,quebec_city'
  }
};

const BASELINE_ALL = 'eb6621a86f2f90a2';

// What each family is for. Asserted separately from the hashes so the labels cannot
// drift from what the specs actually build.
const COVERAGE = {
  'nyc-single-base': { stops: 1 },
  peru: { stops: 4 },
  'japan-tokyo-single-base': { stops: 1 },
  'japan-multi-stop': { stops: 2, mustInclude: ['tokyo', 'kyoto'] },
  'eastern-canada-reversible': { stops: 5 }
};

test('P1: v6/v7 output is identical to the pre-change baseline, family by family', () => {
  const observed = {};
  for (const family of Object.keys(FAMILIES)) observed[family] = run(family);

  for (const [family, expected] of Object.entries(BASELINE)) {
    assert.deepStrictEqual(observed[family], expected, `${family}: v6/v7 output changed`);
  }
  assert.deepEqual(Object.keys(observed).sort(), Object.keys(BASELINE).sort(), 'the family set itself changed');
  assert.equal(hash(Object.fromEntries(Object.entries(observed))), BASELINE_ALL, 'the full observed matrix changed');
});

test('P1 coverage: each family really builds the route its name claims', () => {
  for (const [family, want] of Object.entries(COVERAGE)) {
    const got = run(family);
    const places = got.stopPlaceIds.split(',');
    assert.equal(places.length, want.stops, `${family}: expected ${want.stops} distinct stops, got ${got.stopPlaceIds}`);
    for (const place of want.mustInclude ?? []) {
      assert.ok(places.includes(place), `${family}: must visit ${place}, got ${got.stopPlaceIds}`);
    }
  }
  // The point of R4: the multi-stop family must not be the single-base one under another
  // name. These two Japan specs differ in route, not just in label.
  const single = run('japan-tokyo-single-base');
  const multi = run('japan-multi-stop');
  assert.notEqual(single.variantId, multi.variantId, 'the two Japan families build different variants');
  assert.equal(single.stopPlaceIds, 'tokyo');
  assert.equal(multi.stopPlaceIds, 'tokyo,kyoto');
});
