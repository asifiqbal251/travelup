/** @typedef {import('./types.js').RouteResult} RouteResult */
/** @typedef {import('./types.js').TripSpec} TripSpec */

import { parseClock } from './calendarConvention.js';
import { FAILURE_STATES, makeFailure, makeSuccess } from './failureStates.js';
import { SCHEDULE_CONFIG } from './scheduleConfig.js';

// Independent re-check of schedule.js output. It deliberately re-derives
// everything from the emitted days (day number + "HH:MM" + place offsets) and
// the catalogue, rather than reusing schedule's internals to prove schedule
// right.
//
// Engine-bug invariants THROW: a violation is our bug, not a traveller state.
//
// content_insufficient is not produced in this step: fill.js (activities)
// doesn't exist yet, so there is no content to be insufficient.

function getPlace(places, id) {
  if (places instanceof Map) return places.get(id);
  return Object.prototype.hasOwnProperty.call(places, id) ? places[id] : undefined;
}

function invariant(condition, message) {
  if (!condition) throw new Error(`validateSkeleton invariant violated: ${message}`);
}

/**
 * @param {Object} result  scheduleRoute's success value (or the {ok, value} wrapper)
 * @param {RouteResult} routeResult
 * @param {TripSpec} spec
 * @param {{places: Object|Map, connections: Object[]}} data
 * @param {{reviewPolicy?: 'strict'|'allow_drafts', config?: typeof SCHEDULE_CONFIG}} [options]
 */
