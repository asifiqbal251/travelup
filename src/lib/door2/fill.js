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
export function activityFor(item, slot) {
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
 * Per-block derived context. Pure: derives isFirstAtStop from existing
 * open/activity blocks in the trip, so fill.js and edit.js agree.
 * @param {Trip} trip
 * @param {Block} block
 */
export function blockContext(trip, block) {
  const slot = classifySlot(block);
  const stopId = block.anchor.stopId;
  const arrivalDays = arrivalDaysByStop(trip.days);
  const arrival = arrivalDays.get(stopId);
  if (arrival == null) throw new Error(`blockContext: no inbound route leg for stop "${stopId}" (block "${block.id}")`);

  let dayNumber = null;
  outer: for (const day of trip.days) {
    for (const b of day.blocks) {
      if (b.id === block.id) { dayNumber = day.dayNumber; break outer; }
    }
  }
  if (dayNumber == null) throw new Error(`blockContext: block "${block.id}" not found in trip`);

  const dayOffset = dayNumber - arrival;

  let isFirstAtStop = true;
  scan: for (const day of trip.days) {
    for (const b of day.blocks) {
      if (b.id === block.id) break scan;
      if ((b.type === 'open' || b.type === 'activity') && b.anchor?.stopId === stopId) {
        isFirstAtStop = false;
        break scan;
      }
    }
  }

  return { slot, stopId, arrival, dayOffset, isFirstAtStop };
}

/**
 * Returns the subset of `content` eligible for `block`, minus items already
 * used in the trip (from activity blocks) and any caller-supplied exclusions.
 * The block itself is never counted as "used" — callers exclude its current
 * content via excludeContentIds when they need to.
 *
 * @param {Trip} trip
 * @param {Block} block
 * @param {ContentItem[]} content
 * @param {{excludeContentIds?: string[]}} [opts]
 * @returns {ContentItem[]}
 */
export function eligibleItemsForBlock(trip, block, content, { excludeContentIds = [] } = {}) {
  const { slot, dayOffset } = blockContext(trip, block);
  const accepted = ACCEPTED_SLOTS[slot];

  const used = new Set();
  for (const day of trip.days) {
    for (const b of day.blocks) {
      if (b.id === block.id) continue;
      if (b.type === 'activity' && b.anchor?.contentId) used.add(b.anchor.contentId);
    }
  }

  const excludeSet = new Set(excludeContentIds);

  return content.filter((item) => {
    if (item.placeId !== block.placeId) return false;
    if (used.has(item.id)) return false;
    if (excludeSet.has(item.id)) return false;
    if (!item.slots.some((s) => accepted.includes(s))) return false;
    if ((item.minDayAtStop ?? 0) > dayOffset) return false;
    return true;
  });
}

/**
 * Score a content item for a block's context.
 * Pass paceOverride to force a different pace without mutating spec.
 *
 * @param {ContentItem} item
 * @param {{spec: TripSpec, isFirstAtStop: boolean, paceOverride?: string|null}} ctx
 * @returns {number}
 */
export function scoreItem(item, { spec, isFirstAtStop, paceOverride = null }) {
  const interests = new Set(spec.interests ?? []);
  const pace = paceOverride ?? normalisePace(spec.pace);
  return (
    2 * item.interests.filter((i) => interests.has(i)).length +
    paceScore(pace, item.intensity) +
    (isFirstAtStop && item.arrivalFriendly ? 5 : 0)
  );
}

/**
 * @param {Trip} trip  A skeleton Trip (buildSkeletonTrip success).
 * @param {TripSpec} spec
 * @param {ContentItem[]} [content]
 * @returns {Trip}
 */
export function fillTrip(trip, spec, content = PILOT_CONTENT) {
  const used = new Set();
  const seenStops = new Set();
  const contentGaps = [];

  const days = trip.days.map((day) => ({
    ...day,
    blocks: day.blocks.map((block) => {
      if (block.type !== 'open') return block;

      const { slot, stopId, isFirstAtStop } = blockContext(trip, block);
      // seenStops maintains the same incremental order as the original loop.
      // blockContext derives isFirstAtStop from the skeleton's open blocks,
      // which is equivalent for a fresh (all-open) skeleton.
      seenStops.add(stopId);

      const eligible = eligibleItemsForBlock(trip, block, content, { excludeContentIds: [...used] });

      let best = null;
      let bestScore = -Infinity;
      for (const item of eligible) {
        const score = scoreItem(item, { spec, isFirstAtStop });
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
