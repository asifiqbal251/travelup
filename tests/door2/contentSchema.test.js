import { test } from 'node:test';
import assert from 'node:assert/strict';

import { validateContentCatalogue, validateContentItem } from '../../src/lib/door2/contentSchema.js';
import { PILOT_CONTENT } from '../../src/lib/door2/pilotContent.js';
import { PILOT_PLACES } from '../../src/lib/door2/pilotData.js';

// F2: the ContentItem v2 validator, and the backfilled pilot catalogue.

const placeIds = Object.keys(PILOT_PLACES);

/** A valid half-slot item; each failing case below breaks exactly one rule. */
const good = (extra = {}) => ({
  id: 'x_item',
  placeId: 'kyoto',
  title: 'A test item',
  slots: ['half'],
  intensity: 'Light',
  interests: [],
  summary: 'One line.',
  source: { kind: 'authored', note: 'test' },
  status: 'pending_review',
  provenance: { kind: 'authored', sourceFragmentId: 'default' },
  review: { reviewedBy: null, reviewedAt: null },
  ...extra
});

const codes = (r) => r.errors.map((e) => e.code);

test('F2-S1: the whole pilot catalogue passes', () => {
  assert.equal(PILOT_CONTENT.length, 118);
  const r = validateContentCatalogue(PILOT_CONTENT, { placeIds });
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.warnings, []);
  assert.equal(r.ok, true);
});

test('F2-S2: a valid item has no errors, and placeIds may be an array, a Set or PILOT_PLACES', () => {
  for (const ids of [placeIds, new Set(placeIds), PILOT_PLACES]) {
    assert.deepEqual(validateContentItem(good(), { placeIds: ids }), { ok: true, errors: [] });
  }
});

const ONE_ITEM_CASES = [
  ['unknown_place', good({ placeId: 'atlantis' })],
  ['empty_slots', good({ slots: [] })],
  ['empty_slots', good({ slots: undefined })],
  ['bad_slot', good({ slots: ['half', 'morning'] })],
  ['full_missing_parts', good({ slots: ['full'], morning: 'M.', afternoon: 'A.' })],
  ['signature_unsourced', good({ signature: 'Oldest wooden hall in the city' })],
  ['signature_unsourced', good({ signature: 'x', review: { reviewedBy: 'r', reviewedAt: '2026-10-01T00:00:00Z', sourceName: 'Guide' } })],
  ['bad_status', good({ status: 'reviewed' })],
  ['bad_status', good({ status: undefined })],
  ['unknown_visits_place', good({ visitsPlaceId: 'atlantis' })],
  ['provenance_incomplete', good({ provenance: { kind: 'extracted', sourceTemplateTitle: 'Kyoto day 2', sourceFragmentId: 'default' } })],
  ['provenance_incomplete', good({ provenance: { kind: 'extracted', sourceBundleId: 'b_kyoto', sourceFragmentId: 'default' } })]
];

for (const [code, item] of ONE_ITEM_CASES) {
  test(`F2-S3: ${code} is reported (${JSON.stringify(item).slice(60, 120)}…)`, () => {
    const r = validateContentItem(item, { placeIds });
    assert.equal(r.ok, false);
    assert.deepEqual(codes(r), [code]);
    assert.equal(r.errors[0].itemId, 'x_item');
  });
}

test('F2-S4: a full item with all three parts passes, and a sourced signature passes', () => {
  assert.equal(validateContentItem(good({ slots: ['full', 'half'], morning: 'M.', afternoon: 'A.', evening: 'E.' }), { placeIds }).ok, true);
  const sourced = good({ signature: 'x', review: { reviewedBy: 'r', reviewedAt: '2026-10-01T00:00:00Z', sourceUrl: 'https://example.org' } });
  assert.equal(validateContentItem(sourced, { placeIds }).ok, true);
});

test('F2-S5: duplicate_id is reported once per repeat', () => {
  const r = validateContentCatalogue([good(), good({ placeId: 'tokyo' })], { placeIds });
  assert.deepEqual(codes(r), ['duplicate_id']);
});

/** Extracted provenance keyed on F2.1's triple; the index is corroboration only. */
const extracted = (sourceFragmentId, extra = {}) => ({
  kind: 'extracted',
  sourceBundleId: 'b_kyoto',
  sourceTemplateTitle: 'Kyoto day 2',
  sourceTemplateIndex: 1,
  sourceFragmentId,
  ...extra
});

