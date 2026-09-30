import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { generate } from './fixtures/pre-e3a-generate.mjs';

// A0: the tripwire. fixtures/pre-e3a.json was generated at f9c3fac, before any
// E3a engine edit (see the generator's header). Peru, Eastern Canada, Tokyo and
// NYC must keep producing byte-identical compiled packages, ranges, trips, every
// structural preview and every applyProposal. Never regenerate the fixture; it is
// keyed per family, and a family whose own data changed on purpose is re-pinned
// alone with the generator's --family mode (see its header).

const GOLDEN = JSON.parse(readFileSync(new URL('./fixtures/pre-e3a.json', import.meta.url), 'utf8'));
const ROOT = fileURLToPath(new URL('../../', import.meta.url));

/** First differing keys, so a failure names what moved instead of dumping 400 KB. */
function diffKeys(expected, actual) {
  const keys = new Set([...Object.keys(expected), ...Object.keys(actual)]);
  return [...keys].filter((k) => expected[k] !== actual[k]).slice(0, 10);
}

test('A0: pre-E3a pins hold for compiled packages, ranges, trips, previews and applies', async () => {
  const now = await generate(ROOT);
  assert.deepEqual(diffKeys(GOLDEN.compiled, now.compiled), [], 'compiled families (held included) changed');
  assert.deepEqual(now.compiledIds, GOLDEN.compiledIds);
  assert.deepEqual(diffKeys(GOLDEN.ranges, now.ranges), [], 'checkVariantsSchedulable output changed');
  assert.deepEqual(diffKeys(GOLDEN.trips, now.trips), [], 'built trips changed');
  assert.deepEqual(diffKeys(GOLDEN.edits, now.edits), [], 'preview outputs changed');
  assert.deepEqual(diffKeys(GOLDEN.applies, now.applies), [], 'applyProposal outputs changed');
  // The fixture covers the four families named in the E3a brief, and is not vacuous.
  for (const section of ['compiled', 'compiledIds', 'ranges']) {
    assert.deepEqual(Object.keys(GOLDEN[section]), ['peru_classic', 'ec_corridor', 'tokyo_city', 'nyc_city']);
  }
  assert.ok(Object.keys(GOLDEN.trips).length > 50);
  assert.ok(Object.keys(GOLDEN.edits).length > 1000);
  assert.ok(Object.keys(GOLDEN.applies).length > 400);
});
