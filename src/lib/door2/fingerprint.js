/** @typedef {import('./types.js').Trip} Trip */

// Stale-preview guard (design §0.1 B). A deterministic content hash of the
// parts of a Trip a structural preview depends on: spec, routePlan and days.
// `history` is excluded, so an undo that restores an earlier trip restores its
// fingerprint too. This detects staleness; it is not a security feature.
//
// Q8 packet 1b adds ONE optional trailing parameter. Every existing input stays with its
// current behaviour, `history` is still excluded, and `evidence` is still included only
// when present. A ONE-ARGUMENT CALL IS BYTE-IDENTICAL TO BEFORE FOR EVERY INPUT,
// identity-bearing ones included: the `identity` key is absent from the canonical object
// unless the caller opts in AND the trip actually carries a map — the same conditional
// treatment `evidence` already receives. Adding `identity: null` unconditionally would
// change every hash, and `identity: undefined` would be inert because `canonicalJson`
// drops it, so the key's ABSENCE is the contract.
//
// `used` is deliberately excluded from the digest (D-A §6.4). Non-reuse rests on phase 2
// minting against the working registry as it stands at commit, not on this guard;
// including `used` would invalidate every open preview whenever any unrelated apply
// occurred, with no safety gained.
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
 * A digest of the whole `trip.identity` object EXCEPT `used`. Every other field
 * participates: `version`, every field of every `blocks` entry, and `edits`. So an
 * identity-only change — a dismissal, a state change, an address written on a match —
 * invalidates an open preview, which the existing guard cannot detect.
 * @param {Object} identity
 * @returns {string}
 */
export function identityDigest(identity) {
  if (identity === null || typeof identity !== 'object') return fnv1a53(canonicalJson(identity ?? null));
  const withoutUsed = {};
  for (const key of Object.keys(identity)) {
    if (key !== 'used') withoutUsed[key] = identity[key];
  }
  return fnv1a53(canonicalJson(withoutUsed));
}

/**
 * @param {Trip} trip
 * @param {null|true|Object} [identity]  Q8 packet 1b's opt-in. `null` is exactly the
 *   behaviour this function had before that packet; no production call site passes one.
 * @returns {string}
 */
export function tripFingerprint(trip, identity = null) {
  return fnv1a53(canonicalJson({ spec: trip.spec, routePlan: trip.routePlan ?? null, days: trip.days, ...(trip.evidence !== undefined ? { evidence: trip.evidence } : {}), ...(trip.versions?.connectionEvidence !== undefined ? { connectionEvidence: trip.versions.connectionEvidence } : {}), ...(identity != null && identity !== false && trip.identity !== undefined ? { identity: identityDigest(trip.identity) } : {}) }));
}
