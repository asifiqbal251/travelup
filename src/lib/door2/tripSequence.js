/** @typedef {import('./types.js').Trip} Trip */
/** @typedef {import('./types.js').TripSpec} TripSpec */
/** @typedef {import('./types.js').RoutePlan} RoutePlan */
/** @typedef {import('./types.js').RoutePlanStop} RoutePlanStop */
/** @typedef {import('./types.js').TripSequence} TripSequence */
/** @typedef {import('./types.js').TripSequenceEntry} TripSequenceEntry */
/** @typedef {import('./types.js').ResolvedExcursion} ResolvedExcursion */

import { orientConnection } from './bufferRuleset.js';
import { PILOT_DATA, findRoutePackage, planSelection, resolveExcursions } from './planner.js';
import { getPlace } from './route.js';

// The TripSequence contract (design Q2): the handoff between stage 1, planning
// (route, allocation, excursion feasibility; it legitimately runs the scheduler),
// and stage 2, materialisation (materialise.js), which reads only the sequence,
// the graph and declared runtime configuration.
//
// The sequence follows planning and allocation, which may use shared timing
// simulations. It precedes final itinerary materialisation. That the current
// planner fuses allocation and scheduling is an implementation fact, not an
// architectural necessity.
//
// F3 projected a sequence read-only from a built Trip. F3b converts an
// already-allocated plan into one (tripSequenceFromPlan); the Trip projection is
// now that plus the realised day count. No existing live build path consumes
// either: route -> schedule -> fill -> edit still run on RoutePlan. The stage-2
// boundary demonstrated so far is scheduling only (materialise.js).
//
// Planning outputs the contract does not carry: the minimum duration
// (routePlan.minDays, from the plan's EFFECTIVE minima) and the stretch warning
// (Trip.warnings, nights_above_package_max) belong to stage 1 and must reach any
// assembled trip (design v6.9 §Q2). The F4 bridge, assemble.js, holds them on
// the RoutePlan beside the sequence and recomputes and verifies them when it
// assembles a skeleton Trip; nothing here produces or carries them.
//
// Pure: no randomness, no Date.now().

/**
 * What a stop is in this itinerary (F1-D30), from the plan stop alone. NOT
 * RoutePlanStop.role, which says why the stop is in the plan. An unselected
 * menu does not make a hub; only a realised (fixed or selected) excursion does.
 * @param {Pick<RoutePlanStop, 'nights'|'excursions'|'selectedExcursionIds'>} stop
 * @returns {'base'|'hub'|'passthrough'}
 */
export function tripSequenceRole(stop) {
  if (stop.nights === 0) return 'passthrough';
  if ((stop.excursions?.length ?? 0) > 0 || (stop.selectedExcursionIds?.length ?? 0) > 0) return 'hub';
  return 'base';
}

const fixedExcursion = ({ placeId, connectionId, hoursOnSite }) => ({ placeId, connectionId, hoursOnSite, source: 'fixed' });

/**
 * The selected excursions of every stop, as scheduling requirements. A plan stop
 * holds only menu ids, so this goes through the engine's own resolver, which
 * needs the compiled package: the plan alone cannot resolve a selection.
 * @returns {Object<string, ResolvedExcursion[]>} stopKey → selected requirements, in menu order.
 */
function resolveSelected(spec, routePlan, data) {
  const selection = planSelection(routePlan);
  if (Object.keys(selection).length === 0) return {};
  const pkg = findRoutePackage(data, routePlan.variantId);
  if (!pkg) throw new Error(`tripSequence: unknown variant "${routePlan.variantId}"; cannot resolve selected excursions`);
  const resolved = resolveExcursions(pkg, selection, spec, data);
  if (!resolved.ok) throw new Error(`tripSequence: selected excursions do not resolve (${resolved.reason}${resolved.stopKey ? ` at ${resolved.stopKey}` : ''})`);

  const out = {};
  for (const [stopKey, ids] of Object.entries(resolved.selected)) {
    // The resolver's derived stop schedules the package's fixed excursions, then the selected ones in menu order.
    const fixedCount = pkg.stops.find((s) => s.id === stopKey).excursions.length;
    const selected = resolved.pkg.stops.find((s) => s.id === stopKey).excursions.slice(fixedCount);
    if (selected.length !== ids.length) throw new Error(`tripSequence: ${stopKey} resolved ${selected.length} excursions for ${ids.length} selected`);
    out[stopKey] = selected.map((ex, i) => ({ ...fixedExcursion(ex), source: 'selected', excursionId: ids[i] }));
  }
  return out;
}

const isId = (v) => typeof v === 'string' && v !== '';

