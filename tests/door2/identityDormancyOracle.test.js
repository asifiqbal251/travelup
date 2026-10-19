import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

// P1-D — the dormancy oracle (packet 1b build brief draft 4 §5.1).
//
// Packet 1b adds an identity engine and must not change one byte of behaviour on any
// production call path. The existing suite asserts properties and P1 (v8ParityOracle)
// asserts identity for a subset of operations; this file asserts identity for EVERY
// export packet 1b touches, over BOTH input classes the reader admits:
//
//   free     - ordinary producer trips with no identity map.
//   bearing  - a genuine producer trip stamped door2-v7 carrying an identity map, in a
//              real envelope the writer itself produced, read back through the real
//              reader. This class exists because loadEnvelope (draftStorage.js:197-205)
//              never inspects identity on the v7 path, so such a record loads
//              compatible:true with no lock and every command succeeds. A hook keyed on
//              `trip.identity` presence rather than on an explicit caller opt-in would
//              therefore change behaviour HERE, in production.
//
// The literals below were produced by running this matrix against the UNCHANGED source
// at bc58722618e6a08ba1680d50560b3513e9006f20, before any packet 1b edit, in an isolated
// install. The new implementation is therefore never compared against itself. If a
// literal moves, a production path changed, and that is a stop condition.
//
// Cross-validated: every cell this matrix shares with P1's independently recorded
// baseline (swap, undo-after-swap, make-lighter, adjust-nights preview, apply,
// save/reopen, saveReopenShape, variantId, stopPlaceIds, across all five families)
// reproduces P1's literal exactly. `build` differs from P1's by design: P1 hashes the
// whole buildF6Trip result wrapper, this hashes the trip.
//
// Excluded nondeterminism, named individually:
//   - a draft's id and savedAt, which embed Date.now() and Math.random(): the
//     save/reopen cases hash the reopened trip, not the envelope that wrapped it.
//   - evidence.generatedAt, pinned through the frozen connectionContext below.
// Fresh-v7 save bytes are NOT required to match across independent saves.
//
// The connectionContext is passed exactly where the page passes it
// (Door2Plan.jsx:1854). Omitting it takes the F5 branch and would measure the wrong code.
//
// Cells recorded as 'n/a-...' are honest coverage gaps in current pilot data, not
// refusals dressed up as passes: no package optional is absent from its plan, none has a
// second position, and only the Japan family has an excursion menu. They are asserted as
// literals so that a change making them reachable is itself detected.

import { buildF6Trip } from '../../src/lib/door2/connectionBuild.js';
import { PILOT_DATA, findRoutePackage } from '../../src/lib/door2/planner.js';
import { PILOT_CONTENT } from '../../src/lib/door2/pilotContent.js';
import * as edit from '../../src/lib/door2/edit.js';
import * as rs from '../../src/lib/door2/restructure.js';
import { tripFingerprint } from '../../src/lib/door2/fingerprint.js';
import { loadDraftTrip, saveDraftTrip } from '../../src/lib/door2/draftStorage.js';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => store.get(k) ?? null,
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k)
};

const FROZEN = '2026-10-18T12:00:00.000Z';
const CONTEXT = {
  schemaVersion: 1,
  sequenceId: 'p1d-dormancy-oracle',
  generatedAt: FROZEN,
  estimatorRulesetVersion: 'flight-gc-v1',
  estimates: []
};
const OPTIONS = { reviewPolicy: 'allow_drafts', content: PILOT_CONTENT, connectionContext: CONTEXT };
const POPTS = { generatedAt: FROZEN };

/** Key order is normalised, so a hash depends on values and not on insertion order. */
function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
}
const hash = (value) => createHash('sha256').update(canonical(value)).digest('hex').slice(0, 16);

