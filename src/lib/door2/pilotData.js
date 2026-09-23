/** @typedef {import('./types.js').Place} Place */
/** @typedef {import('./types.js').Connection} Connection */
/** @typedef {import('./types.js').RoutePackage} RoutePackage */
/** @typedef {import('./types.js').RoutePackageStop} RoutePackageStop */

// Pilot catalogue v2: DRAFT DATA.
//
// Every connection is unreviewed (reviewedBy/reviewedAt null). The engine
// treats these as drafts: the default 'strict' review policy refuses them, and
// only the hidden dev harness runs with 'allow_drafts'. Every row must be
// upgraded to primary sources and marked reviewed before any real traveller
// sees this engine.
//
// Data note: with its own localTransferHours, Vancouver->Lima's usable time
// lost is 17.45h: 12.7 elapsed (4.6 + 6.6 in-vehicle + 1.5 layover) + 2.5 +
// 1.0 + 0.5 + 0.75. The scheduler brief said 15.75h (11.0 elapsed), and the
// docs said 15.5h (default 0.5/0.5 transfers). Neither matches this row's own
// segments. Decision 2026-09-22: the row stands and the brief's Peru
// expectations were re-derived for 17.45h. Re-check against the catalogue in
// the data-review task.
//
// Catalogue metadata note: the pilot catalogue v2 source document is not in
// this repo. The numeric fields below come from the Door 2 scheduler brief;
// `sources`, `assumptions` and `gatewayRequirements` are left empty until they
// are copied from the catalogue. The engine never reads them.

export const PILOT_DATA_VERSION = 'pilot-catalogue-v2';

/** @param {string} id @param {string} name @param {string} countryId @param {number} lat @param {number} lng @param {number} utcOffsetHours @param {'base'|'gateway'|'attraction'} [visitKind] @returns {Place} */
function place(id, name, countryId, lat, lng, utcOffsetHours, visitKind = 'base') {
  return { id, name, aliases: [], countryId, coordinates: { lat, lng }, visitKind, utcOffsetHours };
}

/** @type {Object<string, Place>} */
export const PILOT_PLACES = Object.freeze({
  vancouver: place('vancouver', 'Vancouver', 'CA', 49.28, -123.12, -7),
  new_york: place('new_york', 'New York', 'US', 40.71, -74.01, -4),
  lima: place('lima', 'Lima', 'PE', -12.05, -77.04, -5),
  cusco: place('cusco', 'Cusco', 'PE', -13.53, -71.97, -5),
  ollantaytambo: place('ollantaytambo', 'Ollantaytambo', 'PE', -13.26, -72.26, -5),
  aguas_calientes: place('aguas_calientes', 'Aguas Calientes', 'PE', -13.15, -72.52, -5),
  machu_picchu: place('machu_picchu', 'Machu Picchu', 'PE', -13.16, -72.55, -5, 'attraction'),
  huaraz: place('huaraz', 'Huaraz', 'PE', -9.53, -77.53, -5),
  tokyo: place('tokyo', 'Tokyo', 'JP', 35.68, 139.69, 9),
  // No package covers Ljubljana: uncovered-destination fixture.
  ljubljana: place('ljubljana', 'Ljubljana', 'SI', 46.05, 14.51, 2)
});

const DRAFT_ROW = Object.freeze({
  direction: 'bidirectional',
  gatewayRequirements: [],
  assumptions: [],
  sources: [],
  reviewedBy: null,
  reviewedAt: null,
  version: 2
});

/** @type {Connection[]} */
export const PILOT_CONNECTIONS = [
  {
    ...DRAFT_ROW,
    id: 'conn_yvr_nyc_air',
    fromPlaceId: 'vancouver',
    toPlaceId: 'new_york',
    mode: 'flight_international',
    inVehicleHours: 5.4,
    localTransferHours: { origin: 0.5, destination: 0.85 },
    processingProfile: 'US_preclearance'
  },
  {
    ...DRAFT_ROW,
    id: 'conn_yvr_lim_air',
    fromPlaceId: 'vancouver',
    toPlaceId: 'lima',
    mode: 'flight_international',
    inVehicleHours: 11.2,
    segments: [
      { mode: 'flight_international', inVehicleHours: 4.6 },
      { mode: 'flight_international', inVehicleHours: 6.6 }
    ],
    layoverHours: 1.5,
    typicalRangeHours: { min: 10.9, max: 13.5 },
    localTransferHours: { origin: 0.5, destination: 0.75 }
  },
  {
    ...DRAFT_ROW,
    id: 'conn_yvr_tokyo_air_nrt',
    fromPlaceId: 'vancouver',
    toPlaceId: 'tokyo',
    mode: 'flight_international',
    inVehicleHours: 10.1,
    typicalRangeHours: { min: 9.8, max: 10.5 },
    gatewayId: 'NRT',
    localTransferHours: { origin: 0.5, destination: 1.25 }
  },
  {
    ...DRAFT_ROW,
    id: 'conn_lim_cuz_air',
    fromPlaceId: 'lima',
    toPlaceId: 'cusco',
    mode: 'flight_domestic',
    inVehicleHours: 1.25,
    typicalRangeHours: { min: 1.25, max: 1.5 },
    localTransferHours: { origin: 1.0, destination: 0.75 }
  },
  {
    ...DRAFT_ROW,
    id: 'conn_cuz_olly_road',
    fromPlaceId: 'cusco',
    toPlaceId: 'ollantaytambo',
    mode: 'road_private_transfer',
    inVehicleHours: 1.5,
    typicalRangeHours: { min: 1.5, max: 2.5 },
    localTransferHours: { origin: 0.25, destination: 0.1 }
  },
  {
    ...DRAFT_ROW,
    id: 'conn_olly_agc_train',
    fromPlaceId: 'ollantaytambo',
    toPlaceId: 'aguas_calientes',
    mode: 'train',
    inVehicleHours: 1.75,
    typicalRangeHours: { min: 1.75, max: 2.0 },
    localTransferHours: { origin: 0.25, destination: 0.1 }
  },
  {
    ...DRAFT_ROW,
    id: 'conn_agc_mp_shuttle',
    fromPlaceId: 'aguas_calientes',
    toPlaceId: 'machu_picchu',
    mode: 'local_shuttle',
    inVehicleHours: 0.45,
    typicalRangeHours: { min: 0.4, max: 0.5 },
    localTransferHours: { origin: 0.1, destination: 0.1 }
  },
  {
    ...DRAFT_ROW,
    id: 'conn_lim_huz_coach',
    fromPlaceId: 'lima',
    toPlaceId: 'huaraz',
    mode: 'coach_scheduled',
    inVehicleHours: 8.0,
    typicalRangeHours: { min: 7.5, max: 8.5 },
    localTransferHours: { origin: 0.25, destination: 0.1 }
  }
];