/**
 * Problems with a TripSequence; empty when well-formed.
 *
 * Without `data` this is the cheap structural check: shapes, identifiers,
 * uniqueness, roles, excursion requirements. It cannot tell whether a leg goes
 * where its position says, so a sequence with the right NUMBER of legs but the
 * wrong endpoints (an open-jaw journey, a swapped leg, a moved stop) passes it.
 * With `data` it also checks against the graph: every place and connection
 * exists, every leg is orientable between the endpoints its position implies
 * (the last entry → origin included), and every excursion connection serves its
 * base both ways. That is the check a rehydrated sequence needs.
 *
 * @param {TripSequence} seq
 * @param {{data?: {places: Object|Map, connections: Object[]}}} [options]
 * @returns {string[]}
 */
export function checkTripSequence(seq, { data } = {}) {
  const problems = [];
  if (seq.schemaVersion !== 2) problems.push(`schemaVersion is ${seq.schemaVersion}, expected 2`);
  if (!isId(seq.id)) problems.push('id is missing');
  if (seq.source !== 'door1' && seq.source !== 'door2') problems.push(`source "${seq.source}" is not a door`);
  if (!isId(seq.origin?.placeId)) problems.push('origin.placeId is missing');
  if (seq.totalDays !== undefined && !(Number.isInteger(seq.totalDays) && seq.totalDays >= 1)) problems.push(`totalDays ${seq.totalDays} is not a day count`);
  if (!isId(seq.returnConnectionId)) problems.push('returnConnectionId is missing');
  if (!(seq.entries?.length > 0)) problems.push('entries is empty');

  const seenKeys = new Set();
  (seq.entries ?? []).forEach((e, i) => {
    const at = isId(e.stopKey) ? `entry ${e.stopKey}` : `entry #${i}`;
    if (!isId(e.stopKey)) problems.push(`entry #${i}: stopKey is missing`);
    else if (seenKeys.has(e.stopKey)) problems.push(`${at}: stopKey "${e.stopKey}" is not unique`);
    else seenKeys.add(e.stopKey);
    if (!isId(e.placeId)) problems.push(`${at}: placeId is missing`);
    if (!(Number.isInteger(e.nights) && e.nights >= 0)) problems.push(`${at}: nights ${e.nights} is not a night count`);
    if (!isId(e.inboundConnectionId)) problems.push(`${at}: inboundConnectionId is missing`);
    if (!Array.isArray(e.excursions)) {
      problems.push(`${at}: excursions is missing`);
      return;
    }
    e.excursions.forEach((x, j) => {
      const ex = `${at}: excursion ${j}`;
      if (!isId(x.placeId)) problems.push(`${ex}: placeId is missing`);
      if (!isId(x.connectionId)) problems.push(`${ex}: connectionId is missing`);
      if (!(Number.isFinite(x.hoursOnSite) && x.hoursOnSite > 0)) problems.push(`${ex}: hoursOnSite ${x.hoursOnSite} is not a duration`);
      if (x.source !== 'fixed' && x.source !== 'selected') problems.push(`${ex}: source "${x.source}" is not fixed or selected`);
    });
    // A day trip leaves from somewhere the traveller sleeps; on a zero-night stop it would be silently lost.
    if (e.nights === 0 && e.excursions.length > 0) problems.push(`${at}: zero nights but ${e.excursions.length} excursion requirement(s)`);
    if ('selectedExcursionIds' in e && !(e.selectedExcursionIds?.length > 0)) problems.push(`${at}: selectedExcursionIds is present but empty`);
    const selectedIds = e.excursions.filter((x) => x.source === 'selected').map((x) => x.excursionId);
    if (JSON.stringify(selectedIds) !== JSON.stringify(e.selectedExcursionIds ?? [])) problems.push(`${at}: selected requirements do not match selectedExcursionIds`);
    const role = tripSequenceRole(e);
    if (e.role !== role) problems.push(`${at}: role ${e.role}, expected ${role}`);
  });

  if (data && problems.length === 0) problems.push(...graphProblems(seq, data));
  return problems;
}

/** The graph half of checkTripSequence; runs only on a structurally sound sequence. */
function graphProblems(seq, data) {
  const problems = [];
  const knownPlace = (id, what) => {
    if (getPlace(data.places, id)) return true;
    problems.push(`${what}: unknown place "${id}"`);
    return false;
  };
  const connection = (id, what) => {
    const row = data.connections.find((c) => c.id === id);
    if (!row) problems.push(`${what}: unknown connection "${id}"`);
    return row;
  };

  const origin = seq.origin.placeId;
  knownPlace(origin, 'origin');
  seq.entries.forEach((e) => knownPlace(e.placeId, `entry ${e.stopKey}`));

  // Round trip: origin → entry 0 → … → last entry → origin, one leg each, in that order.
  const legPlaces = [origin, ...seq.entries.map((e) => e.placeId), origin];
  const legs = [...seq.entries.map((e) => e.inboundConnectionId), seq.returnConnectionId];
  legs.forEach((id, i) => {
    const what = i === seq.entries.length ? 'returnConnectionId' : `entry ${seq.entries[i].stopKey}: inboundConnectionId`;
    const row = connection(id, what);
    if (row && !orientConnection(row, legPlaces[i], legPlaces[i + 1])) problems.push(`${what} "${id}" does not serve ${legPlaces[i]} -> ${legPlaces[i + 1]}`);
  });

  seq.entries.forEach((e) => {
    e.excursions.forEach((x, j) => {
      const what = `entry ${e.stopKey}: excursion ${j}`;
      if (!knownPlace(x.placeId, what)) return;
      const row = connection(x.connectionId, what);
      if (row && !(orientConnection(row, e.placeId, x.placeId) && orientConnection(row, x.placeId, e.placeId))) {
        problems.push(`${what}: connection "${x.connectionId}" does not serve ${e.placeId} <-> ${x.placeId}`);
      }
    });
  });
  return problems;
}

