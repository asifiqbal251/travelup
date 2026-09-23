/** @typedef {import('./types.js').TripSpec} TripSpec */
/** @typedef {import('./types.js').RoutePackage} RoutePackage */
/** @typedef {import('./types.js').RouteResult} RouteResult */
/** @typedef {import('./types.js').Connection} Connection */
/** @typedef {import('./types.js').Place} Place */

import { orientConnection } from './bufferRuleset.js';
import { assertConnectionPlacesResolve } from './placeIntegrity.js';
import { FAILURE_STATES, makeFailure, makeSuccess } from './failureStates.js';

export const ORIGIN_OUT_STOP_ID = 'origin_out';
export const ORIGIN_HOME_STOP_ID = 'origin_home';

/** @returns {Place|undefined} */
export function getPlace(places, id) {
  if (places instanceof Map) return places.get(id);
  return Object.prototype.hasOwnProperty.call(places, id) ? places[id] : undefined;
}

function allPlaces(places) {
  return places instanceof Map ? [...places.values()] : Object.values(places);
}

const CAPTURE_INTEREST = Object.freeze({
  action: 'capture_interest',
  detail: "Tell us you're interested and we'll let you know when we cover it"
});

function alternateRouteOption(pkg) {
  return { action: 'alternate_route', routePackageId: pkg.id, detail: `Try the ${pkg.name} route instead` };
}

function isConnectionReviewed(connection) {
  return connection.reviewedAt != null;
}

/**
 * Finds the catalogue row serving fromPlaceId -> toPlaceId, oriented for that
 * direction. Prefers preferredGatewayId when given; otherwise catalogue order.
 * @returns {Connection|null}
 */
function findLegConnection(connections, fromPlaceId, toPlaceId, preferredGatewayId) {
  const matches = [];
  for (const row of connections) {
    const oriented = orientConnection(row, fromPlaceId, toPlaceId);
    if (oriented) matches.push(oriented);
  }
  if (matches.length === 0) return null;
  if (preferredGatewayId) {
    const preferred = matches.find((c) => c.gatewayId === preferredGatewayId);
    if (preferred) return preferred;
  }
  return matches[0];
}

/**
 * Builds a RouteResult for one package. Throws on data-integrity bugs; returns
 * {missing: {from, to}} when a leg has no connection.
 */
function buildRouteResult(pkg, spec, data) {
  const { places, connections } = data;
  const required = new Set(spec.requiredPlaceIds ?? []);

  for (const s of pkg.stops) {
    if (!getPlace(places, s.placeId)) {
      throw new Error(`Route package "${pkg.id}" stop "${s.id}" references unknown placeId "${s.placeId}"`);
    }
    for (const ex of s.excursions ?? []) {
      if (!getPlace(places, ex.placeId)) {
        throw new Error(`Route package "${pkg.id}" stop "${s.id}" excursion references unknown placeId "${ex.placeId}"`);
      }
    }
  }

  const legPlaces = [spec.originPlaceId, ...pkg.stops.map((s) => s.placeId), spec.originPlaceId];
  const connectionIds = [];
  const usedConnections = [];
  for (let i = 0; i < legPlaces.length - 1; i++) {
    const from = legPlaces[i];
    const to = legPlaces[i + 1];
    const conn = findLegConnection(connections, from, to, pkg.preferredGatewayId);
    if (!conn) return { missing: { from, to } };
    assertConnectionPlacesResolve(conn, places);
    connectionIds.push(conn.id);
    usedConnections.push(conn);
  }

  for (const s of pkg.stops) {
    for (const ex of s.excursions ?? []) {
      const row = connections.find((c) => c.id === ex.connectionId);
      if (!row) {
        throw new Error(`Route package "${pkg.id}" excursion references unknown connectionId "${ex.connectionId}"`);
      }
      assertConnectionPlacesResolve(row, places);
      if (!orientConnection(row, s.placeId, ex.placeId) || !orientConnection(row, ex.placeId, s.placeId)) {
        throw new Error(
          `Route package "${pkg.id}" excursion connection "${row.id}" does not serve ${s.placeId} <-> ${ex.placeId}`
        );
      }
      usedConnections.push(row);
    }
  }

  const unreviewedIds = [];
  for (const c of usedConnections) {
    if (!isConnectionReviewed(c) && !unreviewedIds.includes(c.id)) unreviewedIds.push(c.id);
  }

  /** @type {RouteResult} */
  const routeResult = {
    source: 'authored',
    routePackageId: pkg.id,
    stops: pkg.stops.map((s) => ({
      id: s.id,
      placeId: s.placeId,
      nights: s.minNights,
      minNights: s.minNights,
      maxNights: s.maxNights,
      isRequired: required.has(s.placeId) || (s.excursions ?? []).some((ex) => required.has(ex.placeId)),
      excursions: (s.excursions ?? []).map((ex) => ({ ...ex }))
    })),
    connectionIds,
    usesDraftData: unreviewedIds.length > 0
  };
  return { routeResult, unreviewedIds };
}

function unplannedPlaceCount(pkg, askedFor) {
  return pkg.placeIds.filter((id) => !askedFor.has(id)).length;
}

/**
 * @param {TripSpec} spec
 * @param {{places: Object|Map, connections: Connection[], routePackages: RoutePackage[]}} data
 * @param {{reviewPolicy?: 'strict'|'allow_drafts'}} [options]
 */
