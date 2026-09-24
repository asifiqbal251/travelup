/** @typedef {import('./types.js').Trip} Trip */
/** @typedef {import('./types.js').Block} Block */
/** @typedef {import('./types.js').ContentItem} ContentItem */
/** @typedef {import('./types.js').EditResult} EditResult */

import { FAILURE_STATES } from './failureStates.js';
import { activityFor, blockContext, classifySlot, eligibleItemsForBlock, scoreItem } from './fill.js';
import { PILOT_CONTENT } from './pilotContent.js';
import { validateEditInvariant } from './validate.js';

// Bounded edits: swap, reject, pin/unpin, make a day lighter, undo.
// Every function is pure: takes a Trip, returns a new Trip (or an EditResult
// failure). The calendar never changes — same invariant as fill.js.
// History is maintained as an in-memory stack on the trip; undo pops it.

// ---------------------------------------------------------------------------
// Internal helpers

function findBlock(trip, blockId) {
  for (const day of trip.days) {
    for (const block of day.blocks) {
      if (block.id === blockId) return { block, day };
    }
  }
  return null;
}

/** Rebuild the gap list and status/warnings after an edit. */
function contentMeta(days) {
  const contentGaps = [];
  for (const day of days) {
    for (const block of day.blocks) {
      if (block.type === 'open' && block.gap) {
        contentGaps.push({ blockId: block.id, dayNumber: day.dayNumber, placeId: block.placeId, slot: block.gap.slot });
      }
    }
  }
  return contentGaps;
}

function applyMeta(newTrip, preTripStatus, preTripWarnings) {
  const contentGaps = contentMeta(newTrip.days);
  const hasGaps = contentGaps.length > 0;
  const baseWarnings = (preTripWarnings ?? []).filter((w) => w !== FAILURE_STATES.CONTENT_INSUFFICIENT);
  return {
    ...newTrip,
    contentGaps,
    status: hasGaps ? 'incomplete' : preTripStatus,
    warnings: hasGaps ? [...baseWarnings, FAILURE_STATES.CONTENT_INSUFFICIENT] : baseWarnings
  };
}

/** Replace a block in trip.days, returning a new days array. */
function replaceBlock(trip, newBlock) {
  return trip.days.map((day) => ({
    ...day,
    blocks: day.blocks.map((b) => (b.id === newBlock.id ? newBlock : b))
  }));
}

/** Build an activity block from an existing block and a chosen content item. */
function buildActivityBlock(existingBlock, item, slot, { userEdited = true } = {}) {
  return {
    ...existingBlock,
    type: 'activity',
    anchor: { ...existingBlock.anchor, contentId: item.id },
    activity: activityFor(item, slot),
    generationStatus: 'ok',
    gap: undefined,
    provenance: {
      source: 'curated',
      reviewed: false,
      confidence: item.source.kind === 'extracted' ? 'high' : 'medium',
      content: { ...item.source }
    },
    userEdited
  };
}

const HISTORY_CAP = 20;

/** Common finishing steps: update placed/meta, push history, validate. */
function finish(newTrip, preTrip, newDays, updatedChoices) {
  const withDays = { ...newTrip, days: newDays, spec: { ...newTrip.spec, choices: updatedChoices } };
  const withMeta = applyMeta(withDays, preTrip.status, preTrip.warnings);
  const history = [...(preTrip.history ?? []), preTrip];
  const capped = history.length > HISTORY_CAP ? history.slice(history.length - HISTORY_CAP) : history;
  const result = { ...withMeta, history: capped };
  validateEditInvariant(result, preTrip);
  return { ok: true, trip: result };
}

function pickBest(eligible, trip, block, paceOverride) {
  const ctx = blockContext(trip, block);
  let best = null, bestScore = -Infinity;
  for (const item of eligible) {
    const score = scoreItem(item, { spec: trip.spec, isFirstAtStop: ctx.isFirstAtStop, paceOverride });
    if (score > bestScore) { best = item; bestScore = score; }
  }
  return best;
}

// ---------------------------------------------------------------------------
// C1. swapActivity

/**
 * Replace a block's activity with an alternative eligible item.
 * If contentId is null, auto-picks the highest-scoring eligible alternative.
 * @param {Trip} trip
 * @param {string} blockId
 * @param {string|null} [contentId]
 * @param {ContentItem[]} [content]
 * @returns {EditResult}
 */
