/** @typedef {import('./types.js').FailureResult} FailureResult */
/** @typedef {import('./types.js').FailureOption} FailureOption */

export const FAILURE_STATES = Object.freeze({
  DESTINATION_NOT_COVERED: 'destination_not_covered',
  ROUTE_NOT_SUPPORTED: 'route_not_supported',
  DURATION_TOO_SHORT: 'duration_too_short',
  REQUIRED_PLACE_CONFLICT: 'required_place_conflict',
  CONNECTION_UNREVIEWED: 'connection_unreviewed',
  CONTENT_INSUFFICIENT: 'content_insufficient'
});

const KNOWN_STATES = new Set(Object.values(FAILURE_STATES));

export const DEFAULT_MESSAGES = Object.freeze({
  destination_not_covered: "We don't have trips to this destination yet.",
  route_not_supported: "We can't build a route that works for this combination yet.",
  duration_too_short: "This trip needs more days than you've chosen.",
  required_place_conflict: "All the places you asked for don't fit into the days you've chosen.",
  connection_unreviewed: "We haven't verified the transport for part of this route yet.",
  content_insufficient: "We don't have enough to fill these days well yet."
});

/**
 * Every failure offers at least one concrete way forward.
 * @param {string} state
 * @param {FailureOption[]} options
 * @param {{message?: string, detail?: any}} [extra]
 * @returns {FailureResult}
 */
export function makeFailure(state, options, { message, detail } = {}) {
  if (!KNOWN_STATES.has(state)) {
    throw new Error(`makeFailure: unknown failure state "${state}"`);
  }
  if (!Array.isArray(options) || options.length === 0) {
    throw new Error(`makeFailure: failure "${state}" must offer at least one option`);
  }
  return {
    ok: false,
    state,
    message: message ?? DEFAULT_MESSAGES[state],
    options,
    detail: detail ?? null
  };
}

export function makeSuccess(value) {
  return { ok: true, value };
}
