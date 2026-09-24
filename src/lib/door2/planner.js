/** @typedef {import('./types.js').TripSpec} TripSpec */
/** @typedef {import('./types.js').Trip} Trip */
/** @typedef {import('./types.js').FailureResult} FailureResult */

import { BUFFER_RULESET_VERSION, DEFAULT_BUFFER_RULESET } from './bufferRuleset.js';
import { FAILURE_STATES, makeFailure } from './failureStates.js';
import { fillTrip } from './fill.js';
import { PILOT_CONTENT } from './pilotContent.js';
import { PILOT_CONNECTIONS, PILOT_DATA_VERSION, PILOT_PLACES, PILOT_ROUTE_PACKAGES, PILOT_ROUTE_PACKAGES_ALL } from './pilotData.js';
import { buildRouteResult, getPlace, selectRoutes } from './route.js';
import { PackageAuthoringError, scheduleRoute } from './schedule.js';
import { ENGINE_VERSION, SCHEDULE_CONFIG } from './scheduleConfig.js';
import { validateFilled, validateSkeleton } from './validate.js';

// The one entry point the harness and tests call: route -> schedule ->
// validate. No randomness and no Date.now(): identical input gives an
// identical Trip.

export const PILOT_DATA = Object.freeze({
  places: PILOT_PLACES,
  connections: PILOT_CONNECTIONS,
  routePackages: PILOT_ROUTE_PACKAGES,
  // Every compiled variant, held ones included. Never used for selection; only
  // buildTripFromRoutePlan looks a known variant up here.
  allRoutePackages: PILOT_ROUTE_PACKAGES_ALL
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
  return assembleSkeletonTrip(spec, best, scheduled, validation, scheduleOptions.bufferRuleset);
}

/**
 * Shared Trip assembly for buildSkeletonTrip and buildTripFromRoutePlan.
 * @param {TripSpec} spec
 * @param {import('./types.js').RouteResult} best
 * @param {{value: {days: Object[], stops: Array<{stopId: string, nights: number}>}}} scheduled
 * @param {{value: {status: string, warnings: string[]}}} validation
 * @param {typeof DEFAULT_BUFFER_RULESET} bufferRuleset
 * @returns {Trip}
 */
function assembleSkeletonTrip(spec, best, scheduled, validation, bufferRuleset) {
  const N = spec.totalDays;
  const required = spec.requiredPlaceIds ?? [];
  const nightsByStop = Object.fromEntries(scheduled.value.stops.map((s) => [s.stopId, s.nights]));
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

/**
 * Every package a RoutePlan may name: the served list first, then every
 * compiled variant (held ones included).
 */
function knownPackages(data) {
  const served = data.routePackages ?? [];
  const extra = (data.allRoutePackages ?? []).filter((p) => !served.some((s) => s.id === p.id));
  return [...served, ...extra];
}

/** Finds a package by id or alias; undefined when unknown. */
export function findRoutePackage(data, id) {
  const all = knownPackages(data);
  return all.find((p) => p.id === id) ?? all.find((p) => (p.aliases ?? []).includes(id));
}

/**
 * Builds an unfilled skeleton Trip for an exact RoutePlan: the named variant,
 * with the plan's nights per stop (no ranking, no round-robin). Used by the
 * structural editor (restructure.js); the traveller never reaches a held
 * variant because no proposal is ever built from one.
 *
 * @param {TripSpec} spec                 spec.totalDays must equal the plan's allocation.
 * @param {{variantId: string, stops: Array<{key: string, nights: number}>}} routePlan
 * @param {{places: Object|Map, connections: Object[], routePackages: Object[], allRoutePackages?: Object[]}} [data]
 * @param {{reviewPolicy?: 'strict'|'allow_drafts', config?: typeof SCHEDULE_CONFIG, bufferRuleset?: typeof DEFAULT_BUFFER_RULESET}} [options]
 * @returns {Trip|FailureResult}
 */
export function buildTripFromRoutePlan(spec, routePlan, data = PILOT_DATA, options = {}) {
  const reviewPolicy = options.reviewPolicy ?? 'strict';
  const scheduleOptions = {
    config: options.config ?? SCHEDULE_CONFIG,
    bufferRuleset: options.bufferRuleset ?? DEFAULT_BUFFER_RULESET
  };

  const pkg = findRoutePackage(data, routePlan.variantId);
  if (!pkg) throw new Error(`buildTripFromRoutePlan: unknown variant "${routePlan.variantId}"`);
  const planKeys = routePlan.stops.map((s) => s.key);
  const pkgKeys = pkg.stops.map((s) => s.id);
  if (planKeys.join('|') !== pkgKeys.join('|')) {
    throw new Error(`buildTripFromRoutePlan: plan stops [${planKeys}] do not match variant "${pkg.id}" stops [${pkgKeys}]`);
  }

  const built = buildRouteResult(pkg, spec, data);
  if (built.missing) {
    return makeFailure(
      FAILURE_STATES.CONNECTION_UNREVIEWED,
      [{ action: 'check_back_later', detail: "We don't have verified transport for this leg yet" }],
      { detail: { reason: 'missing', from: built.missing.from, to: built.missing.to, routePackageId: pkg.id } }
    );
  }
  if (reviewPolicy === 'strict' && built.unreviewedIds.length > 0) {
    return makeFailure(
      FAILURE_STATES.CONNECTION_UNREVIEWED,
      [{ action: 'check_back_later', detail: "We're still verifying the transport on this route" }],
      { detail: { reason: 'unreviewed', connectionIds: [...built.unreviewedIds], routePackageId: pkg.id } }
    );
  }
  const best = built.routeResult;
  const nightsOverride = Object.fromEntries(routePlan.stops.map((s) => [s.key, s.nights]));

  let scheduled;
  try {
    scheduled = scheduleRoute(best, spec, data, { ...scheduleOptions, nightsOverride });
  } catch (err) {
    if (!(err instanceof PackageAuthoringError)) throw err;
    return makeFailure(
      FAILURE_STATES.ROUTE_NOT_SUPPORTED,
      [{ action: 'check_back_later', detail: "We're still working on a route that fits this trip" }],
      { detail: { ...err.detail, routePackageId: pkg.id } }
    );
  }
  if (!scheduled.ok) return scheduled;

  const validation = validateSkeleton(scheduled.value, best, spec, data, { reviewPolicy, config: scheduleOptions.config });
  if (!validation.ok) return validation;
  return assembleSkeletonTrip(spec, best, scheduled, validation, scheduleOptions.bufferRuleset);
}

/**
 * Skeleton, then fill (one curated activity per open block), then an
 * independent re-check. A skeleton failure is returned unchanged.
 * @param {TripSpec} spec
 * @param {{places: Object|Map, connections: Object[], routePackages: Object[]}} [data]
 * @param {{reviewPolicy?: 'strict'|'allow_drafts', config?: typeof SCHEDULE_CONFIG, bufferRuleset?: typeof DEFAULT_BUFFER_RULESET, content?: Object[]}} [options]
 * @returns {Trip|FailureResult}
 */
export function buildFilledTrip(spec, data = PILOT_DATA, options = {}) {
  const skeleton = buildSkeletonTrip(spec, data, options);
  if (skeleton.ok === false) return skeleton;
  const content = options.content ?? PILOT_CONTENT;
  const filled = fillTrip(skeleton, spec, content);
  validateFilled(filled, skeleton, spec, content);
  return filled;
}