export function swapActivity(trip, blockId, contentId = null, content = PILOT_CONTENT) {
  const found = findBlock(trip, blockId);
  if (!found) return { ok: false, reason: 'block_not_found', message: `Block "${blockId}" not found.` };
  const { block } = found;

  if (block.type !== 'activity') return { ok: false, reason: 'block_not_editable', message: `Block "${blockId}" is not an activity block.` };
  if (block.locked) return { ok: false, reason: 'block_locked', message: `Block "${blockId}" is pinned; unpin it first.` };

  const currentId = block.activity.templateId;
  const eligible = eligibleItemsForBlock(trip, block, content, { excludeContentIds: [currentId] });

  let chosen;
  if (contentId != null) {
    chosen = eligible.find((i) => i.id === contentId);
    if (!chosen) return { ok: false, reason: 'content_not_eligible', message: `Content "${contentId}" is not eligible for block "${blockId}".` };
  } else {
    chosen = pickBest(eligible, trip, block, null);
    if (!chosen) return { ok: false, reason: 'content_not_eligible', message: `No eligible alternative for block "${blockId}".` };
  }

  const { slot } = blockContext(trip, block);
  const newBlock = buildActivityBlock(block, chosen, slot);

  const oldChoices = trip.spec.choices;
  const placed = [...(oldChoices.placed ?? [])];
  if (!placed.includes(chosen.id)) placed.push(chosen.id);
  const placedWithoutOld = placed.filter((id) => id !== currentId || id === chosen.id);
  const updatedChoices = { ...oldChoices, placed: placedWithoutOld };

  const newDays = replaceBlock(trip, newBlock);
  return finish(trip, trip, newDays, updatedChoices);
}

// ---------------------------------------------------------------------------
// C2. rejectActivity

/**
 * Reject the current activity on a block and replace with the best alternative.
 * If no alternative exists, the block becomes an honest gap.
 * @param {Trip} trip
 * @param {string} blockId
 * @param {ContentItem[]} [content]
 * @returns {EditResult}
 */
export function rejectActivity(trip, blockId, content = PILOT_CONTENT) {
  const found = findBlock(trip, blockId);
  if (!found) return { ok: false, reason: 'block_not_found', message: `Block "${blockId}" not found.` };
  const { block } = found;

  if (block.type !== 'activity') return { ok: false, reason: 'block_not_editable', message: `Block "${blockId}" is not an activity block.` };
  if (block.locked) return { ok: false, reason: 'block_locked', message: `Block "${blockId}" is pinned; unpin it first.` };

  const currentId = block.activity.templateId;
  const oldChoices = trip.spec.choices;
  const rejected = [...new Set([...(oldChoices.rejected ?? []), currentId])];
  const updatedChoices = { ...oldChoices, rejected };

  const eligible = eligibleItemsForBlock(trip, block, content, { excludeContentIds: [...rejected] });

  let newBlock;
  if (eligible.length > 0) {
    const { slot } = blockContext(trip, block);
    const best = pickBest(eligible, trip, block, null);
    newBlock = buildActivityBlock(block, best, slot);
  } else {
    const { slot } = blockContext(trip, block);
    newBlock = {
      ...block,
      type: 'open',
      anchor: { ...block.anchor, contentId: null },
      activity: undefined,
      generationStatus: 'unavailable',
      gap: { reason: 'no_eligible_content', slot },
      userEdited: true
    };
  }

  const newDays = replaceBlock(trip, newBlock);
  return finish(trip, trip, newDays, updatedChoices);
}

// ---------------------------------------------------------------------------
// C3. pinActivity / unpinActivity

/**
 * Lock a block against future edits and add its content to spec.choices.pinned.
 * @param {Trip} trip
 * @param {string} blockId
 * @returns {EditResult}
 */
export function pinActivity(trip, blockId) {
  const found = findBlock(trip, blockId);
  if (!found) return { ok: false, reason: 'block_not_found', message: `Block "${blockId}" not found.` };
  const { block } = found;

  if (block.type !== 'activity') return { ok: false, reason: 'block_not_editable', message: `Block "${blockId}" is not an activity block.` };

  const contentId = block.activity.templateId;
  const newBlock = { ...block, locked: true };
  const oldChoices = trip.spec.choices;
  const pinned = [...(oldChoices.pinned ?? [])];
  if (!pinned.includes(contentId)) pinned.push(contentId);
  const updatedChoices = { ...oldChoices, pinned };

  const newDays = replaceBlock(trip, newBlock);
  return finish(trip, trip, newDays, updatedChoices);
}

/**
 * Unlock a block and remove its content from spec.choices.pinned.
 * @param {Trip} trip
 * @param {string} blockId
 * @returns {EditResult}
 */
export function unpinActivity(trip, blockId) {
  const found = findBlock(trip, blockId);
  if (!found) return { ok: false, reason: 'block_not_found', message: `Block "${blockId}" not found.` };
  const { block } = found;

  if (block.type !== 'activity') return { ok: false, reason: 'block_not_editable', message: `Block "${blockId}" is not an activity block.` };

  const contentId = block.activity.templateId;
  const newBlock = { ...block, locked: false };
  const oldChoices = trip.spec.choices;
  const pinned = (oldChoices.pinned ?? []).filter((id) => id !== contentId);
  const updatedChoices = { ...oldChoices, pinned };

  const newDays = replaceBlock(trip, newBlock);
  return finish(trip, trip, newDays, updatedChoices);
}

