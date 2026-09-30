// View helpers for the structure sheet. Pure, so tests can exercise the exact
// data the UI renders.

/**
 * Before/After columns for a proposal. Each column follows its own plan's stop
 * order, so a pure reorder (e.g. moving an optional) shows up as different
 * columns instead of two identical lists.
 * @param {{stops?: {key: string, placeId: string, nights: number}[]}|null|undefined} before
 * @param {{stops?: {key: string, placeId: string, nights: number}[]}|null|undefined} after
 * @returns {{before: {key: string, placeId: string, nights: number, changed: boolean}[], after: {key: string, placeId: string, nights: number, changed: boolean}[]}}
 */
export function proposalColumns(before, after) {
  const beforeStops = before?.stops ?? [];
  const afterStops = after?.stops ?? [];
  const beforeNights = new Map(beforeStops.map((s) => [s.key, s.nights]));
  const afterNights = new Map(afterStops.map((s) => [s.key, s.nights]));
  const column = (stops, other) =>
    stops
      .filter((s) => s.nights > 0 || (other.get(s.key) ?? 0) > 0)
      .map((s) => ({ key: s.key, placeId: s.placeId, nights: s.nights, changed: s.nights !== (other.get(s.key) ?? 0) }));
  return { before: column(beforeStops, afterNights), after: column(afterStops, beforeNights) };
}

const POSITION_LABELS = {
  after_lima_in: 'Right after arriving in Lima',
  after_machu_picchu: 'Near the end, before flying home'
};

/**
 * Picker label for an optional's position. Known positions get a description
 * that tells the two "after Lima" spots apart; anything else falls back.
 * @param {string} positionId
 * @param {string|null} afterName display name of the stop it follows
 */
export function positionLabel(positionId, afterName) {
  return POSITION_LABELS[positionId] ?? (afterName ? `After ${afterName}` : positionId);
}

/** Sheet state after the user taps an alternate position in the Move picker. */
export function pickMove(sheet, proposal) {
  return { ...sheet, stage: 'move_confirm', proposal };
}

/** Sheet state after "Keep my trip" on the Move confirm screen. */
export function backToMove(sheet) {
  return { ...sheet, stage: 'move', proposal: undefined };
}

// What a proposal does to the traveller's day trips. The engine only includes
// excursionsAdded / excursionsRemoved when they have something to say, so an
// absent (or empty) key renders nothing.
const DAY_TRIP_REMOVED_LINES = {
  traveller_removed: (name) => `Removes your day trip to ${name}.`,
  stop_removed: (name) => `Your day trip to ${name} goes with it.`,
  no_longer_offered: (name) => `Your day trip to ${name} is no longer available.`
};

/**
 * One line per day trip a proposal adds or removes.
 * @param {{excursionsAdded?: {placeId: string}[], excursionsRemoved?: {placeId?: string, excursionId: string, reason: string}[]}} diff
 * @param {(placeId: string) => string} nameOf display name for a place id
 * @returns {string[]}
 */
export function dayTripChangeLines(diff, nameOf) {
  const added = (diff?.excursionsAdded ?? []).map((e) => `Adds a day trip to ${nameOf(e.placeId)}.`);
  const removed = (diff?.excursionsRemoved ?? []).map((e) => {
    // An unknown reason still tells the traveller the day trip is going, never silently.
    const line = DAY_TRIP_REMOVED_LINES[e.reason] ?? DAY_TRIP_REMOVED_LINES.no_longer_offered;
    return line(nameOf(e.placeId ?? e.excursionId));
  });
  return [...added, ...removed];
}
