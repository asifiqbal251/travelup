import { connectionPolicy } from './connectionEstimator.js';
/** @typedef {import('./types.js').TripSequence} TripSequence */
/** @typedef {import('./types.js').RouteResult} RouteResult */

import { DEFAULT_BUFFER_RULESET } from './bufferRuleset.js';
import { FAILURE_STATES } from './failureStates.js';
import { scheduleRoute } from './schedule.js';
import { SCHEDULE_CONFIG } from './scheduleConfig.js';
import { checkTripSequence } from './tripSequence.js';

// F3b: stage 2 of the handoff (design Q2). The sequence follows planning and
// allocation, which may use shared timing simulations; it precedes final
// itinerary materialisation. This module materialises a TripSequence into a
// timed skeleton from the sequence, the graph (places, connections) and
// declared runtime configuration ONLY: the timing config and the buffer
// ruleset. It never takes a RoutePlan, a family, a package or a package id, and
// it reuses scheduleRoute rather than timing anything itself. No existing live
// build path calls it yet.
//
// The boundary demonstrated is SCHEDULING only. Nothing here or in its tests
// shows that fill or edit can run from the sequence; that is unproven.
//
// It validates its input: every sequence goes through checkTripSequence(seq,
// { data }) and a sequence with any problem is refused before it is scheduled.
//
// Pure: no randomness, no Date.now().

const DECLARED_OPTIONS = new Set(['config', 'bufferRuleset']);

/**
 * The RouteResult scheduleRoute needs, rebuilt from the sequence alone.
 *
 * scheduleRoute reads, per stop, id, placeId, excursions, minNights and maxNights;
 * on the result, connectionIds, usesDraftData and (in error messages only)
 * routePackageId. It never reads isRequired.
 *
 * SYNTHETIC BOUNDS (F3b.1 §2.1). The sequence carries no authored bounds, and the
 * scheduler simulates at minimum nights before it consults the override
 * (schedule.js:325–330); there is no materialisation-only entry point. So each
 * stop is given minNights = maxNights = its allocated nights, as a PRIVATE
 * compatibility input to scheduleRoute and nothing else. These are NOT authored
 * bounds: they are never presented, returned, logged or persisted as such. They
 * live only on this function's return value, which is passed to scheduleRoute
 * and never leaves materialiseTripSequence; the scheduler outputs that describe
 * them (minDays, warnings) are dropped there.
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
    minNights: e.nights, // synthetic: private scheduler input, never an authored bound
    maxNights: e.nights, // synthetic: private scheduler input, never an authored bound
    excursions: e.excursions.map(({ placeId, connectionId, hoursOnSite }) => ({ placeId, connectionId, hoursOnSite }))
  }));
  const connectionIds = [...seq.entries.map((e) => e.inboundConnectionId), seq.returnConnectionId];
  // As route.js derives it: any connection the trip uses, legs and excursions alike, that nobody has reviewed.
  const used = [...connectionIds, ...stops.flatMap((s) => s.excursions.map((x) => x.connectionId))];
  const rows = used.map(id => data.connections.find(c => c.id === id));
  const blocked = rows.find(c => !connectionPolicy(c).eligible);
  if (blocked) throw new Error(`materialise: ${connectionPolicy(blocked).reason}`);
  const usesDraftData = rows.some(c => connectionPolicy(c).draft);
  return { source: 'authored', routePackageId: `sequence:${seq.id}`, stops, connectionIds, usesDraftData };
}

/**
 * Stage 2: materialises a TripSequence into the timed skeleton scheduleRoute
 * produces, with the sequence's nights as the authoritative allocation.
 *
 * The input is validated first: checkTripSequence(seq, { data }), the full check
 * including the graph. Any problem refuses the sequence with a plain Error that
 * lists them; nothing is scheduled.
 *
 * The day count is not an input. It is the realised count this allocation
 * produces, read from the scheduler's own minimum-days probe (the same probe
 * restructure.js uses), never from TripSequence.totalDays (derived metadata,
 * shape-checked by the validator and otherwise ignored) and never from any
 * requested length.
 *
 * Returns the TIMED SKELETON only: scheduleRoute's days, stops, homeArrival and
 * usesDraftData, passed through unchanged. scheduleRoute's `minDays` and
 * `warnings` are NOT returned. Here they would describe the synthetic bounds,
 * not the plan's, so returning them would be fabrication. The real values
 * (routePlan.minDays, from the plan's effective minima; nights_above_package_max,
 * which draftStorage.js:79 reads only when upgrading a v5 draft) are PLANNING
 * OUTPUTS: stage 1 owns them and the assembled trip must carry them (design
 * v6.9 §Q2). This result reaches a Trip only through assemble.js, which
 * recomputes them from the plan, the sequence and this result's day count and
 * verifies them against the plan; it never takes them from the scheduler's
 * output here. No live build path does that yet.
 *
 * Throws scheduleRoute's PackageAuthoringError when a valid sequence's
 * allocation cannot be timed (an excursion that does not fit, a pass-through
 * that would need a night), and a plain Error on an invalid sequence or an
 * undeclared option.
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

  const problems = checkTripSequence(seq, { data });
  if (problems.length > 0) throw new Error(`materialise: invalid sequence: ${problems.join('; ')}`);

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
  // Timed skeleton only. minDays and warnings are dropped here: see above.
  const { days, stops, homeArrival, usesDraftData } = scheduled.value;
  return { ok: true, value: { days, stops, homeArrival, usesDraftData } };
}
