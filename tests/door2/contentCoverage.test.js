import { test } from 'node:test';
import assert from 'node:assert/strict';

import { coverageByPlace, formatCoverageTable } from '../../src/lib/door2/contentCoverage.js';
import { PILOT_CONTENT } from '../../src/lib/door2/pilotContent.js';
import { PILOT_PLACES } from '../../src/lib/door2/pilotData.js';

// F2: content coverage per Place and slot class (readiness condition (c), F1-D22).

const placeIds = Object.keys(PILOT_PLACES);
const all = coverageByPlace(PILOT_CONTENT, { placeIds, statusFilter: null });

test('F2-C1: anchor: Québec City is total 6, full 4, half 2, short 1, evening 1', () => {
  // The number the Phase F design doc got wrong (it said 5 full and a half/short gap). If this fails, either
  // the content changed or the counting did, and both deserve a look.
  assert.deepEqual(all.quebec_city, { total: 6, bySlot: { full: 4, half: 2, evening: 1, short: 1 }, approved: 0, pendingReview: 6 });
});

test('F2-C2: a multi-slot item counts once in each of its slots, and once in total', () => {
  const items = [
    { id: 'a', placeId: 'kyoto', slots: ['short', 'half'], status: 'pending_review' },
    { id: 'b', placeId: 'kyoto', slots: ['full', 'half'], status: 'approved' }
  ];
  const c = coverageByPlace(items, { placeIds: ['kyoto'], statusFilter: null });
  assert.deepEqual(c.kyoto, { total: 2, bySlot: { full: 1, half: 2, evening: 0, short: 1 }, approved: 1, pendingReview: 1 });
  const approvedOnly = coverageByPlace(items, { placeIds: ['kyoto'] });
  assert.deepEqual(approvedOnly.kyoto, { total: 1, bySlot: { full: 1, half: 1, evening: 0, short: 0 }, approved: 1, pendingReview: 1 });
});

test('F2-C3: with the default approved filter every Place reads zero: nothing is reviewed yet', () => {
  const approved = coverageByPlace(PILOT_CONTENT, { placeIds });
  for (const [placeId, c] of Object.entries(approved)) {
    assert.deepEqual([c.total, c.bySlot], [0, { full: 0, half: 0, evening: 0, short: 0 }], placeId);
    assert.equal(c.approved, 0, placeId);
  }
});

test('F2-C4: totals over every Place add up to the catalogue, and Places without items get a zero row', () => {
  assert.equal(Object.values(all).reduce((n, c) => n + c.total, 0), PILOT_CONTENT.length);
  assert.deepEqual(Object.keys(all).sort(), [...placeIds].sort());
  assert.ok(Object.values(all).some((c) => c.total === 0), 'some places (e.g. the origin) have no shelf');
});

test('F2-C5: Kyoto and Tokyo, pinned', () => {
  assert.deepEqual(all.kyoto, { total: 10, bySlot: { full: 6, half: 4, evening: 2, short: 1 }, approved: 0, pendingReview: 10 });
  assert.deepEqual(all.tokyo, { total: 17, bySlot: { full: 14, half: 8, evening: 3, short: 2 }, approved: 0, pendingReview: 17 });
});

test('F2-C6: the formatted table', () => {
  const pick = (c, ids) => Object.fromEntries(ids.map((id) => [id, c[id]]));
  const table = formatCoverageTable(pick(all, ['quebec_city', 'kyoto', 'tokyo']), { title: 'All content (statusFilter: null)' });
  assert.equal(
    table,
    [
      'All content (statusFilter: null)',
      'place        total  full  half  short  evening  approved  pending',
      '-----------  -----  ----  ----  -----  -------  --------  -------',
      'quebec_city      6     4     2      1        1         0        6',
      'kyoto           10     6     4      1        2         0       10',
      'tokyo           17    14     8      2        3         0       17'
    ].join('\n')
  );
});