const spec = (id, totalDays, requiredPlaceIds = []) => ({
  originPlaceId: 'vancouver',
  destination: { kind: 'country', id },
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

// The same five families P1 pins, including the honest Japan split that review R4 forced.
const FAMILIES = {
  'nyc-single-base': spec('US', 7),
  peru: spec('PE', 10),
  'japan-tokyo-single-base': spec('JP', 7),
  'japan-multi-stop': spec('JP', 10, ['kyoto']),
  'eastern-canada-reversible': spec('CA', 10)
};

function build(family) {
  const r = buildF6Trip(FAMILIES[family], PILOT_DATA, OPTIONS);
  return r && r.ok === true && r.value && r.value.trip ? r.value.trip : null;
}

/** Real ids, resolved the way the engine does: from the compiled package, not the plan stop. */
function ids(trip) {
  const pkg = findRoutePackage(PILOT_DATA, trip.routePlan.variantId);
  const planKeys = new Set((trip.routePlan.stops ?? []).map((s) => s.key));
  const menuStop = (pkg?.stops ?? []).find((s) => (s.excursionMenu ?? []).length > 0 && planKeys.has(s.id));
  const inPlan = (trip.routePlan.optionals ?? []).map((o) => o.optionalId);
  const pkgOpt = pkg?.optionals ?? [];
  const present = (trip.routePlan.optionals ?? [])[0] ?? null;
  return {
    menuStopKey: menuStop ? menuStop.id : null,
    menuId: menuStop ? menuStop.excursionMenu[0].id : null,
    presentOptional: present,
    absentOptional: pkgOpt.find((o) => !inPlan.includes(o.optionalId)) ?? null,
    otherPositionId: present
      ? pkgOpt.find((o) => o.optionalId === present.optionalId && o.positionId !== present.positionId)?.positionId ?? null
      : null,
    fixedExcursionStops:
      (pkg?.stops ?? [])
        .filter((s) => (s.excursions ?? []).length > 0)
        .map((s) => `${s.id}:${s.excursions.map((e) => e.placeId).join('+')}`)
        .join('|') || 'none'
  };
}

function matrix(trip) {
  const out = {};
  const I = ids(trip);
  out.build = hash(trip);
  out.fingerprint = tripFingerprint(trip);
  const activity = trip.days.flatMap((d) => d.blocks).find((b) => b.type === 'activity');
  const stopKey = trip.routePlan?.stops?.[0]?.key;

  // The seven bounded-edit exports packet 1b touches.
  if (activity) {
    const sw = edit.swapActivity(trip, activity.id);
    out.swapActivity = hash(sw);
    out.undoAfterSwap = sw.ok ? hash(edit.undo(sw.trip)) : 'n/a';
    out.rejectActivity = hash(edit.rejectActivity(trip, activity.id));
    const pin = edit.pinActivity(trip, activity.id);
    out.pinActivity = hash(pin);
    out.unpinActivity = pin.ok ? hash(edit.unpinActivity(pin.trip, activity.id)) : 'n/a';
  } else {
    out.swapActivity = out.undoAfterSwap = out.rejectActivity = out.pinActivity = out.unpinActivity = 'n/a-no-activity';
  }
  out.makeDayLighter = hash(edit.makeDayLighter(trip, trip.days[0].dayNumber));
  out.swapDays = trip.days.length >= 2 ? hash(edit.swapDays(trip, trip.days[0].dayNumber, trip.days[1].dayNumber)) : 'n/a';
  out.undoNothing = hash(edit.undo(trip));

  // The seven public structural previews, with real ids where pilot data offers them.
  out.previewAdjustNights = stopKey ? hash(rs.previewAdjustNights(trip, stopKey, 1, POPTS)) : 'n/a';
  out.previewChangeLength = hash(rs.previewChangeLength(trip, trip.spec.totalDays + 1, POPTS));
  out.optionalsInPlan = (trip.routePlan.optionals ?? []).map((o) => `${o.optionalId}@${o.positionId}`).join('|') || 'none';
  out.previewAddOptional = I.absentOptional
    ? hash(rs.previewAddOptional(trip, I.absentOptional.optionalId, I.absentOptional.positionId, POPTS))
    : 'n/a-none-absent';
  out.previewRemoveOptional = I.presentOptional
    ? hash(rs.previewRemoveOptional(trip, I.presentOptional.optionalId, POPTS))
    : 'n/a-none-present';
  out.previewMoveOptional = I.presentOptional && I.otherPositionId
    ? hash(rs.previewMoveOptional(trip, I.presentOptional.optionalId, I.otherPositionId, POPTS))
    : 'n/a-no-other-position';
  out.menuStop = I.menuStopKey ? `${I.menuStopKey}:${I.menuId}` : 'none';
  out.fixedExcursions = I.fixedExcursionStops;
  if (I.menuStopKey) {
    const add = rs.previewAddExcursion(trip, I.menuStopKey, I.menuId, POPTS);
    out.previewAddExcursion = hash(add);
    if (add.ok && add.proposals?.[0]) {
      const applied = rs.applyProposal(trip, add.proposals[0]);
      out.applyAddExcursion = hash(applied);
      out.previewRemoveExcursion = applied.ok
        ? hash(rs.previewRemoveExcursion(applied.trip, I.menuStopKey, I.menuId, POPTS))
        : 'n/a';
    } else {
      out.applyAddExcursion = 'n/a-add-refused';
      out.previewRemoveExcursion = 'n/a-add-refused';
    }
  } else {
    out.previewAddExcursion = out.applyAddExcursion = out.previewRemoveExcursion = 'n/a-no-menu';
  }

  if (stopKey) {
    const pv = rs.previewAdjustNights(trip, stopKey, 1, POPTS);
    out.apply = pv.ok && pv.proposals?.[0] ? hash(rs.applyProposal(trip, pv.proposals[0])) : 'n/a';
    out.proposalKeys = pv.ok && pv.proposals?.[0] ? Object.keys(pv.proposals[0]).sort().join(',') : 'n/a';
  } else {
    out.apply = 'n/a';
    out.proposalKeys = 'n/a';
  }

  store.clear();
  const id = saveDraftTrip({ ...trip, history: [] }, 'p1d', 'p1d');
  const re = loadDraftTrip(id);
  out.saveReopen = hash(re.trip);
  out.saveReopenShape = hash(Object.keys(re).sort());

  // Recorded in the clear, not hashed: what each family actually covers.
  out.variantId = trip.routePlan.variantId;
  out.stopPlaceIds = [...new Set(trip.routePlan.stops.map((s) => s.placeId))].join(',');
  return out;
}

/**
 * Input class 2 — an identity-bearing door2-v7 record the reader admits.
 * The envelope is one saveDraftTrip itself produced; the map is then injected into the
 * stored payload, because the writer refuses an identity-bearing input by design
 * (draftStorage.js:137, Rule B). So this is a record a rollback or foreign client could
 * leave behind, read back through the real reader.
 */
function identityBearing(trip) {
  store.clear();
  const id = saveDraftTrip({ ...trip, history: [] }, 'p1d-id', 'p1d-id');
  const raw = JSON.parse(store.get('door2_drafts_v1'));
  const map = {
    version: 1,
    used: ['luid-old', 'luid-later'],
    blocks: {
      'luid-old': {
        stopKey: trip.routePlan.stops[0].key,
        kind: 'open',
        address: { dayOffset: 0, ordinal: 1, slot: 'full' },
        state: 'live'
      }
    },
    edits: { 'luid-old': { intent: 'pin', contentId: null, locked: true, userEdited: true, provenance: 'p1d' } }
  };
  raw[0].trip = { ...raw[0].trip, identity: map };
  store.set('door2_drafts_v1', JSON.stringify(raw));
  const re = loadDraftTrip(id);

  const out = {
    loadedKeys: Object.keys(re).sort().join(','),
    compatible: re.compatible === true,
    readOnly: re.readOnly ?? null,
    identityPreserved: !!re.trip?.identity
  };
  if (!re.compatible) return { ...out, note: 'reader refused' };
  const t = re.trip;
  out.loadedTrip = hash(t);
  out.fingerprint = tripFingerprint(t);
  out.undoNothing = hash(edit.undo(t));
  const act = t.days.flatMap((d) => d.blocks).find((b) => b.type === 'activity');
  out.swapActivity = act ? hash(edit.swapActivity(t, act.id)) : 'n/a';
  out.pinActivity = act ? hash(edit.pinActivity(t, act.id)) : 'n/a';
  const sk = t.routePlan?.stops?.[0]?.key;
  out.previewAdjustNights = sk ? hash(rs.previewAdjustNights(t, sk, 1, POPTS)) : 'n/a';
  if (sk) {
    const pv = rs.previewAdjustNights(t, sk, 1, POPTS);
    out.apply = pv.ok && pv.proposals?.[0] ? hash(rs.applyProposal(t, pv.proposals[0])) : 'n/a';
  }
  const sw = act ? edit.swapActivity(t, act.id) : null;
  out.undoAfterSwap = sw && sw.ok ? hash(edit.undo(sw.trip)) : 'n/a';
  out.usedAfterUndo = sw && sw.ok ? (edit.undo(sw.trip).trip?.identity?.used ?? []).join(',') : 'n/a';
  return out;
}

// Recorded from the unchanged source at bc58722 (see the header).
const FREE = {
  "nyc-single-base": {
    build: "2d8fdeac6850ce72",
    fingerprint: "c8bee609e888e",
    swapActivity: "4621bac2fea7d043",
    undoAfterSwap: "8b4c45f1092f6634",
    rejectActivity: "ca453c4a4f6a5749",
    pinActivity: "6650299f9740b7bd",
    unpinActivity: "4133f387ca31ae80",
    makeDayLighter: "3bee34abd1d1389f",
    swapDays: "840c1ee945066ea8",
    undoNothing: "c8144e99189c7eb9",
    previewAdjustNights: "6bba9fbe01a697ea",
    previewChangeLength: "51a5a5a62157e283",
    optionalsInPlan: "none",
    previewAddOptional: "n/a-none-absent",
    previewRemoveOptional: "n/a-none-present",
    previewMoveOptional: "n/a-no-other-position",
    menuStop: "none",
    fixedExcursions: "none",
    previewRemoveExcursion: "n/a-no-menu",
    applyAddExcursion: "n/a-no-menu",
    previewAddExcursion: "n/a-no-menu",
    apply: "3b47a9ffb3bc4a7b",
    proposalKeys: "baseFingerprint,diff,id,kind,label,routePlan,trip",
    saveReopen: "e47db4a7f3f45733",
    saveReopenShape: "8730ba748bea7f9b",
    variantId: "nyc_city",
    stopPlaceIds: "new_york"
  },
  "peru": {
    build: "29e0e5392283b838",
    fingerprint: "bbaa1d8694043",
    swapActivity: "e80c319695dbadad",
    undoAfterSwap: "3b22e4fb91ce41e4",
    rejectActivity: "0806009778527f7e",
    pinActivity: "27cda6e975870041",
    unpinActivity: "159cfbd49b8546aa",
    makeDayLighter: "f26ed924fcbefe80",
    swapDays: "840c1ee945066ea8",
    undoNothing: "c8144e99189c7eb9",
    previewAdjustNights: "8f96590e0519dcab",
    previewChangeLength: "822ca23a7962e0e9",
    optionalsInPlan: "none",
    previewAddOptional: "n/a-none-absent",
    previewRemoveOptional: "n/a-none-present",
    previewMoveOptional: "n/a-no-other-position",
    menuStop: "none",
    fixedExcursions: "pc_aguas:machu_picchu",
    previewRemoveExcursion: "n/a-no-menu",
    applyAddExcursion: "n/a-no-menu",
    previewAddExcursion: "n/a-no-menu",
    apply: "66e35264a917805a",
    proposalKeys: "baseFingerprint,diff,id,kind,label,routePlan,trip",
    saveReopen: "54d67f8e035a6ab5",
    saveReopenShape: "8730ba748bea7f9b",
    variantId: "peru_classic",
    stopPlaceIds: "lima,cusco,ollantaytambo,aguas_calientes"
  },
  "japan-tokyo-single-base": {
    build: "11d66b0ed986335d",
    fingerprint: "c39ab1c37eb83",
    swapActivity: "b77c8bd7e4ba51dc",
    undoAfterSwap: "354629ee2ece229d",
    rejectActivity: "0706218b75099e0f",
    pinActivity: "c5ad240165166cc0",
    unpinActivity: "da9168cea161afb1",
    makeDayLighter: "03f5c94cfc820c45",
    swapDays: "840c1ee945066ea8",
    undoNothing: "c8144e99189c7eb9",
    previewAdjustNights: "7e04169c44ad9dd6",
    previewChangeLength: "a9c23be6f5c63b77",
    optionalsInPlan: "none",
    previewAddOptional: "n/a-none-absent",
    previewRemoveOptional: "n/a-none-present",
    previewMoveOptional: "n/a-no-other-position",
    menuStop: "tokyo_base:nikko",
    fixedExcursions: "none",
    previewAddExcursion: "772dcdcb0c4a1ba5",
    applyAddExcursion: "f9ebf47a5368131f",
    previewRemoveExcursion: "1217f606b6219a89",
    apply: "103a39daaa105c75",
    proposalKeys: "baseFingerprint,diff,id,kind,label,routePlan,trip",
    saveReopen: "bfbe51434c876c02",
    saveReopenShape: "8730ba748bea7f9b",
    variantId: "tokyo_city",
    stopPlaceIds: "tokyo"
  },
  "japan-multi-stop": {
    build: "b45a257ec9371533",
    fingerprint: "ba5db53cf59ea",
    swapActivity: "fb02d223c12dcd8d",
    undoAfterSwap: "f506f6756dda5055",
    rejectActivity: "10a3c32c84c7ed77",
    pinActivity: "686563f2e4c0c9b1",
    unpinActivity: "bd36bc9718b4899c",
    makeDayLighter: "062a46beffc80a25",
    swapDays: "840c1ee945066ea8",
    undoNothing: "c8144e99189c7eb9",
    previewAdjustNights: "046a47788c2688c8",
    previewChangeLength: "c45a9f325a5b5ea1",
    optionalsInPlan: "kyoto@after_tokyo",
    previewAddOptional: "n/a-none-absent",
    previewRemoveOptional: "c8b01173e87f111b",
    previewMoveOptional: "n/a-no-other-position",
    menuStop: "tokyo_base:nikko",
    fixedExcursions: "none",
    previewAddExcursion: "1434d69303d23cd1",
    applyAddExcursion: "0bfa835f09411ec4",
    previewRemoveExcursion: "573d9d72766aacc3",
    apply: "08096c206f0f0232",
    proposalKeys: "baseFingerprint,diff,id,kind,label,routePlan,trip",
    saveReopen: "c374d213a2440648",
    saveReopenShape: "8730ba748bea7f9b",
    variantId: "tokyo_city+kyoto@after_tokyo",
    stopPlaceIds: "tokyo,kyoto"
  },
  "eastern-canada-reversible": {
    build: "b6032719e56be482",
    fingerprint: "1d0e8cffe949b",
    swapActivity: "221553ecdb468848",
    undoAfterSwap: "56f1cda6ee54b5b9",
    rejectActivity: "26fe86d01d9caad1",
    pinActivity: "f2959f96c4ed4244",
    unpinActivity: "e645c4c95eae6b94",
    makeDayLighter: "d268578fb929165f",
    swapDays: "840c1ee945066ea8",
    undoNothing: "c8144e99189c7eb9",
    previewAdjustNights: "a095998e0b365ef8",
    previewChangeLength: "bd18a77396afc022",
    optionalsInPlan: "ottawa@corridor|niagara@toronto_spur",
    previewAddOptional: "n/a-none-absent",
    previewRemoveOptional: "91a281478658299c",
    previewMoveOptional: "n/a-no-other-position",
    menuStop: "none",
    fixedExcursions: "none",
    previewRemoveExcursion: "n/a-no-menu",
    applyAddExcursion: "n/a-no-menu",
    previewAddExcursion: "n/a-no-menu",
    apply: "bb86c21664b42a91",
    proposalKeys: "baseFingerprint,diff,id,kind,label,routePlan,trip",
    saveReopen: "41adf90e3be217e9",
    saveReopenShape: "8730ba748bea7f9b",
    variantId: "ec_corridor#west_to_east+ottawa@corridor+niagara@toronto_spur",
    stopPlaceIds: "toronto,niagara_falls,ottawa,montreal,quebec_city"
  }
};

const BEARING = {
  peru: {
    loadedKeys: 'compatible,trip',
    compatible: true,
    readOnly: null,
    identityPreserved: true,
    loadedTrip: '87c8fa8da2c8ef5d',
    fingerprint: 'bbaa1d8694043',
    undoNothing: 'c8144e99189c7eb9',
    swapActivity: '4171cbca63280a8d',
    pinActivity: 'c54eee28fa3a8e31',
    previewAdjustNights: '8f96590e0519dcab',
    apply: '8eb800044609332b',
    undoAfterSwap: 'd7643cb1926a7d04',
    usedAfterUndo: 'luid-old,luid-later'
  }
};

const FREE_ALL = '39939e3f5b7ccdd6';
const BEARING_ALL = '69bf60252d5dec81';

test('P1-D: identity-free production paths are byte-identical to the pre-change baseline', () => {
  const observed = {};
  for (const family of Object.keys(FAMILIES)) {
    const trip = build(family);
    assert.ok(trip, `${family}: the producer did not build a trip`);
    observed[family] = matrix(trip);
  }
  for (const [family, expected] of Object.entries(FREE)) {
    assert.deepStrictEqual(observed[family], expected, `${family}: a production path changed`);
  }
  assert.deepEqual(Object.keys(observed).sort(), Object.keys(FREE).sort(), 'the family set itself changed');
  assert.equal(hash(observed), FREE_ALL, 'the full identity-free matrix changed');
});

test('P1-D: an identity-bearing door2-v7 record the reader admits behaves exactly as at base', () => {
  const trip = build('peru');
  assert.ok(trip);
  const observed = { peru: identityBearing(trip) };
  // The admission facts themselves, asserted in the clear: this record loads compatible
  // with no lock and keeps its map, which is why dormancy cannot be keyed on presence.
  assert.equal(observed.peru.compatible, true, 'the reader no longer admits this record');
  assert.equal(observed.peru.readOnly, null, 'this record acquired a lock it did not have at base');
  assert.equal(observed.peru.identityPreserved, true, 'the identity map was stripped');
  assert.deepStrictEqual(observed.peru, BEARING.peru, 'behaviour on an admitted identity-bearing record changed');
  assert.equal(hash(observed), BEARING_ALL, 'the full identity-bearing matrix changed');
});
