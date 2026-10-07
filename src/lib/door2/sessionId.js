// Transient planning-session label for the F6 connection context.
//
// This is a LABEL, not a secret: it has no authentication role, is not Q8
// durable identity, and is never persisted by this module. The fallback tiers
// are deliberately non-cryptographic. Cross-device or cross-reload uniqueness
// is not required; only that it satisfies the pattern that
// preflightConnectionContext enforces, and that two calls in one page load
// never return the same fallback value.
//
// newSessionId never throws, for any input including a hostile `env`.

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

// Module-local, monotonically increasing. Only separates fallback IDs within
// one page load, even when the clock and random sources repeat, throw or
// return garbage.
let counter = 0;

function guarded(fn, fallback) {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

// An explicitly supplied property (even one that later fails) overrides the
// default; only an absent/undefined property uses the default.
function source(env, key, defaultValue) {
  const supplied = guarded(() => (env && typeof env === 'object' ? env[key] : undefined), undefined);
  return supplied === undefined ? guarded(defaultValue, undefined) : supplied;
}

function fromRandomUuid(crypto) {
  return guarded(() => {
    const fn = crypto.randomUUID;
    if (typeof fn !== 'function') return null;
    const value = fn.call(crypto);
    return typeof value === 'string' && ID_PATTERN.test(value) ? value : null;
  }, null);
}

function fromGetRandomValues(crypto) {
  return guarded(() => {
    const fn = crypto.getRandomValues;
    if (typeof fn !== 'function') return null;
    const bytes = new Uint8Array(16);
    fn.call(crypto, bytes);
    if (!bytes.some((b) => b !== 0)) return null; // unfilled
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    return ID_PATTERN.test(hex) ? hex : null;
  }, null);
}

function fromClockAndCounter(env) {
  const now = source(env, 'now', () => Date.now);
  const random = source(env, 'random', () => Math.random);
  const time = guarded(() => {
    const v = now();
    return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= Number.MAX_SAFE_INTEGER ? Math.floor(v) : 0;
  }, 0);
  const fragment = guarded(() => {
    const v = random();
    return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v < 1 ? Math.floor(v * 36 ** 8) : 0;
  }, 0);
  counter = counter >= Number.MAX_SAFE_INTEGER ? 1 : counter + 1;
  const id = `s${time.toString(36)}-${fragment.toString(36)}-${counter.toString(36)}`;
  // Always valid and bounded; the counter alone guarantees distinctness.
  return ID_PATTERN.test(id) ? id : `s${counter.toString(36)}`;
}

export function newSessionId(env = {}) {
  const crypto = source(env, 'crypto', () => globalThis.crypto);
  return fromRandomUuid(crypto) ?? fromGetRandomValues(crypto) ?? fromClockAndCounter(env);
}
