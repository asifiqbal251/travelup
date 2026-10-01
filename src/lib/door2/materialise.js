/** @typedef {import('./types.js').TripSequence} TripSequence */
/** @typedef {import('./types.js').RouteResult} RouteResult */

import { DEFAULT_BUFFER_RULESET } from './bufferRuleset.js';
import { FAILURE_STATES } from './failureStates.js';
import { scheduleRoute } from './schedule.js';
import { SCHEDULE_CONFIG } from './scheduleConfig.js';

// F3b: stage 2 of the handoff (design Q2). Materialises a TripSequence into a
// timed skeleton from the sequence, the graph (places, connections) and
// declared runtime configuration ONLY. It never takes a RoutePlan, a family, a
// package or a package id, and it reuses scheduleRoute rather than timing
// anything itself. Nothing in the live build path calls it yet.
//
// It does not import tripSequence.js (F3's boundary test forbids any src/ import
// of it), so it does not run checkTripSequence. A rehydrated sequence is checked
// with checkTripSequence(seq, { data }) first; this module guards only what
// scheduleRoute would otherwise mis-handle silently (stop ids, night counts),
// and scheduleRoute itself throws on an unknown place or connection or a leg
// that does not serve its endpoints.
//
// Pure: no randomness, no Date.now().

const DECLARED_OPTIONS = new Set(['config', 'bufferRuleset']);

/**
 * The RouteResult scheduleRoute needs, rebuilt from the sequence alone.
 *
 * scheduleRoute reads, per stop, id, placeId, excursions, minNights and maxNights;
 * on the result, connectionIds, usesDraftData and (in error messages only)
 * routePackageId. It never reads isRequired. The sequence carries no authored
 * bounds, so each stop is pinned at its own allocation, minNights = maxNights =
 * nights: the scheduler's minimum run IS this trip, and it has nothing to
 * allocate. That fixes the days exactly; it also means the two outputs that
 * describe the authored bounds, minDays and the over-maximum warning, are not
 * this trip's to report (see materialiseTripSequence).
 *
 * @param {TripSequence} seq
 * @param {{connections: Object[]}} data
 * @returns {RouteResult}
 */
function routeResultFromSequence(seq, data) {
  const stops = seq.entries.map((e) => ({
    id: e.stopKey,
    placeId: e.placeId,
    nights: e.nights,
    minNights: e.nights,
    maxNights: e.nights,
    excursions: e.excursions.map(({ placeId, connectionId, hoursOnSite }) => ({ placeId, connectionId, hoursOnSite }))
  }));
  const connectionIds = [...seq.entries.map((e) => e.inboundConnectionId), seq.returnConnectionId];
  // As route.js derives it: any connection the trip uses, legs and excursions alike, that nobody has reviewed.
  const used = [...connectionIds, ...stops.flatMap((s) => s.excursions.map((x) => x.connectionId))];
  const usesDraftData = used.some((id) => data.connections.find((c) => c.id === id)?.reviewedAt == null);
  return { source: 'authored', routePackageId: `sequence:${seq.id}`, stops, connectionIds, usesDraftData };
}

/**
 * Stage 2: materialises a TripSequence into the timed skeleton scheduleRoute
 * produces, with the sequence's nights as the authoritative allocation.
 *
 * The day count is not an input. It is the realised count this allocation
 * produces, read from the scheduler's own minimum-days probe (the same probe
 * restructure.js uses), never from TripSequence.totalDays (derived metadata)
 * and never from any requested length.
 *
 * Returns scheduleRoute's success value WITHOUT `minDays` and `warnings`
 * (days, stops, homeArrival and usesDraftData are passed through unchanged). Both
 * describe the authored bounds (the variant minimum; a stop stretched past its
 * authored maximum), which are planning provenance the contract does not carry.
 * Reporting the pinned values would be wrong for any trip that is not at its
 * minimum or that is stretched (Japan 14d), so they are left out rather than
 * faked. This is F3b's §1 finding.
 *
 * Throws scheduleRoute's PackageAuthoringError when the allocation cannot be
 * timed (a pass-through that would need a night, an excursion that does not
 * fit), and a plain Error on a malformed sequence or an undeclared option.
 *
 * @param {TripSequence} seq
 * @param {{places: Object|Map, connections: Object[]}} data  The graph. Nothing else on it is read.
 * @param {{config?: typeof SCHEDULE_CONFIG, bufferRuleset?: typeof DEFAULT_BUFFER_RULESET}} [options]
 * @returns {{ok: true, value: {days: Object[], stops: Array<{stopId: string, placeId: string, nights: number, arrivalDay: number, departureDay: number}>, homeArrival: {dayNumber: number, time: string}, usesDraftData: boolean}}}
 */
export function materialiseTripSequence(seq, data, options = {}) {
  const undeclared = Object.keys(options).filter((k) => !DECLARED_OPTIONS.has(k));
  if (undeclared.length > 0) throw new Error(`materialise: undeclared option(s) ${undeclared.join(', ')}; stage 2 takes only config and bufferRuleset`);
  const { config = SCHEDULE_CONFIG, bufferRuleset = DEFAULT_BUFFER_RULESET } = options;

  if (!(seq.entries?.length > 0)) throw new Error('materialise: the sequence has no entries');
  const keys = new Set();
  for (const e of seq.entries) {
    // scheduleRoute keys nights and block ids by stop id: a missing or repeated key would merge two stops.
    if (typeof e.stopKey !== 'string' || e.stopKey === '' || keys.has(e.stopKey)) throw new Error(`materialise: stopKey "${e.stopKey}" is missing or repeated`);
    keys.add(e.stopKey);
    if (!(Number.isInteger(e.nights) && e.nights >= 0)) throw new Error(`materialise: ${e.stopKey} nights ${e.nights} is not a night count`);
  }

  const routeResult = routeResultFromSequence(seq, data);
  const scheduleOptions = { config, bufferRuleset };
  const originPlaceId = seq.origin.placeId;

  // The realised day count: with every stop pinned, the scheduler's minimum IS this trip. Asked for one day,
  // it either fits (a one-day trip) or refuses with that minimum.
  const probe = scheduleRoute(routeResult, { originPlaceId, totalDays: 1 }, data, scheduleOptions);
  if (!probe.ok && probe.state !== FAILURE_STATES.DURATION_TOO_SHORT) throw new Error(`materialise: unexpected probe failure ${probe.state}`);
  const realisedDays = probe.ok ? 1 : probe.detail.minDays;

  const nightsOverride = Object.fromEntries(seq.entries.map((e) => [e.stopKey, e.nights]));
  const scheduled = scheduleRoute(routeResult, { originPlaceId, totalDays: realisedDays }, data, { ...scheduleOptions, nightsOverride });
  const { days, stops, homeArrival, usesDraftData } = scheduled.value;
  return { ok: true, value: { days, stops, homeArrival, usesDraftData } };
}
