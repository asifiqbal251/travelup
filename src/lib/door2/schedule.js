/** @typedef {import('./types.js').RouteResult} RouteResult */
/** @typedef {import('./types.js').TripSpec} TripSpec */
/** @typedef {import('./types.js').Block} Block */
/** @typedef {import('./types.js').Day} Day */
/** @typedef {import('./types.js').Place} Place */

import { BUFFER_RULESET_VERSION, DEFAULT_BUFFER_RULESET, computeUsableTimeLost, orientConnection } from './bufferRuleset.js';
import { formatClock, isOvernightBlock } from './calendarConvention.js';
import { assertPlaceCanBeOvernightBase } from './placeIntegrity.js';
import { FAILURE_STATES, makeFailure, makeSuccess } from './failureStates.js';
import { SCHEDULE_CONFIG } from './scheduleConfig.js';
import { ORIGIN_HOME_STOP_ID, ORIGIN_OUT_STOP_ID, getPlace } from './route.js';

// Skeleton scheduler: route -> timed, home-to-home day skeleton (no activities).
//
// Time is kept internally as integer minutes on the absolute timeline (minutes
// since 00:00 Day 1, origin local time; see calendarConvention.js). Usable
// time lost is rounded to the nearest minute once per leg, so day boundaries
// never suffer float drift.
//
// Block ids are deterministic (identical input gives identical ids):
//   travel:    tr:<fromStopId|origin_out>><toStopId|origin_home>
//   excursion: ex:<stopId>:<placeId>:out|site|back
//   open:      op:<stopId>:d<offsetFromArrivalDay>   (":<k>" appended for a 2nd+ gap that day)
//   filler:    rest:d<dayNumber>
// Reconciling ids across edits is the editing brief's job. These ids only need
// to be unique and reproducible now.

const MINUTES_PER_DAY = 1440;

/**
 * A route package that can't be scheduled as authored (for example a
 * pass-through that would need an unplanned night). The planner surfaces it as
 * route_not_supported; it is never "fixed" by inserting a night silently.
 */
export class PackageAuthoringError extends Error {
  constructor(reason, detail = {}) {
    super(`Package authoring error: ${reason}`);
    this.name = 'PackageAuthoringError';
    this.reason = reason;
    this.detail = { reason, ...detail };
  }
}

function isFlight(mode) {
  return mode === 'flight_international' || mode === 'flight_domestic';
}

function isReviewed(connection) {
  return connection.reviewedAt != null;
}

/**
 * @param {RouteResult} routeResult
 * @param {TripSpec} spec
 * @param {{places: Object|Map, connections: Object[]}} data
 * @param {{config?: typeof SCHEDULE_CONFIG, bufferRuleset?: typeof DEFAULT_BUFFER_RULESET, nightsOverride?: Object<string, number>}} [options]
 *   nightsOverride (Route Families §5.1): nights per stop id, covering every stop. Skips round-robin
 *   allocation. Must satisfy min ≤ n ≤ max per stop and minDays + Σ(n − min) === spec.totalDays;
 *   a violation throws a plain Error (engine bug: the solver only asks for valid allocations).
 *   Without it, behaviour is unchanged.
 */
