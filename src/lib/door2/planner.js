/** @typedef {import('./types.js').TripSpec} TripSpec */
/** @typedef {import('./types.js').Trip} Trip */
/** @typedef {import('./types.js').FailureResult} FailureResult */

import { BUFFER_RULESET_VERSION, DEFAULT_BUFFER_RULESET } from './bufferRuleset.js';
import { FAILURE_STATES, makeFailure } from './failureStates.js';
import { fillTrip } from './fill.js';
import { PILOT_CONTENT } from './pilotContent.js';
import { PILOT_CONNECTIONS, PILOT_DATA_VERSION, PILOT_PLACES, PILOT_ROUTE_PACKAGES, PILOT_ROUTE_PACKAGES_ALL } from './pilotData.js';
import { buildRouteResult, getPlace, selectRoutes } from './route.js';
import { makeRoutePlan } from './routePlan.js';
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
  const pkg = findRoutePackage(data, best.routePackageId);
  return assembleSkeletonTrip(spec, pkg, best, scheduled, validation, scheduleOptions.bufferRuleset);
}

/**
 * Shared Trip assembly for buildSkeletonTrip and buildTripFromRoutePlan.
 * `spec.stops` and `spec.routeTemplateId` are still written exactly as in v5,
 * as derived mirrors of `routePlan` for one schema version (design §7).
 * @param {TripSpec} spec
 * @param {Object} pkg                    The package/variant the route came from.
 * @param {import('./types.js').RouteResult} best
 * @param {{value: {days: Object[], stops: Array<{stopId: string, nights: number}>, minDays: number}}} scheduled
 * @param {{value: {status: string, warnings: string[]}}} validation
 * @param {typeof DEFAULT_BUFFER_RULESET} bufferRuleset
 * @param {{prior?: import('./types.js').RoutePlan, nightsSource?: 'auto'|'user', selected?: Object<string, string[]>}} [planOptions]
 * @returns {Trip}
 */
function assembleSkeletonTrip(spec, pkg, best, scheduled, validation, bufferRuleset, planOptions = {}) {
  const N = spec.totalDays;
  const required = spec.requiredPlaceIds ?? [];
  const nightsByStop = Object.fromEntries(scheduled.value.stops.map((s) => [s.stopId, s.nights]));
  const routePlan = makeRoutePlan({
    pkg: pkg ?? { id: best.routePackageId },
    stops: best.stops.map((s) => {
      const chosen = planOptions.selected?.[s.id];
      const plain = { ...s, key: s.id, nights: nightsByStop[s.id] };
      // The route result carries fixed ++ selected excursions (that is what was scheduled);
      // the plan keeps the stop's FIXED excursions and the selection as ids (E3a).
      return chosen?.length > 0
        ? { ...plain, excursions: pkg.stops.find((p) => p.id === s.id).excursions, selectedExcursionIds: chosen }
        : plain;
    }),
    connectionIds: best.connectionIds,
    minDays: scheduled.value.minDays,
    source: best.source,
    nightsSource: planOptions.nightsSource ?? 'auto',
    prior: planOptions.prior
  });
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
    routePlan,
    days: scheduled.value.days,
    warnings: validation.value.warnings,
    versions: {
      engine: ENGINE_VERSION,
      schema: 'door2-v6',
      content: 'none',
      routeData: PILOT_DATA_VERSION,
      bufferRuleset: `${bufferRuleset.id}@${bufferRuleset.version ?? BUFFER_RULESET_VERSION}`
    },
    history: []
  };
}

// ---------------------------------------------------------------------------
// Excursion selection (E3a)
//
// A base stop may carry an authored `excursionMenu`; the traveller's selection is
// `selectedExcursionIds` on the RoutePlan stop (ids, in menu order). This is the one
// resolver every build and preview goes through: it turns a selection into a
// derived package whose stops schedule fixed ++ selected excursions, with each
// selected stop's minNights raised to the smallest value at which they fit
// (the effective minimum, A5). Nothing here ever selects or deselects on its own.

/** The selection a RoutePlan carries, as { stopKey: ids }. Stops without one are absent. */
export function planSelection(routePlan) {
  const out = {};
  for (const s of routePlan?.stops ?? []) if (s.selectedExcursionIds?.length > 0) out[s.key] = [...s.selectedExcursionIds];
  return out;
}

const asExcursion = ({ placeId, connectionId, hoursOnSite }) => ({ placeId, connectionId, hoursOnSite });

/**
 * @param {Object} pkg        The authored compiled variant.
 * @param {Object<string, string[]>} selection  { stopKey: menu ids }. Keys the package doesn't have are ignored (the caller reports them).
 * @param {import('./types.js').TripSpec} spec
 * @param {{places: Object|Map, connections: Object[]}} data
 * @param {{dropUnresolved?: boolean, config?: Object, bufferRuleset?: Object}} [options]
 *   dropUnresolved: an id that is not in the menu, or is pending_review, is left out and listed in `dropped`
 *   (an existing selection whose item was withdrawn; the caller reports it as no_longer_offered). Otherwise it fails.
 * @returns {{ok: true, pkg: Object, effectiveMinNights: Object<string, number>, selected: Object<string, string[]>, dropped: Array<{stopKey: string, excursionId: string}>}
 *   | {ok: false, reason: 'excursion_does_not_fit'|'not_in_menu'|'no_longer_offered'|'not_available', stopKey?: string, excursionIds?: string[], detail?: Object}}
 *   `pkg` is derived for scheduling and minimums only; `selected` is what the plan stores.
 */
