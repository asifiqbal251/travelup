// F2: content coverage per Place and slot class, the instrument for readiness
// condition (c) (design F1-D22 / Q10). Read-only.
//
// Counting rule: an item counts once for EACH slot in its `slots` array, so
// qc_short_ramparts (['short', 'half']) adds one to short and one to half.
// `total` counts items, so it can be smaller than the sum of `bySlot`.
//
// `statusFilter` picks the question. null: what content exists. 'approved'
// (the default): what content is reviewed, which is what condition (c) asks.
// `approved` and `pendingReview` always count every item at the Place, so the
// review position is visible whichever filter is used.

import { SLOT_CLASSES, toIdSet } from './contentSchema.js';

/** @typedef {import('./types.js').ContentItem} ContentItem */

const TABLE_SLOTS = ['full', 'half', 'short', 'evening'];

/**
 * Places with no items get a zero row. Items at a place not in `placeIds` are left out (the validator reports them).
 * @param {ContentItem[]} items
 * @param {{placeIds: string[]|Set<string>|Object, statusFilter?: 'approved'|'pending_review'|null}} options
 * @returns {Object<string, {total: number, bySlot: {full: number, half: number, evening: number, short: number}, approved: number, pendingReview: number}>}
 */
export function coverageByPlace(items, { placeIds, statusFilter = 'approved' }) {
  const coverage = {};
  for (const placeId of toIdSet(placeIds)) {
    coverage[placeId] = { total: 0, bySlot: Object.fromEntries(SLOT_CLASSES.map((s) => [s, 0])), approved: 0, pendingReview: 0 };
  }
  for (const item of items) {
    const row = coverage[item.placeId];
    if (!row) continue;
    if (item.status === 'approved') row.approved += 1;
    else if (item.status === 'pending_review') row.pendingReview += 1;
    if (statusFilter != null && item.status !== statusFilter) continue;
    row.total += 1;
    for (const slot of new Set(item.slots)) {
      if (slot in row.bySlot) row.bySlot[slot] += 1;
    }
  }
  return coverage;
}

/**
 * A plain-text table, one row per place in the coverage's order.
 * @param {ReturnType<typeof coverageByPlace>} coverage
 * @param {{title?: string}} [options]
 */
export function formatCoverageTable(coverage, { title } = {}) {
  const header = ['place', 'total', ...TABLE_SLOTS, 'approved', 'pending'];
  const rows = Object.entries(coverage).map(([placeId, c]) => [
    placeId,
    c.total,
    ...TABLE_SLOTS.map((s) => c.bySlot[s]),
    c.approved,
    c.pendingReview
  ].map(String));
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const line = (cells) => cells.map((cell, i) => (i === 0 ? cell.padEnd(widths[i]) : cell.padStart(widths[i]))).join('  ');
  const out = [line(header), widths.map((w) => '-'.repeat(w)).join('  '), ...rows.map(line)];
  return (title ? [title, ...out] : out).join('\n');
}