// ---------------------------------------------------------------------------
// C4. makeDayLighter

/**
 * Re-score every non-locked activity/gap block on a day with a relaxed-pace
 * bias, replacing items where a better-scoring alternative exists.
 * Treated as one undo step regardless of how many blocks change.
 * @param {Trip} trip
 * @param {number} dayNumber
 * @param {ContentItem[]} [content]
 * @returns {EditResult}
 */
export function makeDayLighter(trip, dayNumber, content = PILOT_CONTENT) {
  const day = trip.days.find((d) => d.dayNumber === dayNumber);
  if (!day) return { ok: false, reason: 'block_not_found', message: `Day ${dayNumber} not found.` };

  // Items newly placed on this day during this call (must be excluded for later blocks).
  const dayNewlyPlaced = new Set();

  const newBlocks = day.blocks.map((block) => {
    if (block.locked) return block;

    const isActivityBlock = block.type === 'activity';
    const isGapBlock = block.type === 'open' && block.gap != null;
    if (!isActivityBlock && !isGapBlock) return block;

    const { slot, isFirstAtStop } = blockContext(trip, block);
    const rejected = trip.spec.choices.rejected ?? [];

    // Eligible pool: items not used elsewhere in the trip, not newly placed on
    // this day so far, and not in rejected.  The current item is NOT excluded so
    // the "already best" check in step c works correctly.
    const eligible = eligibleItemsForBlock(trip, block, content, {
      excludeContentIds: [...dayNewlyPlaced, ...rejected]
    });

    // Score all eligible items with forced relaxed pace.
    let best = null, bestScore = -Infinity;
    for (const item of eligible) {
      const score = scoreItem(item, { spec: trip.spec, isFirstAtStop, paceOverride: 'relaxed' });
      if (score > bestScore) { best = item; bestScore = score; }
    }

    const currentId = isActivityBlock ? block.activity.templateId : null;

    if (!best) {
      // No eligible items at all — gap stays a gap.
      return block;
    }

    if (currentId && best.id === currentId) {
      // Current item is already the top relaxed-scored eligible — no change.
      // Don't add currentId to dayNewlyPlaced: it's already in the trip's activity
      // blocks and will be excluded by eligibleItemsForBlock's internal scan.
      return block;
    }

    // Replace with best. Track it so later blocks on this day don't pick it.
    dayNewlyPlaced.add(best.id);
    return buildActivityBlock(block, best, slot);
  });

  const newDays = trip.days.map((d) => (d.dayNumber === dayNumber ? { ...d, blocks: newBlocks } : d));
  const updatedChoices = trip.spec.choices;
  return finish(trip, trip, newDays, updatedChoices);
}

// ---------------------------------------------------------------------------
// C5. swapDays (Route Families design §8: same-stop day swap, Day editor)

/** Content fields that move with an item when two days swap. Calendar fields never move. */
const MOVING_FIELDS = ['type', 'activity', 'provenance', 'generationStatus', 'gap', 'locked'];

/** The stop a day belongs to, or null if it isn't a plain day at one stop (travel, rest, mixed). */
function dayStop(day) {
  if (!day || day.blocks.length === 0) return null;
  const stopId = day.blocks[0].anchor?.stopId ?? null;
  if (stopId == null) return null;
  for (const b of day.blocks) {
    if (b.type !== 'activity' && b.type !== 'open') return null;
    if (b.anchor?.stopId !== stopId) return null;
  }
  return stopId;
}

/**
 * Checks a same-stop day swap without applying it.
 * @returns {{ok: true, dayA: Object, dayB: Object} | {ok: false, reason: string, why?: string, message: string, blocked?: Object[]}}
 */
