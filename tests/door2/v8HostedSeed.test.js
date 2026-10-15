import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// H5's hosted seed fixture, checked here so the diff review can trust what the owner
// will paste into a browser. The procedure is in tests/fixtures/v8-hosted-seed.README.md.
//
// The stored value is an ARRAY of draft envelopes, not one envelope holding several
// records: readStore accepts only an array and reads anything else as unreadable.

import { loadDraftTrip } from '../../src/lib/door2/draftStorage.js';

const store = new Map();
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) };

const raw = readFileSync(fileURLToPath(new URL('../fixtures/v8-hosted-seed.json', import.meta.url)), 'utf8');

test('H5: the hosted seed is an array of four labelled envelopes, all ZZ-TEST', () => {
  const seed = JSON.parse(raw);
  assert.ok(Array.isArray(seed), 'the stored value must be an array');
  assert.equal(seed.length, 4);
  for (const entry of seed) {
    assert.equal(entry.envelopeVersion, 2);
    assert.ok(entry.label.startsWith('ZZ-TEST'), `labelled for safe identification: ${entry.label}`);
    assert.ok(entry.destinationLabel.startsWith('ZZ-TEST'));
    assert.ok(typeof entry.id === 'string' && entry.id.startsWith('zz_test_'));
    assert.ok(typeof entry.savedAt === 'string');
  }
});

test('H5: each seeded record behaves as its label claims, and seeding writes nothing', () => {
  store.set('door2_drafts_v1', raw);
  const before = store.get('door2_drafts_v1');

  const valid = loadDraftTrip('zz_test_v8_valid');
  assert.equal(valid.compatible, true);
  assert.equal(valid.readOnly, true);
  assert.equal(valid.identity, 'valid');

  const absent = loadDraftTrip('zz_test_v8_absent');
  assert.equal(absent.compatible, true);
  assert.equal(absent.readOnly, true);
  assert.equal(absent.identity, 'absent');
  assert.notEqual(absent.readOnlyNotice, valid.readOnlyNotice, 'the two rows do not share a sentence');

  const unsafe = loadDraftTrip('zz_test_v8_unsafe');
  assert.equal(unsafe.compatible, false);
  assert.match(unsafe.reason, /^"ZZ-TEST v8 unsafe render" can't be reopened here — /);
  assert.match(unsafe.reason, /activity\.summary/, 'names the field that would have thrown');
  assert.equal(unsafe.trip, undefined, 'the trip is never handed over');

  const control = loadDraftTrip('zz_test_v7_control');
  assert.equal(control.compatible, true);
  assert.deepStrictEqual(Object.keys(control).sort(), ['compatible', 'trip'], 'the v7 control keeps the legacy result shape');

  assert.equal(store.get('door2_drafts_v1'), before, 'reading every seeded record writes nothing');
});
