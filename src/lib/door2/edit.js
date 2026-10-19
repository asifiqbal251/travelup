import { editEvidenceGuard } from './connectionEvidence.js';
/** @typedef {import('./types.js').Trip} Trip */
/** @typedef {import('./types.js').Block} Block */
/** @typedef {import('./types.js').ContentItem} ContentItem */
/** @typedef {import('./types.js').EditResult} EditResult */

import { FAILURE_STATES } from './failureStates.js';
import { activityFor, blockContext, classifySlot, eligibleItemsForBlock, scoreItem } from './fill.js';
import { identityOptions, recordBlockIntents, undoIdentity } from './identity.js';
import { PILOT_CONTENT } from './pilotContent.js';
import { validateEditInvariant } from './validate.js';

// Bounded edits: swap, reject, pin/unpin, make a day lighter, undo.
// Every function is pure: takes a Trip, returns a new Trip (or an EditResult
// failure). The calendar never changes — same invariant as fill.js.
// History is maintained as an in-memory stack on the trip; undo pops it.
//
// ---------------------------------------------------------------------------
// Q8 packet 1b. Seven exports — `swapActivity`, `rejectActivity`, `pinActivity`,
// `unpinActivity`, `makeDayLighter`, `swapDays` and `undo` — gain ONE appended optional
// parameter, `identity`, after their existing content parameter where one exists. `null`
// means exactly the behaviour each had before that packet, and `null` is what every
// production caller gets: no call site in `src/pages/**` passes an opt-in.
//
// Bounded edits never pass through a structural path: this file has ZERO references to
// `reconcile` or `applyProposal`, and the page calls `swapActivity` directly. So identity
// here is only ever INTENT — `edits[luid]` — and never a placement or an issuance. A swap
// changes `edits[luid].contentId` and leaves `blocks[luid]` untouched, because identity
// belongs to the logical block independently of intent.
//
// Coverage is claimed as complete for these seven and no more. If another intent-bearing
// export is found it is reported as a finding, not absorbed and not left without identity.

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

/**
 * Common finishing steps: update placed/meta, push history, validate.
 * `identityMap` is written only under the opt-in; omitting it leaves the result object
 * identical to what this function produced before packet 1b.
 */
function finish(newTrip, preTrip, newDays, updatedChoices, identityMap) {
  const withDays = { ...newTrip, days: newDays, spec: { ...newTrip.spec, choices: updatedChoices }, ...(identityMap !== undefined ? { identity: identityMap } : {}) };
  const withMeta = applyMeta(withDays, preTrip.status, preTrip.warnings);
  // Snapshot without its own history: entries that carried their stacks made the saved size double per edit.
  const history = [...(preTrip.history ?? []), { ...preTrip, history: [] }];
  const capped = history.length > HISTORY_CAP ? history.slice(history.length - HISTORY_CAP) : history;
  const result = { ...withMeta, history: capped };
  validateEditInvariant(result, preTrip);
  return { ok: true, trip: result };
}

/**
 * One complete intent entry per changed block, describing each block AS THE OPERATION
 * LEAVES IT, written onto a copy of the trip's map. A complete entry is constructed
 * whether or not the placement already had one, so pin, unpin and a day swap record real
 * intent even where their inputs carried no earlier edit.
 *
 * Refuses by name — leaving the caller's trip untouched — when the trip carries no map, or
 * when no live placement covers a changed block. Packet 1b creates identity nowhere, so
 * fabricating a partial map here would fail the coverage check and would be identity
 * creation on a path the packet forbids.
 *
 * @param {Trip} trip
 * @param {string} intent
 * @param {string} provenance
 * @param {Block[]} blocks  The blocks as the operation leaves them.
 */
