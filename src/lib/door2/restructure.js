/** @typedef {import('./types.js').Trip} Trip */
/** @typedef {import('./types.js').TripSpec} TripSpec */
/** @typedef {import('./types.js').RoutePlan} RoutePlan */
/** @typedef {import('./types.js').ContentItem} ContentItem */

import { tripFingerprint } from './fingerprint.js';
import { activityFor, classifySlot, eligibleItemsForBlock, fillTrip } from './fill.js';
import { PILOT_CONTENT } from './pilotContent.js';
import { PILOT_DATA, buildTripFromRoutePlan, findRoutePackage } from './planner.js';
import { PILOT_ROUTE_FAMILIES } from './pilotData.js';
import { buildRouteResult, getPlace } from './route.js';
import { scheduleRoute } from './schedule.js';
import { validateFilled } from './validate.js';

// Trip editor (design §4–§6, v2 §0.1): structural changes as previews.
//
// Every preview is a pure function returning either ranked proposals, each
// carrying a fully rebuilt, filled and validated Trip plus a plain-language
// diff, or a structured refusal (`change_not_feasible` with a machine-readable
// `why`). Confirming is only a commit: applyProposal never recalculates.
//
// Structural changes never go through edit.js's finish(): the calendar is
// rebuilt here, so validateEditInvariant (calendar unchanged) doesn't apply.
// Instead, every proposal trip is re-checked by validateFilled.
//
// Deterministic: no randomness, no Date.now(). Identical input gives
// identical proposals, ids and order.

const HISTORY_CAP = 20; // same cap as edit.js
const MAX_DONOR_PROPOSALS = 2;
const SELECTION_RANK = Object.freeze({ default: 0, user_added: 1, required: 2 });

/**
 * Duration is flexible when the traveller fixed no dates (v1's UI asks only for a month).
 * @param {TripSpec} spec
 */
export function isDurationFlexible(spec) {
  return spec.startDate == null && spec.endDate == null;
}

// ---------------------------------------------------------------------------
// Helpers

function placeName(data, placeId) {
  return getPlace(data.places, placeId)?.name ?? placeId;
}