function checkSwapDays(trip, dayNumberA, dayNumberB, content) {
  const dayA = trip.days.find((d) => d.dayNumber === dayNumberA);
  const dayB = trip.days.find((d) => d.dayNumber === dayNumberB);
  if (!dayA || !dayB) {
    return { ok: false, reason: 'block_not_found', message: `Day ${dayA ? dayNumberB : dayNumberA} not found.` };
  }
  const notFeasible = (why, message) => ({ ok: false, reason: 'change_not_feasible', why, message });
  if (dayNumberA === dayNumberB) return notFeasible('same_day', 'Pick a different day to swap with.');

  const stopA = dayStop(dayA);
  const stopB = dayStop(dayB);
  if (stopA == null || stopB == null) {
    return notFeasible('day_shape', 'Travel days and arrival or departure days can\'t be swapped.');
  }
  if (stopA !== stopB) {
    return notFeasible(
      'different_stop',
      `Day ${dayNumberA} and Day ${dayNumberB} are at different stops. Change how many nights you spend at each instead.`
    );
  }
  if (
    dayA.blocks.length !== dayB.blocks.length ||
    dayA.blocks.some((b, i) => classifySlot(b) !== classifySlot(dayB.blocks[i]))
  ) {
    return notFeasible('day_shape', `Day ${dayNumberA} and Day ${dayNumberB} are shaped differently, so their plans can't be swapped.`);
  }

  // Eligibility at the new block, measured on a trip where both days are vacated
  // (so the two items don't count as "used elsewhere").
  const vacate = (b) => ({ ...b, type: 'open', activity: undefined, anchor: { ...b.anchor, contentId: null } });
  const vacated = {
    ...trip,
    days: trip.days.map((d) => (d === dayA || d === dayB ? { ...d, blocks: d.blocks.map(vacate) } : d))
  };
  const vacatedBlock = (day, i) => vacated.days.find((d) => d.dayNumber === day.dayNumber).blocks[i];
  const contentById = new Map(content.map((item) => [item.id, item]));

  const blocked = [];
  const check = (fromDay, toDay) => {
    fromDay.blocks.forEach((b, i) => {
      if (b.type !== 'activity') return;
      const target = vacatedBlock(toDay, i);
      const ok = eligibleItemsForBlock(vacated, target, content).some((item) => item.id === b.anchor.contentId);
      if (!ok) {
        blocked.push({
          templateId: b.activity.templateId,
          title: b.activity.title,
          fromDay: fromDay.dayNumber,
          toDay: toDay.dayNumber,
          minDayAtStop: contentById.get(b.anchor.contentId)?.minDayAtStop ?? 0
        });
      }
    });
  };
  check(dayA, dayB);
  check(dayB, dayA);
  if (blocked.length > 0) {
    const first = blocked[0];
    const message =
      first.minDayAtStop > 0
        ? `${first.title} can't move to Day ${first.toDay}: it needs ${first.minDayAtStop} ${first.minDayAtStop === 1 ? 'day' : 'days'} at this stop first.`
        : `${first.title} can't move to Day ${first.toDay}.`;
    return { ok: false, reason: 'change_not_feasible', why: 'content_constraint', message, blocked };
  }
  return { ok: true, dayA, dayB };
}

/**
 * Swap what two days at the same stop hold (activities, gaps, pins), keeping
 * the calendar unchanged. Only days with the same block shape (same count and
 * slot classes in order, no travel) at the same stop can swap, and every moved
 * activity must stay eligible at its new day (e.g. altitude minDayAtStop).
 * @param {Trip} trip
 * @param {number} dayNumberA
 * @param {number} dayNumberB
 * @param {ContentItem[]} [content]
 * @returns {EditResult}
 */
export function swapDays(trip, dayNumberA, dayNumberB, content = PILOT_CONTENT) {
  const checked = checkSwapDays(trip, dayNumberA, dayNumberB, content);
  if (!checked.ok) return checked;
  const { dayA, dayB } = checked;

  const moveInto = (target, source) => {
    const next = { ...target, anchor: { ...target.anchor, contentId: source.anchor.contentId }, userEdited: true };
    for (const f of MOVING_FIELDS) {
      if (source[f] === undefined) delete next[f];
      else next[f] = source[f];
    }
    return next;
  };
  const newDays = trip.days.map((d) => {
    if (d === dayA) return { ...d, blocks: d.blocks.map((b, i) => moveInto(b, dayB.blocks[i])) };
    if (d === dayB) return { ...d, blocks: d.blocks.map((b, i) => moveInto(b, dayA.blocks[i])) };
    return d;
  });
  return finish(trip, trip, newDays, trip.spec.choices);
}

/**
 * The days `dayNumber` can swap with (every check in swapDays passes). The UI
 * offers only these; an empty list means the control doesn't appear.
 * @param {Trip} trip
 * @param {number} dayNumber
 * @param {ContentItem[]} [content]
 * @returns {number[]}
 */
export function swappableDays(trip, dayNumber, content = PILOT_CONTENT) {
  return trip.days
    .map((d) => d.dayNumber)
    .filter((n) => n !== dayNumber && checkSwapDays(trip, dayNumber, n, content).ok);
}

// ---------------------------------------------------------------------------
// C6. undo

/**
 * Pop the most recent trip from the history stack.
 * @param {Trip} trip
 * @returns {EditResult}
 */
export function undo(trip) {
  if (!trip.history?.length) return { ok: false, reason: 'nothing_to_undo', message: 'Nothing to undo.' };
  return { ok: true, trip: trip.history[trip.history.length - 1] };
}