export function selectRoutes(spec, data, options = {}) {
  const reviewPolicy = options.reviewPolicy ?? 'strict';
  const { places, routePackages } = data;
  const requiredPlaceIds = spec.requiredPlaceIds ?? [];

  // 1. Origin.
  if (!getPlace(places, spec.originPlaceId)) {
    return makeFailure(FAILURE_STATES.ROUTE_NOT_SUPPORTED, [CAPTURE_INTEREST], {
      message: "We can't plan trips from this starting point yet.",
      detail: { reason: 'origin_unknown', originPlaceId: spec.originPlaceId }
    });
  }

  // 2. Destination, resolved independently of coverage.
  const destination = spec.destination;
  let destinationCountryId;
  let matchesDestination;
  if (destination?.kind === 'place') {
    const place = getPlace(places, destination.id);
    if (!place) {
      return makeFailure(FAILURE_STATES.DESTINATION_NOT_COVERED, [CAPTURE_INTEREST], {
        detail: { reason: 'place_unknown', placeId: destination.id }
      });
    }
    destinationCountryId = place.countryId;
    matchesDestination = (pkg) => pkg.placeIds.includes(destination.id);
  } else if (destination?.kind === 'country') {
    destinationCountryId = destination.id;
    matchesDestination = (pkg) => pkg.countryId === destination.id;
  } else {
    throw new Error(`selectRoutes: spec.destination must be {kind: 'place'|'country', id}`);
  }

  const destinationPackages = routePackages.filter(matchesDestination);
  if (destinationPackages.length === 0) {
    const knownCountry = allPlaces(places).some((p) => p.countryId === destinationCountryId);
    const sameCountry = routePackages.filter((pkg) => pkg.countryId === destinationCountryId);
    return makeFailure(
      FAILURE_STATES.DESTINATION_NOT_COVERED,
      [CAPTURE_INTEREST, ...sameCountry.map(alternateRouteOption)],
      {
        detail: {
          reason: knownCountry ? 'not_covered' : 'country_unknown',
          destination: { kind: destination.kind, id: destination.id }
        }
      }
    );
  }

  // Required places that we don't know, or that no package covers at all.
  const unknownRequired = requiredPlaceIds.filter((id) => !getPlace(places, id));
  if (unknownRequired.length > 0) {
    return makeFailure(FAILURE_STATES.DESTINATION_NOT_COVERED, [CAPTURE_INTEREST], {
      detail: { reason: 'place_unknown', placeIds: unknownRequired }
    });
  }
  const uncoveredRequired = requiredPlaceIds.filter((id) => !routePackages.some((pkg) => pkg.placeIds.includes(id)));
  if (uncoveredRequired.length > 0) {
    return makeFailure(FAILURE_STATES.DESTINATION_NOT_COVERED, [CAPTURE_INTEREST], {
      detail: { reason: 'required_place_uncovered', placeIds: uncoveredRequired }
    });
  }

  // 3. Candidates: match the destination and contain every required place.
  const candidates = destinationPackages.filter((pkg) => requiredPlaceIds.every((id) => pkg.placeIds.includes(id)));
  if (candidates.length === 0) {
    const subsetPackages = routePackages.filter((pkg) => requiredPlaceIds.some((id) => pkg.placeIds.includes(id)));
    return makeFailure(
      FAILURE_STATES.ROUTE_NOT_SUPPORTED,
      subsetPackages.map((pkg) => ({
        ...alternateRouteOption(pkg),
        coversPlaceIds: requiredPlaceIds.filter((id) => pkg.placeIds.includes(id))
      })),
      { detail: { reason: 'no_package_covers_all_required', requiredPlaceIds: [...requiredPlaceIds] } }
    );
  }

  // 4. Rank: fewest unasked-for places, then fewest stops, then id.
  const askedFor = new Set(requiredPlaceIds);
  if (destination.kind === 'place') askedFor.add(destination.id);
  const ranked = [...candidates].sort(
    (a, b) =>
      unplannedPlaceCount(a, askedFor) - unplannedPlaceCount(b, askedFor) ||
      a.stops.length - b.stops.length ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
  // If the caller requested a specific route package, bubble it to the front.
  if (spec.routeTemplateId) {
    const idx = ranked.findIndex((pkg) => pkg.id === spec.routeTemplateId);
    if (idx > 0) ranked.unshift(ranked.splice(idx, 1)[0]);
  }

  // 5. Build a RouteResult per candidate. Only the best candidate's missing leg
  // is a traveller failure; a lesser candidate with a gap is simply dropped.
  const built = ranked.map((pkg) => ({ pkg, ...buildRouteResult(pkg, spec, data) }));
  const complete = built.filter((b) => !b.missing);
  const best = built[0];
  if (best.missing) {
    const alternates = complete.map((b) => alternateRouteOption(b.pkg));
    return makeFailure(
      FAILURE_STATES.CONNECTION_UNREVIEWED,
      alternates.length > 0
        ? alternates
        : [{ action: 'check_back_later', detail: "We don't have verified transport for this leg yet" }],
      { detail: { reason: 'missing', from: best.missing.from, to: best.missing.to, routePackageId: best.pkg.id } }
    );
  }

  // 6. Review policy.
  if (reviewPolicy === 'strict') {
    const reviewed = complete.filter((b) => b.unreviewedIds.length === 0);
    if (reviewed.length === 0) {
      return makeFailure(
        FAILURE_STATES.CONNECTION_UNREVIEWED,
        [{ action: 'check_back_later', detail: "We're still verifying the transport on this route" }],
        { detail: { reason: 'unreviewed', connectionIds: [...best.unreviewedIds], routePackageId: best.pkg.id } }
      );
    }
    return makeSuccess(reviewed.map((b) => b.routeResult));
  }
  if (reviewPolicy !== 'allow_drafts') {
    throw new Error(`selectRoutes: unknown reviewPolicy "${reviewPolicy}"`);
  }
  return makeSuccess(complete.map((b) => b.routeResult));
}