/**
 * Stage 1's output: converts an ALREADY-ALLOCATED plan into a TripSequence. It
 * does not perform route selection or initial allocation; the planner has
 * already done both (using the scheduler's timing simulations) by the time a
 * RoutePlan exists. It runs before materialisation: no Trip and no days are
 * read, so totalDays is absent; there is no realised day count to report. The
 * plan's nights are carried, never recomputed.
 *
 * The producer may read the package (to resolve selected excursions); the
 * consumer may not. Throws on a plan the contract cannot represent.
 *
 * @param {TripSpec} spec              Read for originPlaceId and travelMonth (and handed to the excursion resolver).
 * @param {RoutePlan} routePlan
 * @param {{id: string, data?: Object}} options
 *   id: the caller's stable id; never derived from content, never the fingerprint (Q8).
 *   data: graph and packages; packages are read only to resolve selected excursions.
 * @returns {TripSequence}
 */
export function tripSequenceFromPlan(spec, routePlan, { id, data = PILOT_DATA } = {}) {
  if (!isId(id)) throw new Error('tripSequence: the caller must supply an id');
  if (!routePlan) throw new Error('tripSequence: no routePlan (door2-v6 required)');
  // Round trip: the journey out, one leg between each pair of stops, and the journey home. This rejects a
  // wrong COUNT only; an open-jaw route with stops + 1 legs is rejected by the graph check below.
  if (routePlan.connectionIds.length !== routePlan.stops.length + 1) {
    throw new Error(`tripSequence: ${routePlan.connectionIds.length} connections for ${routePlan.stops.length} stops; expected stops + 1`);
  }

  const selected = resolveSelected(spec, routePlan, data);
  const entries = routePlan.stops.map((stop, i) => ({
    placeId: stop.placeId,
    stopKey: stop.key,
    nights: stop.nights,
    role: tripSequenceRole(stop),
    // Traveller state; the key is absent when empty, as on the plan.
    ...(stop.selectedExcursionIds?.length > 0 ? { selectedExcursionIds: [...stop.selectedExcursionIds] } : {}),
    excursions: [...(stop.excursions ?? []).map(fixedExcursion), ...(selected[stop.key] ?? [])],
    inboundConnectionId: routePlan.connectionIds[i]
  }));

  const seq = {
    schemaVersion: 2,
    id,
    source: 'door2',
    origin: { placeId: spec.originPlaceId },
    ...(spec.travelMonth != null ? { travelMonth: spec.travelMonth } : {}),
    entries,
    returnConnectionId: routePlan.connectionIds[entries.length]
    // evidence: reserved for Q7 (design §Q7); absent until F6/F7 define its shape.
  };

  const problems = checkTripSequence(seq, { data });
  if (problems.length > 0) throw new Error(`tripSequence: ${problems.join('; ')}`);
  return seq;
}

/**
 * Projects a built Door 2 Trip onto the TripSequence contract: the plan's
 * sequence (tripSequenceFromPlan) plus the realised day count. Read-only: the
 * Trip is not changed.
 *
 * totalDays is the REALISED day count, trip.days.length, and nothing else. The
 * requested length lives in trip.spec.totalDays under the same name; it is an
 * input to the engine and is never read here.
 *
 * @param {Trip} trip                 A built door2-v6 Trip (it has a routePlan).
 * @param {{id: string, data?: Object}} options  As tripSequenceFromPlan.
 * @returns {TripSequence}
 */
export function tripSequenceFromTrip(trip, { id, data = PILOT_DATA } = {}) {
  if (!trip.routePlan) throw new Error('tripSequence: trip has no routePlan (door2-v6 required)');
  const { entries, returnConnectionId, ...head } = tripSequenceFromPlan(trip.spec, trip.routePlan, { id, data });
  const seq = { ...head, totalDays: trip.days.length, entries, returnConnectionId };
  const problems = checkTripSequence(seq);
  if (problems.length > 0) throw new Error(`tripSequence: ${problems.join('; ')}`);
  return seq;
}