export function resolveExcursions(pkg, selection, spec, data, { dropUnresolved = false, ...scheduleOptions } = {}) {
  const offered = {};
  const dropped = [];
  for (const stop of pkg.stops) {
    const ids = selection?.[stop.id];
    if (!(ids?.length > 0)) continue;
    const menu = stop.excursionMenu ?? [];
    const chosen = menu.filter((m) => m.status === 'approved' && ids.includes(m.id));
    for (const id of ids) {
      if (chosen.some((m) => m.id === id)) continue;
      if (!dropUnresolved) return { ok: false, reason: menu.some((m) => m.id === id) ? 'no_longer_offered' : 'not_in_menu', stopKey: stop.id, excursionIds: [id] };
      dropped.push({ stopKey: stop.id, excursionId: id });
    }
    if (chosen.length > 0) offered[stop.id] = chosen;
  }
  if (Object.keys(offered).length === 0) return { ok: true, pkg, effectiveMinNights: {}, selected: {}, dropped };

  const minNights = Object.fromEntries(pkg.stops.map((s) => [s.id, s.minNights]));
  const derive = () => ({
    ...pkg,
    stops: pkg.stops.map((s) =>
      offered[s.id] ? { ...s, minNights: minNights[s.id], excursions: [...s.excursions, ...offered[s.id].map(asExcursion)] } : s
    )
  });
  // Probe, raise the stop the scheduler names, probe again. More nights never un-fit an
  // excursion (earliest-fit placement) and each pass raises one stop by one, so this ends.
  for (;;) {
    const derived = derive();
    const built = buildRouteResult(derived, spec, data);
    if (built.missing) return { ok: false, reason: 'not_available', detail: { missing: built.missing } };
    try {
      scheduleRoute(built.routeResult, { ...spec, totalDays: 1 }, data, scheduleOptions);
    } catch (err) {
      if (!(err instanceof PackageAuthoringError)) throw err;
      const stopKey = err.detail.stopId;
      const ours = err.reason === 'excursion_does_not_fit' && offered[stopKey]?.some((m) => m.placeId === err.detail.placeId);
      if (!ours) return { ok: false, reason: 'not_available', stopKey, detail: err.detail };
      if (minNights[stopKey] >= pkg.stops.find((s) => s.id === stopKey).maxNights) {
        return { ok: false, reason: 'excursion_does_not_fit', stopKey, excursionIds: offered[stopKey].map((m) => m.id) };
      }
      minNights[stopKey] += 1;
      continue;
    }
    const selected = Object.fromEntries(Object.entries(offered).map(([k, items]) => [k, items.map((m) => m.id)]));
    const effectiveMinNights = Object.fromEntries(Object.keys(offered).map((k) => [k, minNights[k]]));
    return { ok: true, pkg: derived, effectiveMinNights, selected, dropped };
  }
}

/** A stop is 'required' only through its own place or a FIXED excursion; a menu place is not a required place (Q5). */
function withFixedRequirement(routeResult, pkg, resolved, spec) {
  if (Object.keys(resolved.selected).length === 0) return routeResult;
  const required = new Set(spec.requiredPlaceIds ?? []);
  return {
    ...routeResult,
    stops: routeResult.stops.map((s) => {
      if (!resolved.selected[s.id]) return s;
      const fixed = pkg.stops.find((p) => p.id === s.id).excursions;
      return { ...s, isRequired: required.has(s.placeId) || fixed.some((ex) => required.has(ex.placeId)) };
    })
  };
}

/** A build failure carrying a machine-readable reason, so a caller can refuse in words instead of guessing. */
function excursionFailure(pkg, resolved) {
  return makeFailure(
    FAILURE_STATES.ROUTE_NOT_SUPPORTED,
    [{ action: 'check_back_later', detail: "We're still working on a route that fits this trip" }],
    {
      detail: {
        reason: resolved.reason,
        stopKey: resolved.stopKey,
        excursionIds: resolved.excursionIds,
        ...(resolved.nightsNeeded != null ? { nightsNeeded: resolved.nightsNeeded } : {}),
        routePackageId: pkg.id
      }
    }
  );
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

  // E3a: the plan's excursion selection is resolved against the compiled menu, at effective minimum
  // nights, and scheduled with the stop's fixed excursions first. Without a selection this is the
  // authored package, unchanged.
  const resolved = resolveExcursions(pkg, planSelection(routePlan), spec, data, { dropUnresolved: true, ...scheduleOptions });
  if (!resolved.ok) return excursionFailure(pkg, resolved);
  const built = buildRouteResult(resolved.pkg, spec, data);
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
  const best = withFixedRequirement(built.routeResult, pkg, resolved, spec);
  const nightsOverride = Object.fromEntries(routePlan.stops.map((s) => [s.key, s.nights]));
  for (const s of resolved.pkg.stops) {
    if (resolved.selected[s.id] && nightsOverride[s.id] < s.minNights) {
      // A caller asked for fewer nights than the selection needs: a refusal for it to report, never a throw.
      return excursionFailure(pkg, { reason: 'excursion_does_not_fit', stopKey: s.id, excursionIds: resolved.selected[s.id], nightsNeeded: s.minNights });
    }
  }

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
  return assembleSkeletonTrip(spec, pkg, best, scheduled, validation, scheduleOptions.bufferRuleset, {
    prior: routePlan,
    nightsSource: routePlan.nightsSource ?? 'auto',
    selected: resolved.selected
  });
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
