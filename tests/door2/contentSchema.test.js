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
  ['unknown_visits_place', good({ visitsPlaceId: 'atlantis' })]
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

test('F2-S6: fragment_reused: one (sourceTemplateId, sourceFragmentId) pair, two items (F1-D23)', () => {
  const prov = (sourceFragmentId) => ({ kind: 'extracted', sourceTemplateId: 'tpl_47_kyoto_day2', sourceFragmentId });
  const r = validateContentCatalogue([good({ id: 'a', provenance: prov('default') }), good({ id: 'b', provenance: prov('default') })], { placeIds });
  assert.deepEqual(codes(r), ['fragment_reused']);
  assert.equal(r.errors[0].itemId, 'b');

  // One template may legitimately yield several fragments.
  const split = validateContentCatalogue([good({ id: 'a', provenance: prov('morning') }), good({ id: 'b', provenance: prov('afternoon') })], { placeIds });
  assert.equal(split.ok, true);
});

test('F2-S7: items with no sourceTemplateId are exempt from the fragment check', () => {
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
    assert.equal(p.sourceTemplateId, undefined, `${item.id}: the pilot has no template ids to carry`);
    if (item.source.kind === 'authored') {
      assert.deepEqual(p, { kind: 'authored', sourceFragmentId: 'default', author: 'claude', draftedBy: 'claude' }, item.id);
    } else {
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

test('F2-S9: until template ids exist, no two extracted items share a (bundle, template title)', () => {
  // The fragment check is exempt for every pilot item (none has a sourceTemplateId), so this pins the same
  // exclusivity on the pointer the pilot does have. F7 should replace it with the real (id, fragment) check.
  const keys = PILOT_CONTENT.filter((i) => i.provenance.kind === 'extracted').map((i) => `${i.provenance.sourceBundleId}|${i.provenance.sourceTemplateTitle}`);
  assert.equal(new Set(keys).size, keys.length);
});
