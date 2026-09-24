/** @typedef {import('./types.js').Trip} Trip */

// Stale-preview guard (design §0.1 B). A deterministic content hash of the
// parts of a Trip a structural preview depends on: spec, routePlan and days.
// `history` is excluded, so an undo that restores an earlier trip restores its
// fingerprint too. This detects staleness; it is not a security feature.
//
// FNV-1a (64-bit arithmetic, truncated to 53 bits) over the UTF-8 bytes of a
// canonical JSON (object keys sorted recursively; undefined dropped as in JSON).

const FNV_OFFSET = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const MASK_64 = (1n << 64n) - 1n;
const MASK_53 = (1n << 53n) - 1n;

/** JSON with object keys sorted at every level. */
export function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((v) => (v === undefined || typeof v === 'function' ? 'null' : canonicalJson(v))).join(',')}]`;
  }
  const keys = Object.keys(value)
    .filter((k) => value[k] !== undefined && typeof value[k] !== 'function')
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(',')}}`;
}

/** FNV-1a over a string's UTF-8 bytes; 53-bit result as lowercase hex. */
export function fnv1a53(text) {
  const bytes = new TextEncoder().encode(text);
  let hash = FNV_OFFSET;
  for (const b of bytes) {
    hash ^= BigInt(b);
    hash = (hash * FNV_PRIME) & MASK_64;
  }
  return (hash & MASK_53).toString(16);
}

/**
 * @param {Trip} trip
 * @returns {string}
 */
export function tripFingerprint(trip) {
  return fnv1a53(canonicalJson({ spec: trip.spec, routePlan: trip.routePlan ?? null, days: trip.days }));
}
