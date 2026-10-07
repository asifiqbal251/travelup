import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { loadDoor2PlanModule, mountDoor2Plan, teardown } from './helpers/domHarness.js';
// Actual shipped Door2Plan page, driven through the existing f6Control seam.
// The seam only records calls; it supplies no context, so the session ID
// recorded is the one the page itself allocated.
const control = { calls: [] };
const M = await loadDoor2PlanModule({ f6Control: control });
after(teardown);
const { screen } = await import('@testing-library/react');
const userEvent = (await import('@testing-library/user-event')).default;
const PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const REFUSAL = /required planning information is missing or invalid/;
const nativeDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
const nativeCrypto = globalThis.crypto;

async function withCrypto(value, fn) {
  Object.defineProperty(globalThis, 'crypto', { value, configurable: true, writable: true });
  try { return await fn(); } finally {
    if (nativeDescriptor) Object.defineProperty(globalThis, 'crypto', nativeDescriptor); else delete globalThis.crypto;
  }
}
const tiers = {
  'getRandomValues only': { getRandomValues: (a) => nativeCrypto.getRandomValues(a) },
  'no crypto API at all': undefined,
};

async function setDays(user, n) {
  let current = Number(screen.getByText(/^\d+ days$/).textContent.match(/\d+/)[0]);
  while (current < n) { await user.click(screen.getByRole('button', { name: '+' })); current++; }
  while (current > n) { await user.click(screen.getByRole('button', { name: '−' })); current--; }
}
async function start() {
  control.calls = [];
  await mountDoor2Plan(M);
  const user = userEvent.setup();
  await user.click(await screen.findByText('Japan'));
  await setDays(user, 5);
  await user.click(screen.getByRole('button', { name: 'Build my trip' }));
  return user;
}
const lastId = () => control.calls.at(-1).context.sequenceId;

for (const [label, crypto] of Object.entries(tiers)) {
  test(`R1 ${label}: Japan builds, no refusal, valid session ID`, async () => {
    await withCrypto(crypto, async () => {
      await start();
      assert.ok(await screen.findByText('Your trip at a glance'));
      assert.equal(screen.queryByText(REFUSAL), null);
      assert.match(lastId(), PATTERN);
    });
  });

  test(`R1 ${label}: refine keeps the ID; a fresh start allocates a new one`, async () => {
    await withCrypto(crypto, async () => {
      const user = await start();
      await screen.findByText('Your trip at a glance');
      const first = lastId(); assert.match(first, PATTERN);
      await user.click(screen.getByRole('button', { name: 'Refine' }));
      await user.click(screen.getByRole('button', { name: 'Apply and rebuild' }));
      assert.equal(screen.queryByText(REFUSAL), null);
      assert.equal(lastId(), first);
      // Live Japan data carries no estimated evidence, so Start over needs no confirmation
      // (the cancel path exists only for evidence trips; see flowF6Connections ID4).
      await user.click(screen.getByRole('button', { name: 'Start a new trip' }));
      await user.click(await screen.findByText('Japan')); await setDays(user, 5);
      await user.click(screen.getByRole('button', { name: 'Build my trip' }));
      assert.ok(await screen.findByText('Your trip at a glance'));
      assert.match(lastId(), PATTERN);
      assert.notEqual(lastId(), first);
    });
  });
}

test('R1 native randomUUID path unchanged: the page records a UUID', async () => {
  await start();
  assert.ok(await screen.findByText('Your trip at a glance'));
  assert.match(lastId(), /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
});
