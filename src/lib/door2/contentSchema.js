// F2: the ContentItem v2 validator (design F1 Q1, F1-D1, F1-D23).
//
// Pure and ADVISORY. Tests and contentCoverage.js call it; fill.js and every
// build path do not, and wiring it in is a later decision with its own
// evidence. It never throws on bad content and never changes an item: it
// reports, with one error code per rule.

/** @typedef {import('./types.js').ContentItem} ContentItem */

export const SLOT_CLASSES = Object.freeze(['full', 'half', 'evening', 'short']);
export const CONTENT_STATUSES = Object.freeze(['approved', 'pending_review']);

const FULL_PARTS = ['morning', 'afternoon', 'evening'];

/** Accepts an array or Set of ids, or a map keyed by id (PILOT_PLACES). */
export function toIdSet(placeIds) {
  if (placeIds instanceof Set) return placeIds;
  if (Array.isArray(placeIds)) return new Set(placeIds);
  if (placeIds && typeof placeIds === 'object') return new Set(Object.keys(placeIds));
  throw new TypeError('placeIds must be an array, a Set or an object keyed by place id');
}

const err = (code, itemId, message) => ({ code, itemId: itemId ?? null, message });

/**
 * The rules that need only the one item.
 * @param {ContentItem} item
 * @param {{placeIds: string[]|Set<string>|Object}} options
 * @returns {{ok: boolean, errors: Array<{code: string, itemId: string|null, message: string}>}}
 */
export function validateContentItem(item, { placeIds }) {
  const places = toIdSet(placeIds);
  const id = item?.id;
  const errors = [];

  if (!places.has(item.placeId)) errors.push(err('unknown_place', id, `placeId "${item.placeId}" is not a known place`));

  if (!Array.isArray(item.slots) || item.slots.length === 0) {
    errors.push(err('empty_slots', id, 'slots is missing or empty'));
  } else {
    for (const slot of item.slots) {
      if (!SLOT_CLASSES.includes(slot)) errors.push(err('bad_slot', id, `slot "${slot}" is not one of ${SLOT_CLASSES.join(', ')}`));
    }
    if (item.slots.includes('full')) {
      const missing = FULL_PARTS.filter((part) => typeof item[part] !== 'string' || item[part].trim() === '');
      if (missing.length > 0) errors.push(err('full_missing_parts', id, `a 'full' item needs ${missing.join(', ')}`));
    }
  }

  if (item.signature !== undefined && !item.review?.sourceUrl) {
    errors.push(err('signature_unsourced', id, 'signature needs review.sourceUrl (F1-D1)'));
  }

  if (!CONTENT_STATUSES.includes(item.status)) errors.push(err('bad_status', id, `status "${item.status}" is not one of ${CONTENT_STATUSES.join(', ')}`));

  if (item.visitsPlaceId !== undefined && !places.has(item.visitsPlaceId)) {
    errors.push(err('unknown_visits_place', id, `visitsPlaceId "${item.visitsPlaceId}" is not a known place`));
  }

  // F2.1: an extracted item that cannot be keyed for F1-D23 is an error, not an exemption from the fragment check.
  const p = item.provenance;
  if (p?.kind === 'extracted' && (p.sourceBundleId === undefined || p.sourceTemplateTitle === undefined)) {
    errors.push(err('provenance_incomplete', id, 'an extracted item needs sourceBundleId and sourceTemplateTitle (F1-D23)'));
  }

  return { ok: errors.length === 0, errors };
}

/**
 * Every per-item rule, plus the two that need the whole catalogue: unique ids, and F1-D23's rule that a
 * (sourceBundleId, sourceTemplateTitle, sourceFragmentId) triple is used by at most one item. sourceTemplateIndex is
 * corroboration, not part of the key. Authored items have no source template and are exempt from the second; every
 * extracted item is checked, and one that cannot be keyed is `provenance_incomplete` rather than silently exempt.
 * The triple is migration provenance and de-duplication only: a template title is editable source text, never an id.
 * `warnings` is part of the contract; F2 defines no warning rules.
 * @param {ContentItem[]} items
 * @param {{placeIds: string[]|Set<string>|Object}} options
 */
export function validateContentCatalogue(items, { placeIds }) {
  const places = toIdSet(placeIds);
  const errors = [];
  const warnings = [];
  const seenIds = new Set();
  const seenFragments = new Map();

  for (const item of items) {
    errors.push(...validateContentItem(item, { placeIds: places }).errors);

    if (seenIds.has(item.id)) errors.push(err('duplicate_id', item.id, `id "${item.id}" is used more than once`));
    seenIds.add(item.id);

    const p = item.provenance;
    if (p?.sourceBundleId !== undefined && p?.sourceTemplateTitle !== undefined) {
      const key = JSON.stringify([p.sourceBundleId, p.sourceTemplateTitle, p.sourceFragmentId]);
      const first = seenFragments.get(key);
      if (first !== undefined) {
        errors.push(err('fragment_reused', item.id, `bundle "${p.sourceBundleId}" template "${p.sourceTemplateTitle}" fragment "${p.sourceFragmentId}" is already used by "${first}" (F1-D23)`));
      } else {
        seenFragments.set(key, item.id);
      }
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}