test('F2-S6: fragment_reused: one (sourceBundleId, sourceTemplateTitle, sourceFragmentId) triple, two items (F1-D23, F2.1)', () => {
  const r = validateContentCatalogue([good({ id: 'a', provenance: extracted('default') }), good({ id: 'b', provenance: extracted('default') })], { placeIds });
  assert.deepEqual(codes(r), ['fragment_reused']);
  assert.equal(r.errors[0].itemId, 'b');

  // Changing only the fragment id makes it pass: one template may legitimately yield several fragments.
  const split = validateContentCatalogue([good({ id: 'a', provenance: extracted('default') }), good({ id: 'b', provenance: extracted('morning') })], { placeIds });
  assert.equal(split.ok, true);

  // The same title in a different record is a different template.
  const otherBundle = validateContentCatalogue([good({ id: 'a', provenance: extracted('default') }), good({ id: 'b', provenance: extracted('default', { sourceBundleId: 'b_tokyo' }) })], { placeIds });
  assert.equal(otherBundle.ok, true);
});

test('F2.1-S6b: sourceTemplateIndex is not part of the key: a differing index does not separate a reused fragment', () => {
  const r = validateContentCatalogue([good({ id: 'a', provenance: extracted('default') }), good({ id: 'b', provenance: extracted('default', { sourceTemplateIndex: 7 }) })], { placeIds });
  assert.deepEqual(codes(r), ['fragment_reused']);
});

test('F2.1-S6c: no title-only fallback: two extracted items missing sourceBundleId are incomplete, not matched to each other', () => {
  const noBundle = { kind: 'extracted', sourceTemplateTitle: 'Kyoto day 2', sourceFragmentId: 'default' };
  const r = validateContentCatalogue([good({ id: 'a', provenance: noBundle }), good({ id: 'b', provenance: noBundle })], { placeIds });
  assert.deepEqual(codes(r), ['provenance_incomplete', 'provenance_incomplete']);
});

test('F2-S7: authored items are exempt from the fragment check', () => {
  const r = validateContentCatalogue([good({ id: 'a' }), good({ id: 'b' })], { placeIds });
  assert.equal(r.ok, true);
});

test('F2-S8: the backfill is mechanical: every item pending, unreviewed, provenance matching its source', () => {
  for (const item of PILOT_CONTENT) {
    assert.equal(item.status, 'pending_review', item.id);
    assert.deepEqual(item.review, { reviewedBy: null, reviewedAt: null }, item.id);
    assert.equal(item.signature, undefined, item.id);
    const p = item.provenance;
    assert.equal(p.kind, item.source.kind, item.id);
    assert.equal(p.sourceFragmentId, 'default', item.id);
    assert.equal(p.sourceTemplateId, undefined, `${item.id}: F2.1 removed sourceTemplateId`);
    assert.equal(p.sourceRecordId, undefined, `${item.id}: F2.1 removed sourceRecordId (it duplicated sourceBundleId)`);
    if (item.source.kind === 'authored') {
      assert.deepEqual(p, { kind: 'authored', sourceFragmentId: 'default', author: 'claude', draftedBy: 'claude' }, item.id);
    } else {
      assert.ok(Number.isInteger(p.sourceTemplateIndex) && p.sourceTemplateIndex >= 0, item.id);
      assert.equal(p.sourceBundleId, item.source.bundleId, item.id);
      assert.equal(p.sourceBundleName, item.source.bundleName, item.id);
      assert.equal(p.sourceTemplateTitle, item.source.templateTitle, item.id);
      assert.equal(p.edited, item.source.edited, item.id);
    }
  }
  assert.deepEqual(
    PILOT_CONTENT.reduce((n, i) => ({ ...n, [i.provenance.kind]: (n[i.provenance.kind] ?? 0) + 1 }), {}),
    { extracted: 45, authored: 73 }
  );
});

// F2-S9 (no two extracted items share a (bundle, template title)) is retired: it stood in for the inert
// sourceTemplateId check, and F2-S1 now runs the real (bundle, title, fragment) check over the whole catalogue.
// With every fragment 'default' that is the same assertion.

test('F2.1-S10: template indices are 0-based and contiguous per bundle, in pilot file order', () => {
  const byBundle = new Map();
  for (const { provenance: p } of PILOT_CONTENT) {
    if (p.kind !== 'extracted') continue;
    const titles = byBundle.get(p.sourceBundleId) ?? new Map();
    titles.set(p.sourceTemplateTitle, p.sourceTemplateIndex);
    byBundle.set(p.sourceBundleId, titles);
  }
  for (const [bundleId, titles] of byBundle) {
    assert.deepEqual([...titles.values()], [...titles.keys()].map((_, i) => i), bundleId);
  }
});
