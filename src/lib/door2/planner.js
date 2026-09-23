/** @typedef {import('./types.js').TripSpec} TripSpec */
/** @typedef {import('./types.js').Trip} Trip */
/** @typedef {import('./types.js').FailureResult} FailureResult */

import { BUFFER_RULESET_VERSION, DEFAULT_BUFFER_RULESET } from './bufferRuleset.js';
import { FAILURE_STATES, makeFailure } from './failureStates.js';
import { PILOT_CONNECTIONS, PILOT_DATA_VERSION, PILOT_PLACES, PILOT_ROUTE_PACKAGES } from './pilotData.js';
import { getPlace, selectRoutes } from './route.js';
import { PackageAuthoringError, scheduleRoute } from './schedule.js';
import { ENGINE_VERSION, SCHEDULE_CONFIG } from './scheduleConfig.js';
import { validateSkeleton } from './validate.js';

// The one entry point the harness and tests call: route -> schedule ->
// validate. No randomness and no Date.now(): identical input gives an
// identical Trip.

export const PILOT_DATA = Object.freeze({
  places: PILOT_PLACES,
  connections: PILOT_CONNECTIONS,
  routePackages: PILOT_ROUTE_PACKAGES
});

function packageName(data, routePackageId) {
  return data.routePackages.find((p) => p.id === routePackageId)?.name ?? routePackageId;
}

/** Schedules a candidate; returns the schedule result, or null on a package-authoring error. */
function tryFit(routeResult, spec, data, scheduleOptions) {
  try {
    return scheduleRoute(routeResult, spec, data, scheduleOptions);
  } catch (err) {
    if (err instanceof PackageAuthoringError) return null;
    throw err;
  }
}

/** First candidate (in rank order) that fits spec.totalDays, or null. */
function firstFittingCandidate(candidates, spec, data, scheduleOptions) {
  for (const candidate of candidates) {
    const result = tryFit(candidate, spec, data, scheduleOptions);
    if (result?.ok) return candidate;
  }
  return null;
}

/** Drops undefined values so the Trip survives a JSON round-trip unchanged. */
function withoutUndefined(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
}

/**
 * @param {TripSpec} spec
 * @param {{places: Object|Map, connections: Object[], routePackages: Object[]}} [data]
 * @param {{reviewPolicy?: 'strict'|'allow_drafts', config?: typeof SCHEDULE_CONFIG, bufferRuleset?: typeof DEFAULT_BUFFER_RULESET}} [options]
 * @returns {Trip|FailureResult}
 */
export function buildSkeletonTrip(spec, data = PILOT_DATA, options = {}) {
  const reviewPolicy = options.reviewPolicy ?? 'strict';
  const scheduleOptions = {
    config: options.config ?? SCHEDULE_CONFIG,
    bufferRuleset: options.bufferRuleset ?? DEFAULT_BUFFER_RULESET
  };
  const N = spec.totalDays;
  const required = spec.requiredPlaceIds ?? [];

  // 1. Route.
  const routes = selectRoutes(spec, data, { reviewPolicy });
  if (!routes.ok) return routes;
  const [best, ...others] = routes.value;

  // 2. Schedule the best candidate. 4. Authoring errors -> route_not_supported.
  let scheduled;
  try {
    scheduled = scheduleRoute(best, spec, data, scheduleOptions);
  } catch (err) {
    if (!(err instanceof PackageAuthoringError)) throw err;
    const alternate = firstFittingCandidate(others, spec, data, scheduleOptions);
    return makeFailure(
      FAILURE_STATES.ROUTE_NOT_SUPPORTED,
      alternate
        ? [{ action: 'alternate_route', routePackageId: alternate.routePackageId, detail: `Try the ${packageName(data, alternate.routePackageId)} route instead` }]
        : [{ action: 'check_back_later', detail: "We're still working on a route that fits this trip" }],
      { detail: { ...err.detail, routePackageId: best.routePackageId } }
    );
  }

  // 3. Too short.
  if (!scheduled.ok) {
    const { minDays, extraDaysNeeded } = scheduled.detail;
    const extend = { action: 'extend', days: extraDaysNeeded, detail: `+${extraDaysNeeded} ${extraDaysNeeded === 1 ? 'day' : 'days'}` };
    const detail = { minDays, extraDaysNeeded, routePackageId: best.routePackageId };

    if (required.length >= 2) {
      const options = [extend];
      for (const placeId of required) {
        const reducedSpec = { ...spec, requiredPlaceIds: required.filter((id) => id !== placeId) };
        const reduced = selectRoutes(reducedSpec, data, { reviewPolicy });
        if (!reduced.ok) continue;
        const fitting = firstFittingCandidate(reduced.value, reducedSpec, data, scheduleOptions);
        if (fitting) {
          options.push({
            action: 'remove_place',
            placeId,
            routePackageId: fitting.routePackageId,
            detail: `Drop ${getPlace(data.places, placeId)?.name ?? placeId} to fit ${N} days`
          });
        }
      }
      return makeFailure(FAILURE_STATES.REQUIRED_PLACE_CONFLICT, options, { detail: { ...detail, requiredPlaceIds: [...required] } });
    }

    const options = [extend];
    for (const candidate of others) {
      const result = tryFit(candidate, spec, data, scheduleOptions);
      if (result?.ok) {
        options.push({
          action: 'alternate_route',
          routePackageId: candidate.routePackageId,
          detail: `Try the ${packageName(data, candidate.routePackageId)} route instead`
        });
      }
    }
    return makeFailure(FAILURE_STATES.DURATION_TOO_SHORT, options, { detail });
  }

  // 5. Validate.
  const validation = validateSkeleton(scheduled.value, best, spec, data, { reviewPolicy, config: scheduleOptions.config });
  if (!validation.ok) return validation;

  // 6. Assemble the Trip.
  const nightsByStop = Object.fromEntries(scheduled.value.stops.map((s) => [s.stopId, s.nights]));
  const bufferRuleset = scheduleOptions.bufferRuleset;
  return {
    id: `door2:${spec.originPlaceId}:${spec.destination.id}:${N}:${best.routePackageId}`,
    status: validation.value.status,
    spec: withoutUndefined({
      ...spec,
      requiredPlaceIds: [...required],
      routeTemplateId: best.routePackageId,
      stops: best.stops.map((s) => ({
        id: s.id,
        placeId: s.placeId,
        placeSource: 'recommendation',
        nights: nightsByStop[s.id],
        isRequired: s.isRequired
      })),
      choices: spec.choices ?? { pinned: [], rejected: [], placed: [] }
    }),
    days: scheduled.value.days,
    warnings: validation.value.warnings,
    versions: {
      engine: ENGINE_VERSION,
      schema: 'door2-v5',
      content: 'none',
      routeData: PILOT_DATA_VERSION,
      bufferRuleset: `${bufferRuleset.id}@${bufferRuleset.version ?? BUFFER_RULESET_VERSION}`
    },
    history: []
  };
}