export function validateSkeleton(result, routeResult, spec, data, { reviewPolicy = 'strict', config = SCHEDULE_CONFIG } = {}) {
  const skeleton = result && result.ok === true ? result.value : result;
  const N = spec.totalDays;
  const origin = getPlace(data.places, spec.originPlaceId);
  invariant(origin, `unknown origin "${spec.originPlaceId}"`);
  const placeOf = (id) => {
    const p = getPlace(data.places, id);
    invariant(p, `unknown placeId "${id}"`);
    return p;
  };
  const offsetMin = (place) => Math.round((place.utcOffsetHours - origin.utcOffsetHours) * 60);

  // Exactly N days, numbered 1..N.
  invariant(Array.isArray(skeleton.days) && skeleton.days.length === N, `expected ${N} days, got ${skeleton.days?.length}`);
  skeleton.days.forEach((day, i) => {
    invariant(day.dayNumber === i + 1, `day at index ${i} has dayNumber ${day.dayNumber}`);
    invariant(day.id === `day:${i + 1}`, `day ${i + 1} has id "${day.id}"`);
  });

  // Re-derive absolute start/end minutes for every placed block.
  const entries = [];
  for (const day of skeleton.days) {
    for (const block of day.blocks) {
      if (block.placeId == null) {
        invariant(block.type === 'rest' && block.durationHours === 0, `block "${block.id}" has no place`);
        continue;
      }
      const place = placeOf(block.placeId);
      const start = (day.dayNumber - 1) * 1440 + Math.round(parseClock(block.startTime) * 60) - offsetMin(place);
      entries.push({ day: day.dayNumber, block, place, start, end: start + Math.round(block.durationHours * 60) });
    }
  }

  // Blocks within a day don't overlap.
  for (let d = 1; d <= N; d++) {
    const dayEntries = entries.filter((e) => e.day === d).sort((a, b) => a.start - b.start);
    for (let i = 1; i < dayEntries.length; i++) {
      invariant(
        dayEntries[i].start >= dayEntries[i - 1].end,
        `Day ${d}: "${dayEntries[i - 1].block.id}" overlaps "${dayEntries[i].block.id}"`
      );
    }
  }

  // Route legs, in time order, must walk origin -> stops -> origin.
  const legs = entries.filter((e) => e.block.type === 'travel' && e.block.id.startsWith('tr:')).sort((a, b) => a.start - b.start);
  const stops = routeResult.stops;
  invariant(legs.length === stops.length + 1, `expected ${stops.length + 1} route legs, got ${legs.length}`);
  legs.forEach((leg, i) => {
    const t = leg.block.transport;
    const expectedFrom = i === 0 ? spec.originPlaceId : stops[i - 1].placeId;
    const expectedTo = i === stops.length ? spec.originPlaceId : stops[i].placeId;
    invariant(t.fromPlaceId === expectedFrom && t.toPlaceId === expectedTo, `leg ${i} goes ${t.fromPlaceId}->${t.toPlaceId}, expected ${expectedFrom}->${expectedTo}`);
    invariant(leg.block.placeId === t.fromPlaceId, `leg "${leg.block.id}" placeId is not its departure place`);
    if (i > 0) invariant(leg.start >= legs[i - 1].end, `leg "${leg.block.id}" departs before the previous leg arrives`);
  });

  // Home arrival is on Day N.
  const lastLeg = legs[legs.length - 1].block.transport;
  invariant(lastLeg.arriveDayNumber === N, `home arrival on Day ${lastLeg.arriveDayNumber}, expected Day ${N}`);
  invariant(skeleton.homeArrival?.dayNumber === N, `homeArrival.dayNumber is ${skeleton.homeArrival?.dayNumber}, expected ${N}`);
  invariant(skeleton.homeArrival.time === lastLeg.arriveTime, `homeArrival.time ${skeleton.homeArrival.time} != final leg arrival ${lastLeg.arriveTime}`);

  // Derive stays from consecutive legs: arrival day of leg i to departure day of leg i+1.
  const stays = stops.map((stop, i) => {
    const arrivalDay = legs[i].block.transport.arriveDayNumber;
    const departureDay = legs[i + 1].day;
    const nights = departureDay - arrivalDay;
    invariant(nights >= 0, `stop "${stop.id}" is left before it is reached`);
    return { stop, place: placeOf(stop.placeId), arrivalDay, departureDay, nights };
  });

  // Stated stop nights agree with the derived stays.
  invariant(Array.isArray(skeleton.stops) && skeleton.stops.length === stops.length, `stop summary length mismatch`);
  stays.forEach((stay, i) => {
    const stated = skeleton.stops[i];
    invariant(stated.stopId === stay.stop.id, `stop summary ${i} is "${stated.stopId}", expected "${stay.stop.id}"`);
    invariant(stated.nights === stay.nights, `stop "${stay.stop.id}" states ${stated.nights} nights, blocks imply ${stay.nights}`);
  });

  // No night at an attraction place.
  for (const stay of stays) {
    invariant(!(stay.nights >= 1 && stay.place.visitKind === 'attraction'), `night at attraction "${stay.place.id}"`);
  }

  // Every stop with authored nights appears with nights.
  for (const stay of stays) {
    if (stay.stop.minNights >= 1) invariant(stay.nights >= 1, `stop "${stay.stop.id}" requires nights but has none`);
  }

  // Every night k -> k+1 has an overnight location.
  const overnightTravel = entries.filter((e) => e.block.type === 'travel' && e.block.transport.overnight);
  for (let k = 1; k <= N - 1; k++) {
    const atStop = stays.some((s) => s.nights >= 1 && s.arrivalDay <= k && s.departureDay >= k + 1);
    const inTransit = overnightTravel.some((e) => e.day <= k && e.block.transport.arriveDayNumber >= k + 1);
    invariant(atStop || inTransit, `night ${k}->${k + 1} has no overnight location`);
  }

  // Every required place appears: a stop with nights, or an open block there.
  const openEntries = entries.filter((e) => e.block.type === 'open');
  for (const placeId of spec.requiredPlaceIds ?? []) {
    const asStay = stays.some((s) => s.nights >= 1 && s.place.id === placeId);
    const asOpen = openEntries.some((e) => e.block.placeId === placeId);
    invariant(asStay || asOpen, `required place "${placeId}" does not appear`);
  }

  // No open block before a departing route leg on the same day at the same place.
  for (const leg of legs) {
    const early = openEntries.find((e) => e.day === leg.day && e.block.placeId === leg.block.placeId && e.start < leg.start);
    invariant(!early, `open block "${early?.block.id}" precedes departure "${leg.block.id}"`);
  }

  // No open block shorter than minOpenBlockHours.
  const minOpenMin = Math.round(config.minOpenBlockHours * 60);
  for (const e of openEntries) {
    invariant(e.end - e.start >= minOpenMin, `open block "${e.block.id}" is shorter than ${config.minOpenBlockHours}h`);
  }

  // Open time on a long-haul arrival day is within the cap.
  const capMin = Math.round(config.longHaulArrivalMaxOpenHours * 60);
  legs.slice(0, -1).forEach((leg, i) => {
    const t = leg.block.transport;
    if (t.computedUsableTimeLost < config.longHaulThresholdHours) return;
    const stopId = stops[i].id;
    const openMinutes = openEntries
      .filter((e) => e.day === t.arriveDayNumber && e.block.anchor.stopId === stopId && e.block.placeId === t.toPlaceId)
      .reduce((sum, e) => sum + (e.end - e.start), 0);
    invariant(openMinutes <= capMin, `long-haul arrival at "${stopId}" has ${openMinutes / 60}h open, cap ${config.longHaulArrivalMaxOpenHours}h`);
  });

  // Traveller-facing: review policy, re-derived from the catalogue.
  const usedIds = [...new Set(entries.filter((e) => e.block.type === 'travel').map((e) => e.block.transport.connectionId))];
  const draftIds = usedIds.filter((id) => {
    const row = data.connections.find((c) => c.id === id);
    invariant(row, `travel block uses unknown connection "${id}"`);
    return row.reviewedAt == null;
  });
  const usesDraftData = draftIds.length > 0;
  if (reviewPolicy === 'strict' && usesDraftData) {
    return makeFailure(
      FAILURE_STATES.CONNECTION_UNREVIEWED,
      [{ action: 'check_back_later', detail: "We're still verifying the transport on this route" }],
      { detail: { reason: 'unreviewed', connectionIds: draftIds, routePackageId: routeResult.routePackageId } }
    );
  }
  return makeSuccess({
    status: usesDraftData ? 'draft' : 'valid',
    contentStatus: 'not_filled',
    warnings: [...(skeleton.warnings ?? [])]
  });
}
