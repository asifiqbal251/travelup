/** @typedef {import('./types.js').Trip} Trip */
/** @typedef {import('./types.js').SkeletonAssemblyInput} SkeletonAssemblyInput */

import { BUFFER_RULESET_VERSION } from './bufferRuleset.js';
import { PILOT_DATA_VERSION } from './pilotData.js';
import { ENGINE_VERSION } from './scheduleConfig.js';

// F4 bridge: assembles an UNFILLED SKELETON Trip from a validated
// {sequence, plan, skeleton} plus explicit traveller and lifecycle inputs, and
// nothing else. It is a bridge, not F4's persistence work: no snapshot v2, no
// block identity, no contract freeze. No live build path calls it.
//
// THE CONTRACT. Assembly enforces input consistency. It does not rerun route
// selection, scheduling, or package-based feasibility validation. It never
// calls scheduleRoute, selectRoutes, validateSkeleton, resolveExcursions,
// findRoutePackage or compileFamilies, and it never reads a package, a family
// or a route catalogue; materialiseTripSequence, conversely, never sees the
// plan. The stage boundary is this file's direct imports: three version
// constants. (The one from pilotData.js is PILOT_DATA_VERSION for
// versions.routeData, exactly as planner.js writes it; pilotData.js itself
// compiles the catalogue on load, so the boundary holds for direct imports
// only, as it does for stage 2.)
//
// Every input is explicit. Nothing is recovered from a global, defaulted, or
// copied from an old Trip. Each disagreement between the sequence, the plan and
// the skeleton is refused with a plain Error naming the field and both values;
// assembly never prefers whichever object is convenient.
//
// What it cannot check, stated rather than over-claimed:
// - STATUS. Only 'draft' and 'valid' are accepted: the two statuses a skeleton
//   validation writes (validate.js:180). 'incomplete' is set only by filling
//   (fill.js:256, edit.js:48), and nothing in src/ produces 'conflict'.
//   Assembly cannot confirm that a supplied status reflects a feasibility
//   validation it did not run: it refuses a status no skeleton stage 1 can
//   produce; it cannot certify one that is merely wrong. If that proves
//   insufficient, stage 1 should pass a validation result assembly can attest
//   to; assembly does not start validating.
// - MENUS. The plan supplies selected excursion ids; the resolved place,
//   connection and on-site hours live on the sequence. Assembly compares ids
//   against the plan, the plan's fixed excursions against the sequence's in
//   full, and every resolved requirement against its calendar blocks. It does
//   not revalidate menu definitions: that needs the package, which it may not
//   read. Nor does it compare travel-block durations, which come from the
//   buffer ruleset it must not recompute.
//
// THE TRIP ID. `plan.variantId` composes the legacy Trip.id and the
// spec.routeTemplateId mirror. That preserves today's id construction for the
// current compiled packages, where pkg.id === pkg.variantId for every variant;
// it is not generalized to arbitrary future package producers. The legacy
// Trip.id is distinct from the stable TripSequence.id, and this bridge settles
// nothing about F4's future identity design (Q8).
//
// minDays / maxDays. One policy: recompute, verify against the plan's cached
// values, reject disagreement. A plan stop's minNights is the EFFECTIVE minimum
// (raised for selected excursions); its maxNights is the package maximum.
//
// warnings is SEEDED here from the stretch predicate (the same test as
// schedule.js's nightsOverride path, duplicated so as not to touch the
// scheduler) and never owned: fill.js appends to it later.
//
// history is [] for a fresh build and for a rebuild proposal alike. Assembly
// never appends, caps or strips; edit.js and restructure.js applyProposal own
// history creation.
//
// Pure: no randomness, no Date.now().

// What validateSkeleton writes (validate.js:180). Why the other Trip statuses are refused, by name.
const STATUSES = new Set(['draft', 'valid']);
const REFUSED_STATUSES = {
  incomplete: 'is set only by filling and cannot belong to an unfilled skeleton',
  conflict: 'has no producer in the engine'
};
const STRETCH_WARNING = 'nights_above_package_max';