/** @returns {RoutePackageStop} */
function stop(id, placeId, minNights, maxNights, excursions = []) {
  return { id, placeId, minNights, maxNights, excursions };
}

const MACHU_PICCHU_EXCURSION = Object.freeze({
  placeId: 'machu_picchu',
  connectionId: 'conn_agc_mp_shuttle',
  hoursOnSite: 4
});

const CUSCO_ACCLIMATISATION =
  'Cusco minimum is 2 nights for altitude acclimatisation (3,400 m) before the Sacred Valley and Machu Picchu.';

/**
 * Derives placeIds and visitRules from the stops.
 * @param {Omit<RoutePackage, 'placeIds'|'visitRules'|'reviewed'>} pkg
 * @returns {RoutePackage}
 */
function routePackage(pkg) {
  const placeIds = [];
  for (const s of pkg.stops) {
    if (!placeIds.includes(s.placeId)) placeIds.push(s.placeId);
    for (const ex of s.excursions) {
      if (!placeIds.includes(ex.placeId)) placeIds.push(ex.placeId);
    }
  }
  return {
    ...pkg,
    placeIds,
    visitRules: {
      minNights: pkg.stops.reduce((sum, s) => sum + s.minNights, 0),
      maxNights: pkg.stops.reduce((sum, s) => sum + s.maxNights, 0),
      extensions: []
    },
    reviewed: false
  };
}

/** @type {RoutePackage[]} */
export const PILOT_ROUTE_PACKAGES = [
  routePackage({
    id: 'nyc_city',
    name: 'New York City',
    countryId: 'US',
    stops: [stop('nyc_base', 'new_york', 2, 10)]
  }),
  routePackage({
    id: 'tokyo_city',
    name: 'Tokyo',
    countryId: 'JP',
    preferredGatewayId: 'NRT',
    stops: [stop('tokyo_base', 'tokyo', 3, 10)]
  }),
  routePackage({
    id: 'peru_classic',
    name: 'Peru classic: Lima, Cusco, Sacred Valley, Machu Picchu',
    countryId: 'PE',
    assumptions: [CUSCO_ACCLIMATISATION],
    stops: [
      stop('pc_lima_in', 'lima', 1, 3),
      stop('pc_cusco', 'cusco', 2, 4),
      stop('pc_sacred_valley', 'ollantaytambo', 0, 1),
      stop('pc_aguas', 'aguas_calientes', 1, 2, [MACHU_PICCHU_EXCURSION]),
      stop('pc_olly_return', 'ollantaytambo', 0, 0),
      stop('pc_cusco_return', 'cusco', 0, 0),
      stop('pc_lima_out', 'lima', 1, 1)
    ]
  }),
  routePackage({
    id: 'peru_classic_huaraz',
    name: 'Peru classic with Huaraz',
    countryId: 'PE',
    assumptions: [
      CUSCO_ACCLIMATISATION,
      'Huaraz to Cusco backtracks through the Lima hub: there is deliberately no direct Huaraz-Cusco connection.'
    ],
    stops: [
      stop('ph_lima_in', 'lima', 1, 2),
      stop('ph_huaraz', 'huaraz', 2, 4),
      // Hub backtrack: Huaraz -> Lima -> Cusco.
      stop('ph_lima_mid', 'lima', 1, 1),
      stop('ph_cusco', 'cusco', 2, 4),
      stop('ph_sacred_valley', 'ollantaytambo', 0, 1),
      stop('ph_aguas', 'aguas_calientes', 1, 2, [MACHU_PICCHU_EXCURSION]),
      stop('ph_olly_return', 'ollantaytambo', 0, 0),
      stop('ph_cusco_return', 'cusco', 0, 0),
      stop('ph_lima_out', 'lima', 1, 1)
    ]
  })
];
