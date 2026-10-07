import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newSessionId } from '../../src/lib/door2/sessionId.js';

const PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const ok = (id) => { assert.equal(typeof id, 'string'); assert.match(id, PATTERN); assert.ok(id.length <= 128); return id; };
const fixed = { now: () => 1_700_000_000_000, random: () => 0.5 };
const noCrypto = { crypto: undefined, ...fixed };
// `crypto: null` is an explicit (failing) source, unlike an absent property.
const none = { crypto: null, ...fixed };
const fill = (b) => { for (let i = 0; i < b.length; i++) b[i] = i + 1; return b; };

test('1 randomUUID present: its value is returned', () => {
  const id = '123e4567-e89b-42d3-a456-426614174000';
  assert.equal(newSessionId({ crypto: { randomUUID: () => id } }), id);
});

test('2 randomUUID absent, getRandomValues present: 32 lowercase hex characters', () => {
  assert.match(newSessionId({ crypto: { getRandomValues: fill } }), /^[0-9a-f]{32}$/);
});

test('3 both absent, identical injected clock/random: two calls differ', () => {
  const a = ok(newSessionId(none)); const b = ok(newSessionId(none));
  assert.notEqual(a, b);
  assert.notEqual(ok(newSessionId(noCrypto)), ok(newSessionId(noCrypto)));
});

test('4 both absent, different injected values: different IDs', () => {
  assert.notEqual(ok(newSessionId({ crypto: null, now: () => 1, random: () => 0.1 })), ok(newSessionId({ crypto: null, now: () => 2, random: () => 0.9 })));
});

test('5 crypto failure paths each yield a valid ID without throwing', () => {
  const trap = { get randomUUID() { throw new Error('access'); }, get getRandomValues() { throw new Error('access'); } };
  const cases = [
    {}, { crypto: null }, { crypto: 5 }, { crypto: {} }, { crypto: trap },
    { crypto: { randomUUID: () => { throw new Error('x'); } } },
    { crypto: { randomUUID: () => 42 } }, { crypto: { randomUUID: () => '' } },
    { crypto: { randomUUID: () => '-bad-start' } }, { crypto: { randomUUID: () => 'a'.repeat(129) } },
    { crypto: { randomUUID: 'nope' } },
    { crypto: { getRandomValues: () => { throw new Error('x'); } } },
    { crypto: { getRandomValues: () => {} } }, { crypto: { getRandomValues: 'nope' } },
    { crypto: { randomUUID: () => 42, getRandomValues: () => { throw new Error('x'); } } },
    null, undefined, 7, 'text',
  ];
  for (const env of cases) ok(newSessionId(env));
});

test('5b invalid randomUUID falls to getRandomValues', () => {
  assert.match(newSessionId({ crypto: { randomUUID: () => 'a'.repeat(129), getRandomValues: fill } }), /^[0-9a-f]{32}$/);
});

test('5c a hostile env object does not throw', () => {
  const env = new Proxy({}, { get() { throw new Error('hostile'); } });
  ok(newSessionId(env));
});

test('6 clock and random failure paths: valid, bounded, distinct, no throw', () => {
  const nows = [undefined, () => { throw new Error('x'); }, () => NaN, () => -5, () => 'soon', () => 1e300, () => Infinity, 'nope', null];
  const randoms = [undefined, () => { throw new Error('x'); }, () => NaN, () => 1, () => -0.5, () => 'r', () => 2, 'nope', null];
  const seen = new Set();
  for (const now of nows) for (const random of randoms) {
    const id = ok(newSessionId({ crypto: null, now, random }));
    assert.ok(!seen.has(id), 'repeated ' + id); seen.add(id);
  }
  // both failing at once, repeated: still distinct
  const bad = { crypto: null, now: () => { throw new Error('x'); }, random: () => { throw new Error('x'); } };
  assert.notEqual(ok(newSessionId(bad)), ok(newSessionId(bad)));
});

test('7 default sources produce valid distinct IDs', () => {
  const ids = new Set(Array.from({ length: 50 }, () => ok(newSessionId())));
  assert.equal(ids.size, 50);
});

test('8 seam: explicit failing source is used; absent property uses default', () => {
  // explicit throwing randomUUID is honoured (and handled), not replaced by the real one
  let called = 0;
  const id = newSessionId({ crypto: { randomUUID: () => { called++; throw new Error('x'); } } });
  assert.equal(called, 1); ok(id);
  // explicit now() is consulted
  let nowCalls = 0;
  newSessionId({ crypto: null, now: () => { nowCalls++; return 7; } });
  assert.equal(nowCalls, 1);
  // absent crypto key uses the real default (native randomUUID returns a UUID)
  if (typeof globalThis.crypto?.randomUUID === 'function') assert.match(newSessionId({}), /^[0-9a-f-]{36}$/);
  // explicit undefined behaves like absent
  if (typeof globalThis.crypto?.randomUUID === 'function') assert.match(newSessionId({ crypto: undefined }), /^[0-9a-f-]{36}$/);
});