const INPUT_KEYS = new Set(['sequence', 'plan', 'skeleton', 'spec', 'status', 'contentVersion', 'bufferRuleset', 'history']);

// Traveller intent, carried verbatim. routeTemplateId and stops are derived
// mirrors: accepted on the input, never read, compared or rejected on, and
// always rebuilt from the plan and the sequence (a rebuild legitimately hands
// over the OLD spec, restructure.js:244–247).
const CARRIED_SPEC_KEYS = new Set([
  'originPlaceId',
  'destination',
  'totalDays',
  'travelMonth',
  'travellerType',
  'interests',
  'pace',
  'budget',
  'durationFlexible',
  'startDate',
  'endDate',
  'requiredPlaceIds',
  'choices'
]);
const MIRROR_SPEC_KEYS = new Set(['routeTemplateId', 'stops']);

const show = (v) => JSON.stringify(v);
const sum = (xs) => xs.reduce((a, b) => a + b, 0);

function refuse(message) {
  throw new Error(`assemble: ${message}`);
}

/** Refuses when a !== b (compared as JSON), naming the field and both values. */
function agree(field, a, aName, b, bName) {
  if (show(a) !== show(b)) refuse(`${field} disagree: ${aName} ${show(a)}, ${bName} ${show(b)}`);
}

/** Drops undefined values so the Trip survives a JSON round-trip unchanged. */
function withoutUndefined(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
}

const requirement = ({ placeId, connectionId, hoursOnSite }) => ({ placeId, connectionId, hoursOnSite });

/**
 * §2 check 7: the calendar matches the resolved requirements, fixed and selected,
 * not just their names. Each requirement owns exactly three blocks, built by
 * schedule.js:286–288; the skeleton's ex: blocks must be exactly those, with the
 * requirement's stop, places, connection and visit length. Travel-block
 * durations are not compared: they come from the buffer ruleset.
 */
function checkExcursionBlocks(entries, skeleton) {
  const exBlocks = skeleton.days.flatMap((d) => d.blocks).filter((b) => typeof b.id === 'string' && b.id.startsWith('ex:'));
  const byId = new Map();
  for (const b of exBlocks) {
    if (byId.has(b.id)) refuse(`skeleton has duplicate block ${b.id}`);
    byId.set(b.id, b);
  }

  const expected = new Set();
  for (const e of entries) {
    // Two requirements to one place on one entry would share block ids and could not be told apart.
    const places = e.excursions.map((x) => x.placeId);
    const repeated = places.find((p, i) => places.indexOf(p) !== i);
    if (repeated !== undefined) refuse(`entry ${e.stopKey} has more than one excursion requirement to ${repeated}; their blocks cannot be told apart`);

    for (const x of e.excursions) {
      const what = `excursion requirement ${e.stopKey} -> ${x.placeId}`;
      const block = (part) => {
        const id = `ex:${e.stopKey}:${x.placeId}:${part}`;
        expected.add(id);
        const b = byId.get(id);
        if (!b) refuse(`${what} disagrees with the skeleton: sequence requires it, skeleton has no block ${id}`);
        return b;
      };
      const field = (id, name, required, actual) => agree(`${what}: ${id} ${name}`, required, 'sequence', actual, 'skeleton');
      const leg = (part, from, to) => {
        const b = block(part);
        field(b.id, 'type', 'travel', b.type);
        field(b.id, 'anchor.stopId', e.stopKey, b.anchor?.stopId);
        field(b.id, 'connectionId', x.connectionId, b.transport?.connectionId);
        field(b.id, 'fromPlaceId', from, b.transport?.fromPlaceId);
        field(b.id, 'toPlaceId', to, b.transport?.toPlaceId);
      };

      leg('out', e.placeId, x.placeId);
      const site = block('site');
      field(site.id, 'type', 'open', site.type);
      field(site.id, 'anchor.stopId', e.stopKey, site.anchor?.stopId);
      field(site.id, 'placeId', x.placeId, site.placeId);
      // The scheduler's own rounding: siteMin = Math.round(hoursOnSite * 60) (schedule.js:268), durationHours = minutes / 60 (:164).
      field(site.id, 'visit minutes', Math.round(x.hoursOnSite * 60), Math.round(site.durationHours * 60));
      leg('back', x.placeId, e.placeId);
    }
  }

  const unexpected = [...byId.keys()].filter((id) => !expected.has(id));
  if (unexpected.length > 0) refuse(`skeleton has ex: block(s) no requirement accounts for: ${unexpected.join(', ')}`);
}

