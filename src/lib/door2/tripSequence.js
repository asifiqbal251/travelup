/** @typedef {import('./types.js').Trip} Trip */
/** @typedef {import('./types.js').RoutePlanStop} RoutePlanStop */
/** @typedef {import('./types.js').TripSequence} TripSequence */
/** @typedef {import('./types.js').TripSequenceEntry} TripSequenceEntry */
/** @typedef {import('./types.js').ResolvedExcursion} ResolvedExcursion */

import { PILOT_DATA, findRoutePackage, planSelection, resolveExcursions } from './planner.js';

// F3: the TripSequence contract (design Q2), projected READ-ONLY from a built
// Door 2 Trip. Nothing in the build path calls this: route -> schedule -> fill
// -> edit still run on RoutePlan. The contract is provisional: reading a
// finished trip backwards does not prove a sequence can be produced before
// scheduling (F3 brief §4a).
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
 * needs the compiled package: the Trip alone cannot resolve a selection.
 * @returns {Object<string, ResolvedExcursion[]>} stopKey → selected requirements, in menu order.
 */
function resolveSelected(trip, data) {
  const selection = planSelection(trip.routePlan);
  if (Object.keys(selection).length === 0) return {};
  const pkg = findRoutePackage(data, trip.routePlan.variantId);
  if (!pkg) throw new Error(`tripSequence: unknown variant "${trip.routePlan.variantId}"; cannot resolve selected excursions`);
  const resolved = resolveExcursions(pkg, selection, trip.spec, data);
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

/**
 * Problems with a TripSequence's internal consistency; empty when well-formed.
 * @param {TripSequence} seq
 * @returns {string[]}
 */
export function checkTripSequence(seq) {
  const problems = [];
  if (seq.schemaVersion !== 2) problems.push(`schemaVersion is ${seq.schemaVersion}, expected 2`);
  if (typeof seq.id !== 'string' || seq.id === '') problems.push('id is missing');
  if (seq.source !== 'door1' && seq.source !== 'door2') problems.push(`source "${seq.source}" is not a door`);
  if (typeof seq.origin?.placeId !== 'string') problems.push('origin.placeId is missing');
  if (seq.totalDays !== undefined && !(Number.isInteger(seq.totalDays) && seq.totalDays >= 1)) problems.push(`totalDays ${seq.totalDays} is not a day count`);
  if (typeof seq.returnConnectionId !== 'string') problems.push('returnConnectionId is missing');
  if (!(seq.entries?.length > 0)) problems.push('entries is empty');

  for (const e of seq.entries ?? []) {
    const at = `entry ${e.stopKey}`;
    if (!(Number.isInteger(e.nights) && e.nights >= 0)) problems.push(`${at}: nights ${e.nights} is not a night count`);
    if (typeof e.inboundConnectionId !== 'string') problems.push(`${at}: inboundConnectionId is missing`);
    if (!Array.isArray(e.excursions)) {
      problems.push(`${at}: excursions is missing`);
      continue;
    }
    // A day trip leaves from somewhere the traveller sleeps; on a zero-night stop it would be silently lost.
    if (e.nights === 0 && e.excursions.length > 0) problems.push(`${at}: zero nights but ${e.excursions.length} excursion requirement(s)`);
    if ('selectedExcursionIds' in e && !(e.selectedExcursionIds?.length > 0)) problems.push(`${at}: selectedExcursionIds is present but empty`);
    const selectedIds = e.excursions.filter((x) => x.source === 'selected').map((x) => x.excursionId);
    if (JSON.stringify(selectedIds) !== JSON.stringify(e.selectedExcursionIds ?? [])) problems.push(`${at}: selected requirements do not match selectedExcursionIds`);
    const role = tripSequenceRole(e);
    if (e.role !== role) problems.push(`${at}: role ${e.role}, expected ${role}`);
  }
  return problems;
}

/**
 * Projects a built Door 2 Trip onto the TripSequence contract. Read-only: the
 * Trip is not changed. Throws on a trip the contract cannot represent.
 *
 * totalDays is the REALISED day count, trip.days.length, and nothing else. The
 * requested length lives in trip.spec.totalDays under the same name; it is an
 * input to the engine and is never read here.
 *
 * @param {Trip} trip                 A built door2-v6 Trip (it has a routePlan).
 * @param {{id: string, data?: Object}} options
 *   id: the caller's stable id; never derived from content, never the fingerprint (Q8).
 *   data: graph and packages, used only to resolve selected excursions.
 * @returns {TripSequence}
 */
export function tripSequenceFromTrip(trip, { id, data = PILOT_DATA } = {}) {
  if (typeof id !== 'string' || id === '') throw new Error('tripSequence: the caller must supply an id');
  const plan = trip.routePlan;
  if (!plan) throw new Error('tripSequence: trip has no routePlan (door2-v6 required)');
  // Round trip: the journey out, one leg between each pair of stops, and the journey home.
  if (plan.connectionIds.length !== plan.stops.length + 1) {
    throw new Error(`tripSequence: ${plan.connectionIds.length} connections for ${plan.stops.length} stops; expected stops + 1`);
  }

  const selected = resolveSelected(trip, data);
  const entries = plan.stops.map((stop, i) => ({
    placeId: stop.placeId,
    stopKey: stop.key,
    nights: stop.nights,
    role: tripSequenceRole(stop),
    // Traveller state; the key is absent when empty, as on the plan.
    ...(stop.selectedExcursionIds?.length > 0 ? { selectedExcursionIds: [...stop.selectedExcursionIds] } : {}),
    excursions: [...(stop.excursions ?? []).map(fixedExcursion), ...(selected[stop.key] ?? [])],
    inboundConnectionId: plan.connectionIds[i]
  }));

  const seq = {
    schemaVersion: 2,
    id,
    source: 'door2',
    origin: { placeId: trip.spec.originPlaceId },
    ...(trip.spec.travelMonth != null ? { travelMonth: trip.spec.travelMonth } : {}),
    totalDays: trip.days.length,
    entries,
    returnConnectionId: plan.connectionIds[entries.length]
    // evidence: reserved for Q7 (design §Q7); absent until F6/F7 define its shape.
  };

  const problems = checkTripSequence(seq);
  if (problems.length > 0) throw new Error(`tripSequence: ${problems.join('; ')}`);
  return seq;
}
