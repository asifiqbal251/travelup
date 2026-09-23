/** @typedef {import('./types.js').BufferRuleset} BufferRuleset */
/** @typedef {import('./types.js').Connection} Connection */

// Three kinds of time, never merged:
//  - in-vehicle time (per segment)
//  - layover time (between segments)
//  - pre/post allowances (this ruleset, true origin/destination only)
// Buffer is combined with transport time ONLY here, at request time. It is
// never stored on a Connection row.

/** @type {BufferRuleset} */
export const DEFAULT_BUFFER_RULESET = {
  id: "buffer_ruleset_v2",
  modes: {
    flight_international: { preHours: 2.5, postHours: 1.0 },
    flight_domestic: { preHours: 1.5, postHours: 0.5 },
    train: { preHours: 0.5, postHours: 0.25 },
    road_private_transfer: { preHours: 0.1, postHours: 0.1 },
    coach_scheduled: { preHours: 0.25, postHours: 0.25 },
    local_shuttle: { preHours: 0.1, postHours: 0.1 },
    ferry: { preHours: 0.25, postHours: 0.25 }
  },
  localTransferDefault: { eachEndHours: 0.5 }
};
export const BUFFER_RULESET_VERSION = 2;

export function computeElapsedTravelHours(connection) {
  const segmentHours =
    connection.segments && connection.segments.length > 0
      ? connection.segments.reduce((sum, s) => sum + s.inVehicleHours, 0)
      : connection.inVehicleHours;
  return segmentHours + (connection.layoverHours ?? 0);
}

export function computeUsableTimeLost(connection, ruleset = DEFAULT_BUFFER_RULESET) {
  const modeRule = ruleset.modes[connection.mode];
  if (!modeRule) {
    throw new Error(`computeUsableTimeLost: no buffer rule for mode "${connection.mode}" in ruleset "${ruleset.id}"`);
  }
  const localOrigin = connection.localTransferHours?.origin ?? ruleset.localTransferDefault.eachEndHours;
  const localDestination = connection.localTransferHours?.destination ?? ruleset.localTransferDefault.eachEndHours;
  return computeElapsedTravelHours(connection) + modeRule.preHours + modeRule.postHours + localOrigin + localDestination;
}

/**
 * Returns the connection as seen travelling fromPlaceId -> toPlaceId.
 * For a bidirectional row used in reverse, it swaps from/to AND swaps
 * localTransferHours.origin/destination. Returns a new object and never
 * mutates the catalogue row. Returns null if the row doesn't serve this
 * direction.
 */
export function orientConnection(connection, fromPlaceId, toPlaceId) {
  if (connection.fromPlaceId === fromPlaceId && connection.toPlaceId === toPlaceId) {
    return {
      ...connection,
      ...(connection.localTransferHours ? { localTransferHours: { ...connection.localTransferHours } } : {})
    };
  }
  if (
    connection.direction === "bidirectional" &&
    connection.fromPlaceId === toPlaceId &&
    connection.toPlaceId === fromPlaceId
  ) {
    return {
      ...connection,
      fromPlaceId,
      toPlaceId,
      ...(connection.segments ? { segments: [...connection.segments].reverse() } : {}),
      ...(connection.localTransferHours
        ? {
            localTransferHours: {
              origin: connection.localTransferHours.destination,
              destination: connection.localTransferHours.origin
            }
          }
        : {})
    };
  }
  return null;
}