function plural(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

function refusal(why, message, alternatives = []) {
  return { ok: false, reason: 'change_not_feasible', why, message, alternatives };
}

function activityBlocks(trip) {
  return trip.days.flatMap((d) => d.blocks.filter((b) => b.type === 'activity').map((b) => ({ block: b, dayNumber: d.dayNumber })));
}

/** The trip may use unreviewed connections only if it already does (never escalate). */
function reviewPolicyFor(trip) {
  const usesDrafts = trip.days.some((d) => d.blocks.some((b) => b.type === 'travel' && b.provenance?.reviewed === false));
  return usesDrafts ? 'allow_drafts' : 'strict';
}

function replaceBlock(trip, newBlock) {
  return {
    ...trip,
    days: trip.days.map((d) => ({ ...d, blocks: d.blocks.map((b) => (b.id === newBlock.id ? newBlock : b)) }))
  };
}

// ---------------------------------------------------------------------------
// §6 reconcile: the only way content moves between two schedules.

/**
 * Carries content from oldTrip onto a rebuilt skeleton, keyed by stable block id:
 * 1. pinned items first, 2. every other kept item, 3. fillTrip for the rest.
 * A block's item is kept only when the same block id exists with the same slot
 * class and the item is still eligible there (place, minDayAtStop against the
 * new offset, not used elsewhere). Pinned items that can't be kept are listed
 * in keptItemsAffected, never silently dropped. Items the traveller rejected
 * are never placed.
 *
 * @param {Trip} oldTrip
 * @param {Trip} newSkeleton  Unfilled skeleton (buildTripFromRoutePlan).
 * @param {ContentItem[]} [content]
 * @returns {{trip: Trip, keptItemsAffected: Object[], activitiesLost: Object[], activitiesAdded: Object[]}}
 */
export function reconcile(oldTrip, newSkeleton, content = PILOT_CONTENT) {
  const choices = oldTrip.spec.choices ?? { pinned: [], rejected: [], placed: [] };
  const spec = { ...newSkeleton.spec, choices };
  const skeleton = { ...newSkeleton, spec };
  const contentById = new Map(content.map((i) => [i.id, i]));
  const newBlocksById = new Map(skeleton.days.flatMap((d) => d.blocks.map((b) => [b.id, b])));

  const oldActivities = activityBlocks(oldTrip);
  const keptItemsAffected = [];
  let working = skeleton;

  const tryKeep = (oldBlock) => {
    const target = newBlocksById.get(oldBlock.id);
    if (!target || target.type !== 'open') return false;
    const slot = classifySlot(target);
    if (slot !== classifySlot(oldBlock)) return false;
    const item = contentById.get(oldBlock.anchor.contentId);
    if (!item) return false;
    const eligible = eligibleItemsForBlock(working, target, content);
    if (!eligible.some((i) => i.id === item.id)) return false;
    const kept = {
      ...target,
      type: 'activity',
      anchor: { ...target.anchor, contentId: item.id },
      activity: activityFor(item, slot),
      generationStatus: 'ok',
      provenance: oldBlock.provenance,
      userEdited: oldBlock.userEdited,
      locked: oldBlock.locked
    };
    working = replaceBlock(working, kept);
    return true;
  };

  // 1. Pinned first.
  for (const { block } of oldActivities) {
    if (!block.locked) continue;
    if (!tryKeep(block)) {
      keptItemsAffected.push({
        contentId: block.anchor.contentId,
        title: block.activity.title,
        placeId: block.placeId,
        blockId: block.id
      });
    }
  }
  // 2. Everything else that still fits.
  for (const { block } of oldActivities) {
    if (!block.locked) tryKeep(block);
  }
  // 3. Fill the rest with today's fillTrip scoring. Items already placed are
  // excluded by fill's own used-item scan; rejected items are excluded by
  // filtering the shelf it may choose from.
  const rejected = new Set(choices.rejected ?? []);
  const shelf = rejected.size > 0 ? content.filter((i) => !rejected.has(i.id)) : content;
  const filled = fillTrip(working, spec, shelf);
  validateFilled(filled, skeleton, spec, content);

  const before = new Map(oldActivities.map(({ block }) => [block.anchor.contentId, block]));
  const afterList = activityBlocks(filled);
  const after = new Map(afterList.map(({ block }) => [block.anchor.contentId, block]));
  const entry = (b) => ({ contentId: b.anchor.contentId, title: b.activity.title, placeId: b.placeId, blockId: b.id });
  return {
    trip: filled,
    keptItemsAffected,
    activitiesLost: oldActivities.filter(({ block }) => !after.has(block.anchor.contentId)).map(({ block }) => entry(block)),
    activitiesAdded: afterList.filter(({ block }) => !before.has(block.anchor.contentId)).map(({ block }) => entry(block))
  };
}

// ---------------------------------------------------------------------------
// Building proposals

/**
 * Rebuilds the trip for a changed allocation (same variant), reconciles its
 * content and wraps it as a Proposal. Returns null if the rebuild fails.
 */
function buildNightsProposal(trip, { id, label, kind, nights, totalDays }, ctx) {
  const rp = trip.routePlan;
  const plan = { ...rp, stops: rp.stops.map((s) => ({ ...s, nights: nights[s.key] })), nightsSource: 'user' };
  const spec = { ...trip.spec, totalDays };
  const skeleton = buildTripFromRoutePlan(spec, plan, ctx.data, { reviewPolicy: ctx.reviewPolicy });
  if (skeleton.ok === false) return null;
  const rec = reconcile(trip, skeleton, ctx.content);
  const newTrip = { ...rec.trip, history: [] };
  return {
    id,
    kind,
    label,
    baseFingerprint: ctx.baseFingerprint,
    routePlan: newTrip.routePlan,
    trip: newTrip,
    diff: {
      nights: rp.stops
        .filter((s) => nights[s.key] !== s.nights)
        .map((s) => ({ stopKey: s.key, placeId: s.placeId, from: s.nights, to: nights[s.key] })),
      totalDays: { from: trip.spec.totalDays, to: totalDays },
      placesAdded: [],
      placesRemoved: [],
      activitiesLost: rec.activitiesLost,
      activitiesAdded: rec.activitiesAdded,
      keptItemsAffected: rec.keptItemsAffected,
      newTravelDay: false,
      contentGaps: newTrip.contentGaps.length
    }
  };
}

function context(trip, options) {
  if (!trip.routePlan) throw new Error('restructure: trip has no routePlan (door2-v6 required)');
  return {
    data: options.data ?? PILOT_DATA,
    content: options.content ?? PILOT_CONTENT,
    reviewPolicy: options.reviewPolicy ?? reviewPolicyFor(trip),
    families: options.families ?? PILOT_ROUTE_FAMILIES,
    baseFingerprint: tripFingerprint(trip)
  };
}

const nightsMap = (rp) => Object.fromEntries(rp.stops.map((s) => [s.key, s.nights]));

// ---------------------------------------------------------------------------
// §5.2 previewAdjustNights

/**
 * More (+1) or less (−1) time at one stop. Proposals: up to 2 redistributions
 * (fewest content gaps first, then selectionSource default < user_added <
 * required, then surplus/interest, then route order), then "Add a day" /
 * "Shorten the trip by a day" last, only when the duration is flexible.
 *
 * @param {Trip} trip
 * @param {string} stopKey
 * @param {1|-1} delta
 * @param {{data?: Object, content?: ContentItem[], reviewPolicy?: 'strict'|'allow_drafts'}} [options]
 */
export function previewAdjustNights(trip, stopKey, delta, options = {}) {
  if (delta !== 1 && delta !== -1) throw new Error(`previewAdjustNights: delta must be +1 or -1, got ${delta}`);
  const ctx = context(trip, options);
  const rp = trip.routePlan;
  const index = rp.stops.findIndex((s) => s.key === stopKey);
  if (index < 0) throw new Error(`previewAdjustNights: unknown stop "${stopKey}"`);
  const target = rp.stops[index];
  const name = placeName(ctx.data, target.placeId);
  const flexible = isDurationFlexible(trip.spec);
  const N = trip.spec.totalDays;
  const base = nightsMap(rp);
  const sign = delta > 0 ? '+1' : '-1';

  if (delta > 0 && target.nights >= target.maxNights) {
    const alternatives = [];
    const alt = nearestWithHeadroom(rp, index);
    if (alt) {
      const r = previewAdjustNights(trip, alt.key, +1, options);
      if (r.ok && r.proposals.length > 0) {
        const altName = placeName(ctx.data, alt.placeId);
        alternatives.push({ ...r.proposals[0], label: `Give the extra night to ${altName} instead` });
      }
    }
    const message =
      target.maxNights === 0
        ? `${name} is a stop on the way; the route doesn't stay overnight there.`
        : `${plural(target.maxNights, 'night')} is the most that works in ${name}.`;
    return refusal('allocation_maximum', message, alternatives);
  }
  if (delta < 0 && target.nights <= target.minNights) {
    return refusal(
      'allocation_minimum',
      target.minNights === 0 ? `There are no nights in ${name} to take away.` : `${name} needs at least ${plural(target.minNights, 'night')}.`,
      []
    );
  }

  const candidates = [];
  rp.stops.forEach((s, i) => {
    if (i === index || s.maxNights === 0) return;
    if (delta > 0 && s.nights > s.minNights) candidates.push({ stop: s, i });
    if (delta < 0 && s.nights < s.maxNights) candidates.push({ stop: s, i });
  });

  const built = [];
  for (const { stop, i } of candidates) {
    const nights = { ...base, [stopKey]: base[stopKey] + delta, [stop.key]: base[stop.key] - delta };
    const otherName = placeName(ctx.data, stop.placeId);
    const proposal = buildNightsProposal(
      trip,
      delta > 0
        ? { id: `nights:${stopKey}:+1:from:${stop.key}`, kind: 'redistribute', label: `Take a night from ${otherName}`, nights, totalDays: N }
        : { id: `nights:${stopKey}:-1:to:${stop.key}`, kind: 'redistribute', label: `Give the night to ${otherName}`, nights, totalDays: N },
      ctx
    );
    if (proposal) built.push({ proposal, stop, i });
  }

  // Ranking. +1 donors: fewest gaps, then default < user_added < required,
  // then largest surplus, then route order. −1 recipients: fewest gaps, then
  // most unused eligible content at that place (design §5.2), then key.
  const unused = delta < 0 ? unusedContentByPlace(trip, ctx.content) : null;
  built.sort((a, b) => {
    const gaps = a.proposal.diff.contentGaps - b.proposal.diff.contentGaps;
    if (gaps !== 0) return gaps;
    if (delta > 0) {
      const sel = (SELECTION_RANK[a.stop.selectionSource] ?? 0) - (SELECTION_RANK[b.stop.selectionSource] ?? 0);
      if (sel !== 0) return sel;
      const surplus = b.stop.nights - b.stop.minNights - (a.stop.nights - a.stop.minNights);
      if (surplus !== 0) return surplus;
      return a.i - b.i;
    }
    const interest = (unused.get(b.stop.placeId) ?? 0) - (unused.get(a.stop.placeId) ?? 0);
    if (interest !== 0) return interest;
    return a.stop.key < b.stop.key ? -1 : a.stop.key > b.stop.key ? 1 : 0;
  });
  const proposals = built.slice(0, MAX_DONOR_PROPOSALS).map((x) => x.proposal);

  if (flexible) {
    const nights = { ...base, [stopKey]: base[stopKey] + delta };
    const proposal = buildNightsProposal(
      trip,
      delta > 0
        ? { id: `nights:${stopKey}:+1:extend`, kind: 'extend', label: 'Add a day to the trip', nights, totalDays: N + 1 }
        : { id: `nights:${stopKey}:-1:shorten`, kind: 'shorten', label: 'Shorten the trip by a day', nights, totalDays: N - 1 },
      ctx
    );
    if (proposal) proposals.push(proposal);
  }

  if (proposals.length === 0) {
    return refusal(
      'no_donor',
      delta > 0
        ? `Every other stop is already at its shortest, and your trip dates are fixed.`
        : `Every other stop is already at its longest, and your trip dates are fixed.`,
      []
    );
  }
  return { ok: true, proposals, id: `nights:${stopKey}:${sign}` };
}

/** Nearest other stop (route distance, earlier first on ties) that can take another night. */
function nearestWithHeadroom(rp, index) {
  let best = null;
  rp.stops.forEach((s, i) => {
    if (i === index || s.maxNights === 0 || s.nights >= s.maxNights) return;
    const d = Math.abs(i - index);
    if (!best || d < best.d || (d === best.d && i < best.i)) best = { stop: s, d, i };
  });
  return best?.stop ?? null;
}

/** Count of content items per place not already used in the trip. */
function unusedContentByPlace(trip, content) {
  const used = new Set(activityBlocks(trip).map(({ block }) => block.anchor.contentId));
  const counts = new Map();
  for (const item of content) {
    if (used.has(item.id)) continue;
    counts.set(item.placeId, (counts.get(item.placeId) ?? 0) + 1);
  }
  return counts;
}

// ---------------------------------------------------------------------------
// previewChangeLength

/** Minimum days of a package for this spec (the same scheduler path the planner uses). */
function packageMinDays(pkg, spec, data) {
  const built = buildRouteResult(pkg, spec, data);
  if (built.missing) return null;
  try {
    const probe = scheduleRoute(built.routeResult, { ...spec, totalDays: 1 }, data);
    return probe.ok ? 1 : probe.detail.minDays;
  } catch {
    return null;
  }
}

/**
 * Redistribute nights for a new length, starting from the CURRENT allocation:
 * grow round-robin in route order (stops below max), shrink round-robin in
 * reverse route order (stops above min). Returns null if it can't.
 */
function redistribute(stops, current, delta) {
  const nights = { ...current };
  let remaining = Math.abs(delta);
  const order = delta > 0 ? stops : [...stops].reverse();
  while (remaining > 0) {
    const eligible = order.filter((s) => (delta > 0 ? s.maxNights > 0 && nights[s.key] < s.maxNights : nights[s.key] > s.minNights));
    if (eligible.length === 0) return null;
    for (const s of eligible) {
      if (remaining === 0) break;
      nights[s.key] += delta > 0 ? 1 : -1;
      remaining -= 1;
    }
  }
  return nights;
}

/**
 * Make the whole trip longer or shorter (flexible duration only).
 * @param {Trip} trip
 * @param {number} newTotalDays
 * @param {{data?: Object, content?: ContentItem[], reviewPolicy?: 'strict'|'allow_drafts'}} [options]
 */
export function previewChangeLength(trip, newTotalDays, options = {}) {
  const ctx = context(trip, options);
  const rp = trip.routePlan;
  const N = trip.spec.totalDays;
  if (!Number.isInteger(newTotalDays) || newTotalDays < 1) throw new Error(`previewChangeLength: invalid length ${newTotalDays}`);
  if (!isDurationFlexible(trip.spec)) {
    return refusal('duration_fixed', "Your trip dates are fixed, so its length can't change here.", []);
  }
  if (newTotalDays === N) return refusal('no_change', `Your trip is already ${plural(N, 'day')}.`, []);

  if (newTotalDays < rp.minDays) {
    const alternatives = [];
    const shorter = shorterRouteAlternative(trip, newTotalDays, ctx);
    if (shorter) alternatives.push(shorter);
    return refusal('insufficient_days', `This route needs at least ${plural(rp.minDays, 'day')}. You picked ${newTotalDays}.`, alternatives);
  }
  const nights = redistribute(rp.stops, nightsMap(rp), newTotalDays - N);
  if (!nights) {
    return refusal('allocation_maximum', `This route works for up to ${plural(rp.maxDays, 'day')}.`, []);
  }
  const proposal = buildNightsProposal(
    trip,
    { id: `length:${N}->${newTotalDays}`, kind: newTotalDays > N ? 'extend' : 'shorten', label: `Make it ${plural(newTotalDays, 'day')}`, nights, totalDays: newTotalDays },
    ctx
  );
  if (!proposal) return refusal('allocation_maximum', `This route can't be made ${plural(newTotalDays, 'day')} long.`, []);
  return { ok: true, proposals: [proposal] };
}

/**
 * "Switch to the shorter route": the family backbone, when it fits and no
 * removed stop was required or added by the traveller. Never a held variant.
 */
function shorterRouteAlternative(trip, newTotalDays, ctx) {
  const rp = trip.routePlan;
  if (rp.variantId === rp.familyId) return null;
  const removed = rp.stops.filter((s) => s.optionalId);
  if (removed.some((s) => s.selectionSource === 'required' || s.selectionSource === 'user_added')) return null;
  const backbone = findRoutePackage(ctx.data, rp.familyId);
  if (!backbone || backbone.held) return null;
  const spec = { ...trip.spec, totalDays: newTotalDays };
  const minDays = packageMinDays(backbone, spec, ctx.data);
  if (minDays == null || minDays > newTotalDays) return null;

  const current = nightsMap(rp);
  const stops = backbone.stops.map((s) => ({ key: s.id, placeId: s.placeId, minNights: s.minNights, maxNights: s.maxNights }));
  const start = Object.fromEntries(stops.map((s) => [s.key, Math.min(Math.max(current[s.key] ?? s.minNights, s.minNights), s.maxNights)]));
  const startDays = minDays + stops.reduce((sum, s) => sum + (start[s.key] - s.minNights), 0);
  const nights = startDays === newTotalDays ? start : redistribute(stops, start, newTotalDays - startDays);
  if (!nights) return null;

  const plan = {
    variantId: backbone.id,
    stops: stops.map((s) => ({ key: s.key, nights: nights[s.key] })),
    nightsSource: 'user'
  };
  const skeleton = buildTripFromRoutePlan({ ...spec, routeTemplateId: backbone.id }, plan, ctx.data, { reviewPolicy: ctx.reviewPolicy });
  if (skeleton.ok === false) return null;
  const rec = reconcile(trip, skeleton, ctx.content);
  const newTrip = { ...rec.trip, history: [] };
  const newPlaces = new Set(newTrip.routePlan.stops.filter((s) => s.nights > 0).map((s) => s.placeId));
  const placesRemoved = [...new Set(removed.map((s) => s.placeId))].filter((p) => !newPlaces.has(p));
  return {
    id: `length:${trip.spec.totalDays}->${newTotalDays}:variant:${backbone.id}`,
    kind: 'switch_route',
    label: 'Switch to the shorter route',
    baseFingerprint: ctx.baseFingerprint,
    routePlan: newTrip.routePlan,
    trip: newTrip,
    diff: {
      nights: [],
      totalDays: { from: trip.spec.totalDays, to: newTotalDays },
      placesAdded: [],
      placesRemoved,
      activitiesLost: rec.activitiesLost,
      activitiesAdded: rec.activitiesAdded,
      keptItemsAffected: rec.keptItemsAffected,
      newTravelDay: false,
      contentGaps: newTrip.contentGaps.length
    }
  };
}

// ---------------------------------------------------------------------------
// §4.2/§4.3 previewAddOptional / previewRemoveOptional / previewMoveOptional
//
// A traveller's routePlan already carries `optionals: [{optionalId,
// positionId, selectionSource}]` in family declaration order (families.js
// builds each compiled package's `optionals` from `enumerateCombos`'s
// (optIndex, posIndex) order, and makeRoutePlan copies it through
// unchanged). Recomputing the target variantId is then just: take that list,
// add/remove/replace one entry, put it back in family order, and rebuild the
// same '{familyId}+{optionalId}@{positionId}+...' string compileFamily uses.
// findRoutePackage does an exact-id lookup, so a combination families.js
// didn't compile (exclusiveWith) or that only exists held simply won't
// resolve to a servable package — that's a refusal, not a bug.
//
// Invariant (design v2 §0.1): never build a proposal from a held
// (pending_review) position. Enforced here, at the position the caller names
// or the position auto-picked, before any variantId is ever computed — and
// again, defensively, on the resolved package's own `held` flag.

function familyFor(trip, families) {
  const family = families.find((f) => f.id === trip.routePlan.familyId);
  if (!family) throw new Error(`restructure: unknown family "${trip.routePlan.familyId}"`);
  return family;
}

function findOptional(family, optionalId) {
  return (family.optional ?? []).find((o) => o.id === optionalId);
}

/**
 * Turns a Map<optionalId, positionId> of desired picks into the ordered pick
 * list compileFamily would produce: family declaration order, one entry per
 * optional that's in the map.
 */
function orderedPicks(family, choices) {
  const picks = [];
  for (const opt of family.optional ?? []) {
    const positionId = choices.get(opt.id);
    if (positionId == null) continue;
    const pos = opt.positions.find((p) => p.id === positionId);
    if (pos) picks.push({ optionalId: opt.id, positionId: pos.id });
  }
  return picks;
}

function variantIdFor(family, picks) {
  return picks.length === 0 ? family.id : `${family.id}+${picks.map((p) => `${p.optionalId}@${p.positionId}`).join('+')}`;
}

/**
 * Nights for `pkg` at `totalDays`, starting from the trip's current
 * allocation (kept stops clamped to the new package's limits; stops new to
 * this package start at their minimum), then redistributed to fit — the same
 * pattern shorterRouteAlternative uses for a variant switch. Null if it
 * can't fit.
 */
function allocationFor(pkg, current, totalDays, minDays) {
  const stops = pkg.stops.map((s) => ({ key: s.id, minNights: s.minNights, maxNights: s.maxNights }));
  const start = Object.fromEntries(stops.map((s) => [s.key, Math.min(Math.max(current[s.key] ?? s.minNights, s.minNights), s.maxNights)]));
  const startDays = minDays + stops.reduce((sum, s) => sum + (start[s.key] - s.minNights), 0);
  if (startDays === totalDays) return start;
  return redistribute(stops, start, totalDays - startDays);
}

/**
 * Rebuilds the trip on `pkg` at `totalDays`, reconciles its content and wraps
 * it as a Proposal. Null if the package doesn't fit at that length or the
 * rebuild fails.
 */
function proposeVariantChange(trip, pkg, minDays, { id, kind, label }, ctx, totalDays) {
  if (minDays == null || minDays > totalDays) return null;
  const nights = allocationFor(pkg, nightsMap(trip.routePlan), totalDays, minDays);
  if (!nights) return null;
  return buildVariantProposal(trip, { id, kind, label, pkg, nights, totalDays }, ctx);
}

/** Rebuilds the trip for a new variant/allocation (buildNightsProposal's sibling for a changed stop set). */
function buildVariantProposal(trip, { id, kind, label, pkg, nights, totalDays }, ctx) {
  const spec = { ...trip.spec, totalDays, routeTemplateId: pkg.id };
  const plan = { variantId: pkg.id, stops: pkg.stops.map((s) => ({ key: s.id, nights: nights[s.id] })), nightsSource: 'user' };
  const skeleton = buildTripFromRoutePlan(spec, plan, ctx.data, { reviewPolicy: ctx.reviewPolicy });
  if (skeleton.ok === false) return null;
  const rec = reconcile(trip, skeleton, ctx.content);
  const newTrip = { ...rec.trip, history: [] };
  const oldNights = nightsMap(trip.routePlan);
  const oldPlaces = new Set(trip.routePlan.stops.filter((s) => s.nights > 0).map((s) => s.placeId));
  const newPlaces = new Set(newTrip.routePlan.stops.filter((s) => s.nights > 0).map((s) => s.placeId));
  return {
    id,
    kind,
    label,
    baseFingerprint: ctx.baseFingerprint,
    routePlan: newTrip.routePlan,
    trip: newTrip,
    diff: {
      nights: pkg.stops
        .filter((s) => (oldNights[s.id] ?? null) !== nights[s.id])
        .map((s) => ({ stopKey: s.id, placeId: s.placeId, from: oldNights[s.id] ?? 0, to: nights[s.id] })),
      totalDays: { from: trip.spec.totalDays, to: totalDays },
      placesAdded: [...newPlaces].filter((p) => !oldPlaces.has(p)),
      placesRemoved: [...oldPlaces].filter((p) => !newPlaces.has(p)),
      activitiesLost: rec.activitiesLost,
      activitiesAdded: rec.activitiesAdded,
      keptItemsAffected: rec.keptItemsAffected,
      newTravelDay: false,
      contentGaps: newTrip.contentGaps.length
    }
  };
}

/**
 * Add an optional place to the route. `positionId` picks which of the
 * optional's positions to insert at; omitted, the earliest approved position
 * (family declaration order) is used. Never resolves to a held position.
 * @param {Trip} trip
 * @param {string} optionalId
 * @param {string} [positionId]
 * @param {{data?: Object, content?: ContentItem[], reviewPolicy?: 'strict'|'allow_drafts', families?: Object[]}} [options]
 */
export function previewAddOptional(trip, optionalId, positionId, options = {}) {
  const ctx = context(trip, options);
  const family = familyFor(trip, ctx.families);
  const optional = findOptional(family, optionalId);
  if (!optional) return refusal('not_in_family', `${optionalId} isn't part of this route.`, []);

  const rp = trip.routePlan;
  if (rp.optionals.some((o) => o.optionalId === optionalId)) {
    return refusal('already_included', `${optional.label} is already part of your trip.`, []);
  }

  const pos = positionId != null ? optional.positions.find((p) => p.id === positionId) : optional.positions.find((p) => p.status === 'approved');
  if (positionId != null && !pos) return refusal('not_in_family', `${optionalId} has no position "${positionId}".`, []);
  if (!pos || pos.status !== 'approved') {
    return refusal('not_available', `${optional.label} isn't available to add yet.`, []);
  }

  const exclusiveWith = new Set(optional.exclusiveWith ?? []);
  const conflict = rp.optionals.find(
    (o) => exclusiveWith.has(o.optionalId) || (findOptional(family, o.optionalId)?.exclusiveWith ?? []).includes(optionalId)
  );
  if (conflict) {
    const conflictName = findOptional(family, conflict.optionalId)?.label ?? conflict.optionalId;
    return refusal('exclusive_optional', `${optional.label} can't be combined with ${conflictName}.`, []);
  }

  const choices = new Map(rp.optionals.map((o) => [o.optionalId, o.positionId]));
  choices.set(optionalId, pos.id);
  const pkg = findRoutePackage(ctx.data, variantIdFor(family, orderedPicks(family, choices)));
  if (!pkg || pkg.held) {
    return refusal('exclusive_optional', `${optional.label} can't be combined with what's already in your trip.`, []);
  }

  const N = trip.spec.totalDays;
  const flexible = isDurationFlexible(trip.spec);
  const minDays = packageMinDays(pkg, trip.spec, ctx.data);
  if (minDays == null) return refusal('not_available', `${optional.label} isn't available to add yet.`, []);
  if (minDays > N) {
    const alternatives = [];
    if (flexible) {
      const extended = proposeVariantChange(trip, pkg, minDays, { id: `add:${optionalId}:extend`, kind: 'extend', label: `Add ${optional.label}` }, ctx, minDays);
      if (extended) alternatives.push({ ...extended, label: `Add ${plural(minDays - N, 'day')} and include ${optional.label}` });
    }
    return refusal('insufficient_days', `${optional.label} needs ${plural(minDays, 'day')} in total. You have ${plural(N, 'day')}.`, alternatives);
  }
  const proposal = proposeVariantChange(trip, pkg, minDays, { id: `add:${optionalId}`, kind: 'add_optional', label: `Add ${optional.label}` }, ctx, N);
  if (!proposal) return refusal('allocation_maximum', `${optional.label} doesn't fit alongside the rest of your trip.`, []);
  return { ok: true, proposals: [proposal] };
}

/**
 * Remove an optional place from the route, freeing its nights back to the
 * rest of the trip (the trip's length doesn't change). Refuses only when the
 * traveller required this place at intake.
 * @param {Trip} trip
 * @param {string} optionalId
 * @param {{data?: Object, content?: ContentItem[], reviewPolicy?: 'strict'|'allow_drafts', families?: Object[]}} [options]
 */
export function previewRemoveOptional(trip, optionalId, options = {}) {
  const ctx = context(trip, options);
  const family = familyFor(trip, ctx.families);
  const optional = findOptional(family, optionalId);
  if (!optional) return refusal('not_in_family', `${optionalId} isn't part of this route.`, []);

  const rp = trip.routePlan;
  const current = rp.optionals.find((o) => o.optionalId === optionalId);
  if (!current) return refusal('not_included', `${optional.label} isn't part of your trip.`, []);
  if (current.selectionSource === 'required') {
    return refusal('required_place', `You asked for ${optional.label}, so we've kept it.`, []);
  }

  const choices = new Map(rp.optionals.filter((o) => o.optionalId !== optionalId).map((o) => [o.optionalId, o.positionId]));
  const pkg = findRoutePackage(ctx.data, variantIdFor(family, orderedPicks(family, choices)));
  if (!pkg || pkg.held) {
    return refusal('not_available', `${optional.label} can't be removed from your trip right now.`, []);
  }

  const N = trip.spec.totalDays;
  const minDays = packageMinDays(pkg, trip.spec, ctx.data);
  if (minDays == null) return refusal('not_available', `${optional.label} can't be removed from your trip right now.`, []);
  const proposal = proposeVariantChange(trip, pkg, minDays, { id: `remove:${optionalId}`, kind: 'remove_optional', label: `Remove ${optional.label}` }, ctx, N);
  if (!proposal) return refusal('allocation_maximum', `Removing ${optional.label} doesn't leave a trip that fits ${plural(N, 'day')}.`, []);
  return { ok: true, proposals: [proposal] };
}

/**
 * Move an already-included optional to a different position. Refuses when
 * the target position isn't approved (never builds a proposal from a held
 * position) or the combination isn't otherwise servable.
 * @param {Trip} trip
 * @param {string} optionalId
 * @param {string} positionId
 * @param {{data?: Object, content?: ContentItem[], reviewPolicy?: 'strict'|'allow_drafts', families?: Object[]}} [options]
 */
export function previewMoveOptional(trip, optionalId, positionId, options = {}) {
  const ctx = context(trip, options);
  const family = familyFor(trip, ctx.families);
  const optional = findOptional(family, optionalId);
  if (!optional) return refusal('not_in_family', `${optionalId} isn't part of this route.`, []);

  const rp = trip.routePlan;
  const current = rp.optionals.find((o) => o.optionalId === optionalId);
  if (!current) return refusal('not_included', `${optional.label} isn't part of your trip yet.`, []);
  if (current.positionId === positionId) {
    return refusal('already_included', `${optional.label} is already there.`, []);
  }

  const pos = optional.positions.find((p) => p.id === positionId);
  if (!pos) return refusal('not_in_family', `${optionalId} has no position "${positionId}".`, []);
  if (pos.status !== 'approved') {
    return refusal('order_fixed', pos.assumptions?.[0] ?? `${optional.label} can't move there yet.`, []);
  }

  const choices = new Map(rp.optionals.map((o) => [o.optionalId, o.positionId]));
  choices.set(optionalId, pos.id);
  const pkg = findRoutePackage(ctx.data, variantIdFor(family, orderedPicks(family, choices)));
  if (!pkg || pkg.held) {
    return refusal('not_available', `${optional.label} can't move there right now.`, []);
  }

  const N = trip.spec.totalDays;
  const minDays = packageMinDays(pkg, trip.spec, ctx.data);
  if (minDays == null) return refusal('not_available', `${optional.label} can't move there right now.`, []);
  if (minDays > N) {
    return refusal('insufficient_days', `Moving ${optional.label} needs ${plural(minDays, 'day')} in total. You have ${plural(N, 'day')}.`, []);
  }
  const proposal = proposeVariantChange(trip, pkg, minDays, { id: `move:${optionalId}:${positionId}`, kind: 'move_optional', label: `Move ${optional.label}` }, ctx, N);
  if (!proposal) return refusal('allocation_maximum', `${optional.label} doesn't fit there alongside the rest of your trip.`, []);
  return { ok: true, proposals: [proposal] };
}

// ---------------------------------------------------------------------------
// applyProposal

/**
 * Commits a proposal. Refuses a stale one (the trip changed since the
 * preview). Nothing is recalculated: the committed trip is proposal.trip, with
 * history pushed so the existing Undo covers structural edits too.
 * @param {Trip} trip
 * @param {Object} proposal
 * @returns {{ok: true, trip: Trip} | {ok: false, reason: 'stale_preview', message: string}}
 */
export function applyProposal(trip, proposal) {
  if (tripFingerprint(trip) !== proposal.baseFingerprint) {
    return { ok: false, reason: 'stale_preview', message: 'Your trip changed since this preview. Take another look before applying it.' };
  }
  const before = nightsMap(trip.routePlan);
  const nightsChanged =
    proposal.trip.routePlan.stops.length !== trip.routePlan.stops.length ||
    proposal.trip.routePlan.stops.some((s) => before[s.key] !== s.nights);
  const history = [...(trip.history ?? []), trip];
  const capped = history.length > HISTORY_CAP ? history.slice(history.length - HISTORY_CAP) : history;
  const routePlan = nightsChanged ? { ...proposal.trip.routePlan, nightsSource: 'user' } : proposal.trip.routePlan;
  return { ok: true, trip: { ...proposal.trip, routePlan, history: capped } };
}