/** §2 checks 1–8 and 12: the sequence, the plan and the skeleton describe the same journey. */
function checkConsistency(sequence, plan, skeleton) {
  const entries = sequence.entries;
  const stops = plan.stops;

  // 1. Count and order (order is enforced pairwise by 2 and 3).
  if (entries.length !== stops.length) refuse(`stop count disagrees: sequence.entries ${entries.length}, plan.stops ${stops.length}`);
  entries.forEach((e, i) => {
    const s = stops[i];
    // 2–4. Keys, places and allocated nights, pairwise by position.
    agree(`stop ${i} key`, e.stopKey, 'sequence', s.key, 'plan');
    agree(`stop ${e.stopKey} placeId`, e.placeId, 'sequence', s.placeId, 'plan');
    agree(`stop ${e.stopKey} nights`, e.nights, 'sequence', s.nights, 'plan');
    // 6. Selected excursion ids (absent means none, on both).
    agree(`stop ${e.stopKey} selectedExcursionIds`, e.selectedExcursionIds ?? [], 'sequence', s.selectedExcursionIds ?? [], 'plan');
    // 12. Fixed excursions: the plan stop holds them in full, so they are compared in full, order preserved.
    agree(
      `stop ${e.stopKey} fixed excursions`,
      e.excursions.filter((x) => x.source === 'fixed').map(requirement),
      'sequence',
      (s.excursions ?? []).map(requirement),
      'plan'
    );
  });

  // 5. The ordered journey connections, the return leg included.
  const legs = [...entries.map((e) => e.inboundConnectionId), sequence.returnConnectionId];
  agree('journey connections', legs, 'sequence', plan.connectionIds, 'plan.connectionIds');

  // 7. The calendar matches every resolved excursion requirement, and carries no other ex: block.
  checkExcursionBlocks(entries, skeleton);

  // 8. The skeleton's stop summaries: same stops, order and nights as the sequence.
  const summary = (xs) => xs.map(({ stopKey, placeId, nights }) => ({ stopKey, placeId, nights }));
  agree(
    'stop summaries',
    summary(entries),
    'sequence',
    summary(skeleton.stops.map((s) => ({ stopKey: s.stopId, placeId: s.placeId, nights: s.nights }))),
    'skeleton'
  );
}

/**
 * Assembles an unfilled skeleton Trip from a validated {sequence, plan,
 * skeleton} and explicit traveller and lifecycle inputs. Parity is with
 * buildSkeletonTrip / buildTripFromRoutePlan, not with a filled Trip.
 *
 * Throws a plain Error on any inconsistency, missing or undeclared input.
 *
 * @param {SkeletonAssemblyInput} input
 * @returns {{ok: true, value: Trip}}
 */