export function scheduleRoute(routeResult, spec, data, { config = SCHEDULE_CONFIG, bufferRuleset = DEFAULT_BUFFER_RULESET, nightsOverride } = {}) {
  const origin = getPlace(data.places, spec.originPlaceId);
  if (!origin) throw new Error(`scheduleRoute: unknown origin "${spec.originPlaceId}"`);
  const placeOf = (id) => {
    const p = getPlace(data.places, id);
    if (!p) throw new Error(`scheduleRoute: unknown placeId "${id}"`);
    return p;
  };
  const connectionById = (id) => {
    const c = data.connections.find((row) => row.id === id);
    if (!c) throw new Error(`scheduleRoute: unknown connectionId "${id}"`);
    return c;
  };
  const rulesetVersion = bufferRuleset.version ?? BUFFER_RULESET_VERSION;

  // Minutes-based clock helpers.
  const offsetMin = (place) => Math.round((place.utcOffsetHours - origin.utcOffsetHours) * 60);
  const localMin = (abs, place) => abs + offsetMin(place);
  const dayOfLocal = (local) => Math.floor(local / MINUTES_PER_DAY) + 1;
  const minuteOfDay = (local) => local - (dayOfLocal(local) - 1) * MINUTES_PER_DAY;
  const absAt = (dayNumber, hour, place) => (dayNumber - 1) * MINUTES_PER_DAY + Math.round(hour * 60) - offsetMin(place);
  const dayStartMin = Math.round(config.dayStartHour * 60);
  const dayEndMin = Math.round(config.dayEndHour * 60);
  const minOpenMin = Math.round(config.minOpenBlockHours * 60);

  const stops = routeResult.stops;
  const legPlaceIds = [spec.originPlaceId, ...stops.map((s) => s.placeId), spec.originPlaceId];
  const legStopIds = [ORIGIN_OUT_STOP_ID, ...stops.map((s) => s.id), ORIGIN_HOME_STOP_ID];
  if (routeResult.connectionIds.length !== legPlaceIds.length - 1) {
    throw new Error(`scheduleRoute: route "${routeResult.routePackageId}" has ${routeResult.connectionIds.length} connections for ${legPlaceIds.length - 1} legs`);
  }
  const legs = routeResult.connectionIds.map((id, i) => {
    const oriented = orientConnection(connectionById(id), legPlaceIds[i], legPlaceIds[i + 1]);
    if (!oriented) throw new Error(`scheduleRoute: connection "${id}" does not serve ${legPlaceIds[i]} -> ${legPlaceIds[i + 1]}`);
    return oriented;
  });
  const nonTravelReviewed = !routeResult.usesDraftData;

  function provenance(reviewed) {
    return { source: 'curated', reviewed, confidence: 'medium' };
  }

  function baseBlock(fields) {
    return { ...fields, generationStatus: 'ok', userEdited: false, locked: false };
  }

  /** Travel block for an oriented connection departing at absolute minute depAbs. */
  function travelBlock(id, stopId, conn, depAbs, usableMin, usableHours) {
    const from = placeOf(conn.fromPlaceId);
    const to = placeOf(conn.toPlaceId);
    const arrAbs = depAbs + usableMin;
    const durationHours = usableMin / 60;
    const overnight =
      isOvernightBlock({ startHourOfDay: minuteOfDay(localMin(depAbs, from)) / 60, durationHours }) ||
      isOvernightBlock({ startHourOfDay: minuteOfDay(localMin(depAbs, to)) / 60, durationHours });
    const inVehicleHours =
      conn.segments && conn.segments.length > 0
        ? conn.segments.reduce((sum, s) => sum + s.inVehicleHours, 0)
        : conn.inVehicleHours;
    const transport = {
      connectionId: conn.id,
      mode: conn.mode,
      inVehicleHours,
      ...(conn.layoverHours != null ? { layoverHours: conn.layoverHours } : {}),
      bufferRulesetId: bufferRuleset.id,
      bufferRulesetVersion: rulesetVersion,
      computedUsableTimeLost: usableHours,
      estimated: true,
      fromPlaceId: from.id,
      toPlaceId: to.id,
      ...(conn.gatewayId ? { gatewayId: conn.gatewayId } : {}),
      overnight,
      arriveDayNumber: dayOfLocal(localMin(arrAbs, to)),
      arriveTime: formatClock(minuteOfDay(localMin(arrAbs, to)) / 60)
    };
    return {
      absStart: depAbs,
      block: baseBlock({
        id,
        type: 'travel',
        anchor: { stopId, contentId: conn.id },
        placeId: from.id,
        startTime: formatClock(minuteOfDay(localMin(depAbs, from)) / 60),
        durationHours,
        transport,
        provenance: provenance(isReviewed(conn))
      })
    };
  }

  function openBlock(id, stopId, place, startAbs, minutes) {
    return {
      absStart: startAbs,
      block: baseBlock({
        id,
        type: 'open',
        anchor: { stopId, contentId: null },
        placeId: place.id,
        startTime: formatClock(minuteOfDay(localMin(startAbs, place)) / 60),
        durationHours: minutes / 60,
        provenance: provenance(nonTravelReviewed)
      })
    };
  }

  function usableOf(conn) {
    const hours = computeUsableTimeLost(conn, bufferRuleset);
    return { hours, minutes: Math.round(hours * 60) };
  }

  /**
   * Phase 1: walk the journey on the absolute timeline.
   * @param {Object<string, number>} nightsByStopId
   */
  function simulate(nightsByStopId) {
    const placed = [];
    const stopSummaries = [];
    let arrivalAbs = null;
    let arrivalUsableHours = 0;

    for (let i = 0; i < legs.length; i++) {
      const conn = legs[i];
      const from = placeOf(conn.fromPlaceId);
      const to = placeOf(conn.toPlaceId);
      const { hours: usableHours, minutes: usableMin } = usableOf(conn);

      // Departure time.
      let depAbs;
      if (i === 0) {
        depAbs = absAt(1, config.dayStartHour, origin);
      } else {
        const stop = stops[i - 1];
        const nights = nightsByStopId[stop.id];
        const arrivalDay = dayOfLocal(localMin(arrivalAbs, from));
        if (nights >= 1) {
          depAbs = absAt(arrivalDay + nights, config.dayStartHour, from);
        } else {
          depAbs = arrivalAbs;
          const localHour = minuteOfDay(localMin(depAbs, from)) / 60;
          if (localHour > config.latestDepartureHour) {
            // Never insert an unplanned night silently.
            throw new PackageAuthoringError('pass_through_requires_overnight', {
              stopId: stop.id,
              placeId: stop.placeId,
              localTime: formatClock(localHour)
            });
          }
        }
      }

      const arrAbs = depAbs + usableMin;
      if (!isFlight(conn.mode)) {
        const depDay = dayOfLocal(localMin(depAbs, from));
        const arrLocal = localMin(arrAbs, to);
        if (dayOfLocal(arrLocal) > depDay || minuteOfDay(arrLocal) > Math.round(config.groundLatestArrivalHour * 60)) {
          throw new PackageAuthoringError('ground_leg_arrives_too_late', {
            connectionId: conn.id,
            fromStopId: legStopIds[i],
            toStopId: legStopIds[i + 1],
            arriveTime: formatClock(minuteOfDay(arrLocal) / 60)
          });
        }
      }

      placed.push(travelBlock(`tr:${legStopIds[i]}>${legStopIds[i + 1]}`, legStopIds[i + 1], conn, depAbs, usableMin, usableHours));
      arrivalAbs = arrAbs;
      arrivalUsableHours = usableHours;

      if (i === legs.length - 1) break;

      // At the stop we just reached.
      const stop = stops[i];
      const nights = nightsByStopId[stop.id];
      const stopPlace = to;
      const arrLocal = localMin(arrivalAbs, stopPlace);
      const arrivalDay = dayOfLocal(arrLocal);
      const departureDay = arrivalDay + nights;
      stopSummaries.push({ stopId: stop.id, placeId: stop.placeId, nights, arrivalDay, departureDay });

      if (nights < 1) {
        if (stop.excursions.length > 0) {
          throw new PackageAuthoringError('excursion_does_not_fit', { stopId: stop.id, placeId: stop.placeId, context: 'pass_through_stop' });
        }
        continue;
      }

      assertPlaceCanBeOvernightBase(stopPlace);

      // Busy intervals per day at the base, in local minutes.
      /** @type {Object<number, Array<[number, number]>>} */
      const busy = {};
      const windowStart = (day) => {
        const start = (day - 1) * MINUTES_PER_DAY + dayStartMin;
        return day === arrivalDay ? Math.max(arrLocal, start) : start;
      };

      for (const ex of stop.excursions) {
        const row = connectionById(ex.connectionId);
        const out = orientConnection(row, stopPlace.id, ex.placeId);
        const back = orientConnection(row, ex.placeId, stopPlace.id);
        if (!out || !back) throw new Error(`scheduleRoute: excursion connection "${row.id}" does not serve ${stopPlace.id} <-> ${ex.placeId}`);
        const outU = usableOf(out);
        const backU = usableOf(back);
        const siteMin = Math.round(ex.hoursOnSite * 60);
        const total = outU.minutes + siteMin + backU.minutes;

        let startLocal = null;
        for (let day = arrivalDay; day < departureDay && startLocal === null; day++) {
          const dayBusy = busy[day] ?? [];
          const earliest = Math.max(windowStart(day), ...dayBusy.map(([, end]) => end));
          if (earliest + total <= (day - 1) * MINUTES_PER_DAY + dayEndMin) {
            startLocal = earliest;
            busy[day] = [...dayBusy, [earliest, earliest + total]];
          }
        }
        if (startLocal === null) {
          throw new PackageAuthoringError('excursion_does_not_fit', { stopId: stop.id, placeId: ex.placeId });
        }

        const site = placeOf(ex.placeId);
        const outAbs = startLocal - offsetMin(stopPlace);
        placed.push(travelBlock(`ex:${stop.id}:${ex.placeId}:out`, stop.id, out, outAbs, outU.minutes, outU.hours));
        placed.push(openBlock(`ex:${stop.id}:${ex.placeId}:site`, stop.id, site, outAbs + outU.minutes, siteMin));
        placed.push(travelBlock(`ex:${stop.id}:${ex.placeId}:back`, stop.id, back, outAbs + outU.minutes + siteMin, backU.minutes, backU.hours));
      }

      // Open blocks fill the remaining 09–21 gaps; none on the departure morning.
      const longHaulArrival = arrivalUsableHours >= config.longHaulThresholdHours;
      for (let day = arrivalDay; day < departureDay; day++) {
        const dayEnd = (day - 1) * MINUTES_PER_DAY + dayEndMin;
        const intervals = [...(busy[day] ?? [])].sort((a, b) => a[0] - b[0]);
        const gaps = [];
        let cursor = windowStart(day);
        for (const [s, e] of intervals) {
          if (s > cursor) gaps.push([cursor, Math.min(s, dayEnd)]);
          cursor = Math.max(cursor, e);
        }
        if (dayEnd > cursor) gaps.push([cursor, dayEnd]);

        let remainingCap = day === arrivalDay && longHaulArrival ? Math.round(config.longHaulArrivalMaxOpenHours * 60) : Infinity;
        let k = 0;
        for (const [s, e] of gaps) {
          const minutes = Math.min(e - s, remainingCap);
          if (minutes < minOpenMin) continue;
          k += 1;
          remainingCap -= minutes;
          const id = `op:${stop.id}:d${day - arrivalDay}${k > 1 ? `:${k}` : ''}`;
          placed.push(openBlock(id, stop.id, stopPlace, s - offsetMin(stopPlace), minutes));
        }
      }
    }

    const homeLocal = localMin(arrivalAbs, origin);
    return {
      placed,
      stops: stopSummaries,
      homeArrival: { dayNumber: dayOfLocal(homeLocal), time: formatClock(minuteOfDay(homeLocal) / 60) }
    };
  }

  // Phase 2: fit to spec.totalDays.
  const N = spec.totalDays;
  const nights = Object.fromEntries(stops.map((s) => [s.id, s.minNights]));
  const minRun = simulate(nights);
  const minDays = minRun.homeArrival.dayNumber;

  if (nightsOverride != null) {
    return emitOverride();
  }

  if (minDays > N) {
    const extra = minDays - N;
    return makeFailure(
      FAILURE_STATES.DURATION_TOO_SHORT,
      [{ action: 'extend', days: extra, detail: `+${extra} ${extra === 1 ? 'day' : 'days'}` }],
      { detail: { reason: 'too_short', minDays, extraDaysNeeded: extra, routePackageId: routeResult.routePackageId } }
    );
  }

  const warnings = [];
  let remaining = N - minDays;
  // Round-robin in route order, one night per stop per pass.
  while (remaining > 0) {
    const eligible = stops.filter((s) => nights[s.id] < s.maxNights);
    if (eligible.length === 0) break;
    for (const s of eligible) {
      if (remaining === 0) break;
      nights[s.id] += 1;
      remaining -= 1;
    }
  }
  if (remaining > 0) {
    const stretchable = stops.filter((s) => s.maxNights >= 1);
    if (stretchable.length === 0) {
      throw new PackageAuthoringError('no_stop_can_take_nights', { routePackageId: routeResult.routePackageId });
    }
    warnings.push('nights_above_package_max');
    while (remaining > 0) {
      for (const s of stretchable) {
        if (remaining === 0) break;
        nights[s.id] += 1;
        remaining -= 1;
      }
    }
  }

  return emit(simulate(nights), warnings);

  /** nightsOverride path: check the allocation, then simulate once. */
  function emitOverride() {
    const where = `scheduleRoute nightsOverride (route "${routeResult.routePackageId}")`;
    const known = new Set(stops.map((s) => s.id));
    for (const key of Object.keys(nightsOverride)) {
      if (!known.has(key)) throw new Error(`${where}: unknown stop "${key}"`);
    }
    let extra = 0;
    for (const s of stops) {
      const n = nightsOverride[s.id];
      if (!Number.isInteger(n)) throw new Error(`${where}: stop "${s.id}" has no integer nights (got ${n})`);
      if (n < s.minNights || n > s.maxNights) {
        throw new Error(`${where}: stop "${s.id}" nights ${n} outside ${s.minNights}–${s.maxNights}`);
      }
      extra += n - s.minNights;
    }
    if (minDays + extra !== N) {
      throw new Error(`${where}: minDays ${minDays} + extra nights ${extra} = ${minDays + extra}, expected totalDays ${N}`);
    }
    return emit(simulate({ ...nightsOverride }), []);
  }

  /** Sanity-check the home arrival, then emit Days 1..N. */
  function emit(run, warnings) {
    if (run.homeArrival.dayNumber !== N) {
      throw new Error(
        `scheduleRoute engine bug: home arrival on Day ${run.homeArrival.dayNumber}, expected Day ${N} (route "${routeResult.routePackageId}")`
      );
    }

    // Emit Days 1..N; a block belongs to the local day it starts on at its place.
    const byDay = new Map();
    for (let d = 1; d <= N; d++) byDay.set(d, []);
    for (const item of run.placed) {
      const place = placeOf(item.block.placeId);
      const day = dayOfLocal(localMin(item.absStart, place));
      if (!byDay.has(day)) {
        throw new Error(`scheduleRoute engine bug: block "${item.block.id}" lands on Day ${day} outside 1..${N}`);
      }
      byDay.get(day).push(item);
    }

    /** @type {Day[]} */
    const days = [];
    for (let d = 1; d <= N; d++) {
      const items = byDay.get(d).sort((a, b) => a.absStart - b.absStart || (a.block.id < b.block.id ? -1 : 1));
      const blocks = items.map((it) => it.block);
      if (blocks.length === 0) {
        blocks.push(
          baseBlock({
            id: `rest:d${d}`,
            type: 'rest',
            anchor: { stopId: null, contentId: null },
            placeId: null,
            startTime: '00:00',
            durationHours: 0,
            note: 'in_transit',
            provenance: provenance(nonTravelReviewed)
          })
        );
      }
      days.push({ id: `day:${d}`, dayNumber: d, blocks });
    }

    return makeSuccess({
      days,
      stops: run.stops,
      homeArrival: run.homeArrival,
      minDays,
      warnings,
      usesDraftData: routeResult.usesDraftData
    });
  }
}