function intentsFor(trip, intent, provenance, blocks) {
  return recordBlockIntents(
    trip,
    blocks.map((block) => ({
      block,
      intent,
      contentId: block.anchor?.contentId ?? null,
      locked: block.locked === true,
      userEdited: block.userEdited === true,
      provenance
    }))
  );
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
 * @param {null|true|{data?: Object}} [identity]  Q8 1b's opt-in; `null` is today's behaviour.
 * @returns {EditResult}
 */
export function swapActivity(trip, blockId, contentId = null, content = PILOT_CONTENT, identity = null) {
  const evidenceFailure = editEvidenceGuard(trip); if (evidenceFailure) return evidenceFailure;
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
  if (!identityOptions(identity)) return finish(trip, trip, newDays, updatedChoices);
  // `edits[luid].contentId` follows the new content; `blocks[luid]` is untouched.
  const recorded = intentsFor(trip, 'swap', 'swapActivity', [newBlock]);
  if (!recorded.ok) return recorded;
  return finish(trip, trip, newDays, updatedChoices, recorded.identity);
}

// ---------------------------------------------------------------------------
// C2. rejectActivity

/**
 * Reject the current activity on a block and replace with the best alternative.
 * If no alternative exists, the block becomes an honest gap.
 * @param {Trip} trip
 * @param {string} blockId
 * @param {ContentItem[]} [content]
 * @param {null|true|{data?: Object}} [identity]  Q8 1b's opt-in; `null` is today's behaviour.
 * @returns {EditResult}
 */
export function rejectActivity(trip, blockId, content = PILOT_CONTENT, identity = null) {
  const evidenceFailure = editEvidenceGuard(trip); if (evidenceFailure) return evidenceFailure;
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
  if (!identityOptions(identity)) return finish(trip, trip, newDays, updatedChoices);
  // Two outcomes, and BOTH keep the placement. Where an alternative was eligible,
  // `edits[luid].contentId` is the replacement. Where none was, the block becomes an open
  // gap at an UNCHANGED id and address, so the placement stays `live` and
  // `edits[luid].contentId` is null: the window still exists, it is empty. That null
  // records no trip-wide meaning — `choices.rejected` keeps exactly the content-id
  // exclusion meaning it has today, and no refill or rebuild policy is widened by it.
  const recorded = intentsFor(trip, 'reject', 'rejectActivity', [newBlock]);
  if (!recorded.ok) return recorded;
  return finish(trip, trip, newDays, updatedChoices, recorded.identity);
}

// ---------------------------------------------------------------------------
// C3. pinActivity / unpinActivity

/**
 * Lock a block against future edits and add its content to spec.choices.pinned.
 * @param {Trip} trip
 * @param {string} blockId
 * @param {null|true|{data?: Object}} [identity]  Q8 1b's opt-in; `null` is today's behaviour.
 * @returns {EditResult}
 */
export function pinActivity(trip, blockId, identity = null) {
  const evidenceFailure = editEvidenceGuard(trip); if (evidenceFailure) return evidenceFailure;
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
  if (!identityOptions(identity)) return finish(trip, trip, newDays, updatedChoices);
  // `edits[luid].locked` becomes true, in a COMPLETE entry constructed whether or not the
  // placement already had one — a pin is often the first intent a window ever carries.
  const recorded = intentsFor(trip, 'pin', 'pinActivity', [newBlock]);
  if (!recorded.ok) return recorded;
  return finish(trip, trip, newDays, updatedChoices, recorded.identity);
}

/**
 * Unlock a block and remove its content from spec.choices.pinned.
 * @param {Trip} trip
 * @param {string} blockId
 * @param {null|true|{data?: Object}} [identity]  Q8 1b's opt-in; `null` is today's behaviour.
 * @returns {EditResult}
 */
export function unpinActivity(trip, blockId, identity = null) {
  const evidenceFailure = editEvidenceGuard(trip); if (evidenceFailure) return evidenceFailure;
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
  if (!identityOptions(identity)) return finish(trip, trip, newDays, updatedChoices);
  // `edits[luid].locked` becomes false, in a complete entry constructed either way.
  const recorded = intentsFor(trip, 'unpin', 'unpinActivity', [newBlock]);
  if (!recorded.ok) return recorded;
  return finish(trip, trip, newDays, updatedChoices, recorded.identity);
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
 * @param {null|true|{data?: Object}} [identity]  Q8 1b's opt-in; `null` is today's behaviour.
 * @returns {EditResult}
 */
export function makeDayLighter(trip, dayNumber, content = PILOT_CONTENT, identity = null) {
  const evidenceFailure = editEvidenceGuard(trip); if (evidenceFailure) return evidenceFailure;
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
  if (!identityOptions(identity)) return finish(trip, trip, newDays, updatedChoices);
  // Intent is recorded per block CHANGED, and only those: every branch above that leaves a
  // block alone — locked, not an activity or gap, no eligible item, already the best —
  // returns the same object, so identity comparison names exactly the changed set. Blocks
  // skipped for `block.locked` therefore keep whatever intent they already had.
  // An empty changed set still goes through the same path, so the opt-in refuses a trip
  // with no map just as consistently as it would when a block did change.
  const changed = newBlocks.filter((block, i) => block !== day.blocks[i]);
  const recorded = intentsFor(trip, 'make_day_lighter', 'makeDayLighter', changed);
  if (!recorded.ok) return recorded;
  return finish(trip, trip, newDays, updatedChoices, recorded.identity);
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
 * @param {null|true|{data?: Object}} [identity]  Q8 1b's opt-in; `null` is today's behaviour.
 * @returns {EditResult}
 */
export function swapDays(trip, dayNumberA, dayNumberB, content = PILOT_CONTENT, identity = null) {
  const evidenceFailure = editEvidenceGuard(trip); if (evidenceFailure) return evidenceFailure;
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
  const newBlocksA = dayA.blocks.map((b, i) => moveInto(b, dayB.blocks[i]));
  const newBlocksB = dayB.blocks.map((b, i) => moveInto(b, dayA.blocks[i]));
  const newDays = trip.days.map((d) => {
    if (d === dayA) return { ...d, blocks: newBlocksA };
    if (d === dayB) return { ...d, blocks: newBlocksB };
    return d;
  });
  if (!identityOptions(identity)) return finish(trip, trip, newDays, trip.spec.choices);
  // The edits follow the moved content while each placement keeps its OWN address: a
  // window does not travel, its content does. Intent is recorded for every block of both
  // days, because a day swap is a real operation on each of them even where the inputs
  // carried no earlier edit.
  const recorded = intentsFor(trip, 'swap_days', 'swapDays', [...newBlocksA, ...newBlocksB]);
  if (!recorded.ok) return recorded;
  return finish(trip, trip, newDays, trip.spec.choices, recorded.identity);
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
  if (editEvidenceGuard(trip)) return [];
  return trip.days
    .map((d) => d.dayNumber)
    .filter((n) => n !== dayNumber && checkSwapDays(trip, dayNumber, n, content).ok);
}

// ---------------------------------------------------------------------------
// C6. undo

/**
 * Pop the most recent trip from the history stack.
 *
 * Q8 packet 1b: THE DEFAULT PATH IS UNCHANGED, and the default path is every production
 * call — `handleUndo` calls `undo(t)` on any record the reader admits. With `identity`
 * null the snapshot's own `identity` is restored exactly as it stands: no union, no
 * mixed-history refusal, no behaviour change on any admitted record, identity-bearing
 * ones included. An earlier draft of this packet made the union and the refusal
 * unconditional, which would have changed behaviour on exactly the records the reader
 * admits today; that is why both are gated here.
 *
 * Under the opt-in, `blocks` and `edits` rewind with the snapshot while `used` is the
 * union of the snapshot's and the current trip's — the only field that does not rewind,
 * and no entry is ever deleted to free a key. Mixed history, one side carrying a map and
 * the other not, refuses by name rather than fabricating a `used`-only map.
 *
 * Two source facts this relies on: history entries carry no history of their own and are
 * capped at HISTORY_CAP, which is harmless because the current trip's `used` has
 * accumulated everything; and history is not persisted — the page saves with
 * `history: []`.
 *
 * @param {Trip} trip
 * @param {null|true|{data?: Object}} [identity]  Q8 1b's opt-in; `null` is today's behaviour.
 * @returns {EditResult}
 */
export function undo(trip, identity = null) {
  const evidenceFailure = editEvidenceGuard(trip); if (evidenceFailure) return evidenceFailure;
  if (!trip.history?.length) return { ok: false, reason: 'nothing_to_undo', message: 'Nothing to undo.' };
  // Entries are stored without history, so the remaining stack is rebuilt from the outer array.
  const prior = trip.history[trip.history.length - 1];
  const priorFailure = editEvidenceGuard(prior); if (priorFailure) return priorFailure;
  if (!identityOptions(identity)) return { ok: true, trip: { ...prior, history: trip.history.slice(0, -1) } };
  const restored = undoIdentity(prior, trip);
  if (!restored.ok) return restored;
  return {
    ok: true,
    trip: { ...prior, history: trip.history.slice(0, -1), ...(restored.identity !== undefined ? { identity: restored.identity } : {}) }
  };
}