export function assembleSkeletonTripFromSequence(input) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) refuse('input must be an object');
  const undeclared = Object.keys(input).filter((k) => !INPUT_KEYS.has(k));
  if (undeclared.length > 0) refuse(`undeclared input(s) ${undeclared.join(', ')}`);
  for (const key of INPUT_KEYS) if (input[key] === undefined) refuse(`missing input ${key}`);
  const { sequence, plan, skeleton, spec, status, contentVersion, bufferRuleset, history } = input;

  // Lifecycle inputs.
  if (!STATUSES.has(status)) {
    const why = Object.hasOwn(REFUSED_STATUSES, status) ? ` (it ${REFUSED_STATUSES[status]})` : '';
    refuse(`status ${show(status)} is refused${why}; accepted: ${[...STATUSES].join(', ')}`);
  }
  if (contentVersion !== 'none') refuse(`contentVersion ${show(contentVersion)}: an unfilled skeleton's content version is "none"`);
  if (!Array.isArray(history) || history.length > 0) refuse(`history ${show(history)}: assembly writes [] and never appends`);
  if (typeof bufferRuleset?.id !== 'string') refuse('bufferRuleset has no id');

  // Traveller intent: only the declared fields; the mirrors are accepted and ignored.
  if (spec === null || typeof spec !== 'object' || Array.isArray(spec)) refuse('spec must be an object');
  const unknownSpec = Object.keys(spec).filter((k) => !CARRIED_SPEC_KEYS.has(k) && !MIRROR_SPEC_KEYS.has(k));
  if (unknownSpec.length > 0) refuse(`undeclared spec field(s) ${unknownSpec.join(', ')}`);
  if (typeof spec.destination?.id !== 'string' || spec.destination.id.trim() === '') {
    refuse('spec.destination.id must be a non-empty string');
  }

  checkConsistency(sequence, plan, skeleton);

  // 9–10. The traveller's request is checked against the build, never rewritten to match it.
  agree('origin', spec.originPlaceId, 'spec.originPlaceId', sequence.origin.placeId, 'sequence.origin.placeId');
  agree('day count', spec.totalDays, 'spec.totalDays', skeleton.days.length, 'skeleton.days.length');

  // 11. Recompute minDays / maxDays from the plan's EFFECTIVE minima and verify the cached values.
  const extra = sum(sequence.entries.map((e, i) => e.nights - plan.stops[i].minNights));
  const minDays = skeleton.days.length - extra;
  const maxDays = minDays + sum(plan.stops.map((s) => s.maxNights - s.minNights));
  agree('minDays', minDays, 'recomputed', plan.minDays, 'plan.minDays');
  agree('maxDays', maxDays, 'recomputed', plan.maxDays, 'plan.maxDays');

  // The initial warnings: the stretch predicate, sequence nights against the plan's maximums. Seeded from it
  // alone, so a fill-only warning (content_insufficient, fill.js:258) can never appear here.
  const stretched = sequence.entries.some((e, i) => e.nights > plan.stops[i].maxNights);
  const warnings = stretched ? [STRETCH_WARNING] : [];

  // Carried values in the input's key order. A mirror key only holds its place (as the spread at planner.js:178
  // does); its value is never read and is overwritten below.
  const carried = Object.fromEntries(Object.keys(spec).map((k) => [k, CARRIED_SPEC_KEYS.has(k) ? spec[k] : undefined]));
  const trip = {
    id: `door2:${spec.originPlaceId}:${spec.destination.id}:${spec.totalDays}:${plan.variantId}`,
    status,
    spec: withoutUndefined({
      ...carried,
      requiredPlaceIds: [...(spec.requiredPlaceIds ?? [])],
      // Derived mirrors, rebuilt from the plan and the sequence (planner.js:181–188).
      routeTemplateId: plan.variantId,
      stops: plan.stops.map((s, i) => ({
        id: s.key,
        placeId: s.placeId,
        placeSource: 'recommendation',
        nights: sequence.entries[i].nights,
        isRequired: s.isRequired
      })),
      choices: spec.choices ?? { pinned: [], rejected: [], placed: [] }
    }),
    routePlan: structuredClone(plan),
    days: structuredClone(skeleton.days),
    warnings,
    versions: {
      engine: ENGINE_VERSION,
      schema: 'door2-v6',
      content: contentVersion,
      routeData: PILOT_DATA_VERSION,
      bufferRuleset: `${bufferRuleset.id}@${bufferRuleset.version ?? BUFFER_RULESET_VERSION}`
    },
    history: []
  };
  return { ok: true, value: trip };
}
