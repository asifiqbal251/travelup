/** @typedef {import('./types.js').Trip} Trip */
/** @typedef {import('./types.js').Block} Block */
/** @typedef {import('./types.js').ContentItem} ContentItem */
/** @typedef {import('./types.js').EditResult} EditResult */

import { FAILURE_STATES } from './failureStates.js';
import { activityFor, blockContext, eligibleItemsForBlock, scoreItem } from './fill.js';
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
