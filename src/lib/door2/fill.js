/** @typedef {import('./types.js').Trip} Trip */
/** @typedef {import('./types.js').TripSpec} TripSpec */
/** @typedef {import('./types.js').Block} Block */
/** @typedef {import('./types.js').ContentItem} ContentItem */

import { parseClock } from './calendarConvention.js';
import { FAILURE_STATES } from './failureStates.js';
import { PILOT_CONTENT, PILOT_CONTENT_VERSION } from './pilotContent.js';

// Fill step: one curated activity into each open block of a skeleton Trip.
//
// The calendar never changes: block ids, order, times, durations and places
// are kept, and only `open` blocks are touched. No item is used twice in a
// trip, no other place's content is borrowed, and when nothing fits the block
// stays open as an honest gap (never padded or repeated).
//
// Pure: no randomness, no Date.now(), never mutates its input.

/** Item slots accepted by each block slot class. */
const ACCEPTED_SLOTS = Object.freeze({
  full: ['full'],
  half: ['half'],
  evening: ['evening'],
  short: ['short', 'half']
});

/**
 * @param {{startTime: string, durationHours: number}} block
 * @returns {'full'|'half'|'evening'|'short'}
 */
export function classifySlot(block) {
  if (block.durationHours >= 8) return 'full';
  if (parseClock(block.startTime) >= 17) return 'evening';
  if (block.durationHours >= 3) return 'half';
  return 'short';
}

/**
 * @param {string} [pace]
 * @returns {'relaxed'|'fast'|'neutral'}
 */
export function normalisePace(pace) {
  const p = String(pace ?? '').trim().toLowerCase();
  if (p === 'relaxed') return 'relaxed';
  if (p === 'fast-paced' || p === 'fast' || p === 'packed') return 'fast';
  return 'neutral';
}

function paceScore(pace, intensity) {
  if (pace === 'relaxed') {
    if (intensity === 'Light') return 1;
    if (intensity === 'High' || intensity === 'Highly active') return -2;
    return 0;
  }
  if (pace === 'fast') return intensity === 'Light' ? 0 : 1;
  return 0;
}

/** Arrival day per stop: the earliest arriveDayNumber of its inbound route (tr:) leg. */
function arrivalDaysByStop(days) {
  const arrival = new Map();
  for (const day of days) {
    for (const block of day.blocks) {
      if (block.type !== 'travel' || !block.id.startsWith('tr:')) continue;
      const stopId = block.anchor.stopId;
      const d = block.transport.arriveDayNumber;
      if (!arrival.has(stopId) || d < arrival.get(stopId)) arrival.set(stopId, d);
    }
  }
  return arrival;
}

/** @param {ContentItem} item @param {string} slot */
function activityFor(item, slot) {
  return {
    templateId: item.id,
    title: item.title,
    slot,
    summary: item.summary,
    intensity: item.intensity,
    interests: [...item.interests],
    ...(item.foodNote != null ? { foodNote: item.foodNote } : {}),
    ...(slot === 'full'
      ? { morning: item.morning, afternoon: item.afternoon, evening: item.evening }
      : {})
  };
}

/**
 * @param {Trip} trip  A skeleton Trip (buildSkeletonTrip success).
 * @param {TripSpec} spec
 * @param {ContentItem[]} [content]
 * @returns {Trip}
 */
export function fillTrip(trip, spec, content = PILOT_CONTENT) {
  const interests = new Set(spec.interests ?? []);
  const pace = normalisePace(spec.pace);
  const arrivalDay = arrivalDaysByStop(trip.days);
  const used = new Set();
  const seenStops = new Set();
  const contentGaps = [];

  const days = trip.days.map((day) => ({
    ...day,
    blocks: day.blocks.map((block) => {
      if (block.type !== 'open') return block;

      const slot = classifySlot(block);
      const accepted = ACCEPTED_SLOTS[slot];
      const stopId = block.anchor.stopId;
      const arrival = arrivalDay.get(stopId);
      if (arrival == null) throw new Error(`fillTrip: no inbound route leg for stop "${stopId}" (block "${block.id}")`);
      const dayOffset = day.dayNumber - arrival;
      const isFirstAtStop = !seenStops.has(stopId);
      seenStops.add(stopId);

      let best = null;
      let bestScore = -Infinity;
      for (const item of content) {
        if (item.placeId !== block.placeId) continue;
        if (used.has(item.id)) continue;
        if (!item.slots.some((s) => accepted.includes(s))) continue;
        if ((item.minDayAtStop ?? 0) > dayOffset) continue;
        const score =
          2 * item.interests.filter((i) => interests.has(i)).length +
          paceScore(pace, item.intensity) +
          (isFirstAtStop && item.arrivalFriendly ? 5 : 0);
        // Strictly greater: ties go to the earlier item in `content`.
        if (score > bestScore) {
          best = item;
          bestScore = score;
        }
      }

      if (!best) {
        contentGaps.push({ blockId: block.id, dayNumber: day.dayNumber, placeId: block.placeId, slot });
        return { ...block, generationStatus: 'unavailable', gap: { reason: 'no_eligible_content', slot } };
      }

      used.add(best.id);
      return {
        ...block,
        type: 'activity',
        anchor: { ...block.anchor, contentId: best.id },
        activity: activityFor(best, slot),
        provenance: {
          source: 'curated',
          reviewed: false,
          confidence: best.source.kind === 'extracted' ? 'high' : 'medium',
          content: { ...best.source }
        }
      };
    })
  }));

  const hasGaps = contentGaps.length > 0;
  return {
    ...trip,
    status: hasGaps ? 'incomplete' : trip.status,
    days,
    warnings: hasGaps ? [...trip.warnings, FAILURE_STATES.CONTENT_INSUFFICIENT] : [...trip.warnings],
    contentGaps,
    versions: { ...trip.versions, content: PILOT_CONTENT_VERSION }
  };
}
