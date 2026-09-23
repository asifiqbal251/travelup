/** @typedef {import('./types.js').Connection} Connection */
/** @typedef {import('./types.js').Place} Place */

// Data-integrity guards. These THROW: a violation is a catalogue bug, never a
// traveller outcome. Neither function ever returns false.

function hasPlace(placesById, id) {
  if (placesById instanceof Map) return placesById.has(id);
  return Object.prototype.hasOwnProperty.call(placesById, id);
}

/**
 * @param {Connection} connection
 * @param {Map<string, Place>|Object<string, Place>} placesById
 */
export function assertConnectionPlacesResolve(connection, placesById) {
  if (!hasPlace(placesById, connection.fromPlaceId)) {
    throw new Error(`Connection "${connection.id}" references unknown fromPlaceId "${connection.fromPlaceId}"`);
  }
  if (!hasPlace(placesById, connection.toPlaceId)) {
    throw new Error(`Connection "${connection.id}" references unknown toPlaceId "${connection.toPlaceId}"`);
  }
}

/** @param {Place} place */
export function assertPlaceCanBeOvernightBase(place) {
  if (place.visitKind === "attraction") {
    throw new Error(`Place "${place.id}" is an attraction and cannot be an overnight base`);
  }
}
