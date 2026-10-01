// F2: the Place rule (design F1-D16), as a checkable predicate.
//
// 1. An overnight base is always a Place.
// 2. Otherwise a location is promoted only if it is routed to and from in its
//    own right, owns content other routes would reuse, or participates
//    meaningfully in the connection graph.
// 3. Otherwise it is not a Place: it stays content on a base or an excursion.
//
// There is no automatic promotion of full-day day-trip sites. Filling a whole
// day is not an input here, and nothing else stands in for it: a candidate's
// other fields are ignored, and only the value `true` counts for the four
// flags below.

/** @typedef {import('./types.js').PlaceRuleCandidate} PlaceRuleCandidate */
/** @typedef {import('./types.js').PlaceRuleVerdict} PlaceRuleVerdict */

export const PROMOTION_CRITERIA = Object.freeze(['independentRouting', 'reusableShelf', 'graphParticipation']);

/**
 * @param {PlaceRuleCandidate} candidate
 * @returns {PlaceRuleVerdict}
 */
export function classifyLocation(candidate) {
  if (!candidate || typeof candidate.id !== 'string' || candidate.id === '') {
    throw new TypeError('classifyLocation: a candidate needs a string id');
  }
  const promotedBy = PROMOTION_CRITERIA.filter((c) => candidate[c] === true);
  const sleeps = candidate.sleepsThere === true;
  const criteriaMet = sleeps ? ['sleepsThere', ...promotedBy] : promotedBy;

  if (sleeps) return { candidateId: candidate.id, verdict: 'place', reason: 'overnight_base', criteriaMet };
  if (promotedBy.length > 0) return { candidateId: candidate.id, verdict: 'place', reason: 'promotion_criteria', criteriaMet };
  return { candidateId: candidate.id, verdict: 'not_place', reason: 'content_on_base_or_excursion', criteriaMet };
}
