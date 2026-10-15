import { structuralEvidenceGuard } from './connectionEvidence.js';

/**
 * The one place the read-only lock on an opened trip is decided (build brief §3.1).
 *
 * Packet 1a locks a door2-v8 record for editing. The lock is keyed on the payload
 * schema the record was stored under — never on whether the trip carries identity.
 * Keying on identity presence would leave a v8 record whose identity map is missing
 * (D-B §5 row 3) editable, and that is the row that most needs locking, because a
 * missing `used` list lets a later client reissue a token that has already been retired.
 *
 * This module decides and reports. It never alters a trip to produce a lock: it does
 * not fake an unknown evidence version, does not corrupt the payload, and does not
 * invent an identity map in order to borrow a lock that belongs to something else.
 */

/** The guard shape the existing evidence guards already return, so call sites compose. */
const deny = (reason, message) => ({ ok: false, reason, message, proposals: [] });

/**
 * The lock descriptor for a load result, or null when the record carries no schema lock.
 *
 * Derived from the reader's result rather than from the trip, because the stored schema
 * and the identity classification live on the envelope's reader output. A v6 or v7
 * result carries none of these keys by design, so this returns null and the page keeps
 * exactly its existing policy for legacy records.
 *
 * @param {{compatible?: boolean, readOnly?: boolean, readOnlyReason?: string,
 *          readOnlyNotice?: string, storedSchema?: string, identity?: string}} [result]
 * @returns {{schema: string, identity: string | null, notice: string} | null}
 */
export function schemaLockFor(result) {
  if (!result || result.compatible !== true) return null;
  if (result.readOnly !== true || result.readOnlyReason !== 'schema') return null;
  return {
    schema: result.storedSchema ?? 'unknown',
    identity: result.identity ?? null,
    notice: result.readOnlyNotice ?? ''
  };
}

/**
 * The schema rule on its own. Used at the command entry points whose existing engine
 * guard is editEvidenceGuard rather than structuralEvidenceGuard, so that adding the
 * lock there does not also add the estimated-transport rule and change behaviour that
 * packet 1a is not authorised to touch.
 * @returns {{ok: false, reason: string, message: string, proposals: []} | null}
 */
export function schemaLockGuard(lock) {
  return lock ? deny('schema_read_only', lock.notice) : null;
}

/**
 * The evidence rule and the schema rule together, for the page's existing structural
 * gate.
 *
 * Evidence is reported first: a trip that is both evidence-read-only and schema-locked
 * keeps its existing evidence explanation, which travellers may already have seen. The
 * schema lock is additive — it is never cancelled by an evidence result, and when
 * evidence is clean it still refuses.
 * @returns {{ok: false, reason: string, message: string, proposals: []} | null}
 */
export function structuralOrSchemaGuard(trip, lock) {
  return structuralEvidenceGuard(trip) ?? schemaLockGuard(lock);
}
