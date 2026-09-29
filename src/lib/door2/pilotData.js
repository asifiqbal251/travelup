/** @typedef {import('./types.js').Place} Place */
/** @typedef {import('./types.js').Connection} Connection */
/** @typedef {import('./types.js').RoutePackage} RoutePackage */
/** @typedef {import('./types.js').RoutePackageStop} RoutePackageStop */

import { compileFamilies } from './families.js';

// Pilot catalogue v2.
//
// Connection review status lives on each Connection row (reviewedBy/reviewedAt), not here.
// As of 2026-09-23 all 8 Peru connections have been reviewed against live sources —
// see build-brief-connection-catalogue-review-2026-09-23.md. New rows (e.g. a future
// Eastern Canada family) start unreviewed until checked; don't assume this whole file is reviewed.
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
  ljubljana: place('ljubljana', 'Ljubljana', 'SI', 46.05, 14.51, 2),
  // Eastern Canada (C1, Phase C Route Family #2). All of Ontario and Québec
  // are UTC-4 in the summer half-year, the convention the rows above use
  // (Vancouver is -7, New York -4).
  toronto:       place('toronto',       'Toronto',       'CA', 43.65, -79.38, -4),
  ottawa:        place('ottawa',        'Ottawa',        'CA', 45.42, -75.70, -4),
  montreal:      place('montreal',      'Montréal',      'CA', 45.50, -73.57, -4),
  quebec_city:   place('quebec_city',   'Québec City',   'CA', 46.81, -71.21, -4),
  niagara_falls: place('niagara_falls', 'Niagara Falls', 'CA', 43.09, -79.08, -4)
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
    processingProfile: 'US_preclearance',
    reviewedBy: "Claude (chat, 23 Sep 2026 — confirmed: 5h03m–5h23m nonstop range matches; Air Canada + United on EWR, JetBlue on JFK)",
    reviewedAt: "2026-09-23",
    version: 3
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
    layoverHours: 2.0,
    typicalRangeHours: { min: 10.9, max: 13.5 },
    localTransferHours: { origin: 0.5, destination: 0.75 },
    assumptions: [
      "layoverHours (2.0h) is a conservative estimate — FlightRoutes.com cites the United via-Houston routing as ~14h total wall-clock, implying a layover of roughly 2.0–2.2h once segment times are subtracted. The IMPORTANT DISCREPANCY flagged in v2 still stands and is unresolved — a real date-specific booked itinerary is the correct fix before this row is marked reviewed with higher confidence."
    ],
    sources: [
      "https://www.flightroutes.com/YVR-LIM (United via Houston total ~14h, implying ~2.0h layover at IAH)"
    ],
    reviewedBy: "Claude (chat, 23 Sep 2026 live-research pass — layoverHours conservative estimate only; DISCREPANCY flag unresolved)",
    reviewedAt: "2026-09-23",
    version: 3
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
    localTransferHours: { origin: 0.5, destination: 1.25 },
    assumptions: [
      "ANA does NOT operate its own metal on this route as of September 2026 — it codeshares on Air Canada (AC3). Correct framing: Air Canada (own metal); JAL (own metal); ZIPAIR (own metal); ANA (codeshare on AC). No change to flight times."
    ],
    sources: [
      "https://www.directflights.com/YVR-NRT (flight time 9h45m–10h20m, updated Sep 21 2026; Air Canada, JAL, Zipair confirmed nonstop operators)",
      "https://www.flightconnections.com/flights-from-yvr-to-nrt (18 flights/week as of Sep 2026, 9h45m average)",
      "https://info.flightmapper.net/route/ANA_NH_YVR_NRT (ANA codeshares on AC3, not own-metal)"
    ],
    reviewedBy: "Claude (chat, 23 Sep 2026 live-research pass)",
    reviewedAt: "2026-09-23",
    version: 3
  },
  {
    ...DRAFT_ROW,
    id: 'conn_lim_cuz_air',
    fromPlaceId: 'lima',
    toPlaceId: 'cusco',
    mode: 'flight_domestic',
    inVehicleHours: 1.25,
    typicalRangeHours: { min: 1.25, max: 1.5 },
    localTransferHours: { origin: 1.0, destination: 0.75 },
    assumptions: [
      "IMPORTANT — Lima new terminal (June 2026): Lima Jorge Chavez Airport completed a full terminal migration in June 2026. The existing localTransferHours.origin (1.0h) is correct for domestic-to-domestic scenarios only. For any traveller connecting from an INTERNATIONAL flight into Lima then domestic to Cusco, the required minimum transfer time is now 3.0h (4.0h comfortable in peak season). The scheduler must not use the 1.0h figure for international-connection itineraries routing through Lima. Future schema fix needed: localTransferHours.origin_international_connection."
    ],
    sources: [
      "https://www.theonlyperuguide.com/research/lima-to-cusco-by-plane-airlines-typical-prices-best-flight-times-and-delay-tips/ (1h15–1h30 in-air; new terminal June 2026; 3h minimum for international connections)",
      "https://www.flightconnections.com/flights-from-lim-to-cuz (1h20m average, 149 flights/week as of Aug 2026)"
    ],
    reviewedBy: "Claude (chat, 23 Sep 2026 live-research pass)",
    reviewedAt: "2026-09-23",
    version: 3
  },
  {
    ...DRAFT_ROW,
    id: 'conn_cuz_olly_road',
    fromPlaceId: 'cusco',
    toPlaceId: 'ollantaytambo',
    mode: 'road_private_transfer',
    inVehicleHours: 1.5,
    typicalRangeHours: { min: 1.5, max: 2.5 },
    localTransferHours: { origin: 0.25, destination: 0.1 },
    reviewedBy: "Claude (chat, 23 Sep 2026 — confirmed: 1.5–2.5h private transfer range consistent with all sources)",
    reviewedAt: "2026-09-23",
    version: 3
  },
  {
    ...DRAFT_ROW,
    id: 'conn_olly_agc_train',
    fromPlaceId: 'ollantaytambo',
    toPlaceId: 'aguas_calientes',
    mode: 'train',
    inVehicleHours: 1.5,
    typicalRangeHours: { min: 1.5, max: 1.75 },
    localTransferHours: { origin: 0.25, destination: 0.1 },
    assumptions: [
      "inVehicleHours corrected to 1.5h: Rome2Rio and multiple 2026 guides cite 1h30m as the standard journey time. 1.5h is the better deterministic value; 1.75h is now the range max. Safety note: December 30 2025 PeruRail/Inca Rail collision near Ollantaytambo killed 1, injured 40; service has since resumed."
    ],
    sources: [
      "https://www.perurail.com/ (official: approximately 1 hour and 45 minutes from Ollantaytambo)",
      "https://www.rome2rio.com/Train/Ollantaytambo/Aguas-Calientes (PeruRail hourly; 1h30m average, fastest 1h21m)",
      "https://inkatimetours.com/train-from-ollantaytambo-to-aguas-calientes/ (2026 guide: ~1.5h for most direct services)",
      "https://en.wikipedia.org/wiki/2025_Ollantaytambo_District_train_collision (Dec 30 2025 collision, service resumed)"
    ],
    reviewedBy: "Claude (chat, 23 Sep 2026 live-research pass)",
    reviewedAt: "2026-09-23",
    version: 3
  },
  {
    ...DRAFT_ROW,
    id: 'conn_agc_mp_shuttle',
    fromPlaceId: 'aguas_calientes',
    toPlaceId: 'machu_picchu',
    mode: 'local_shuttle',
    inVehicleHours: 0.45,
    typicalRangeHours: { min: 0.4, max: 0.5 },
    localTransferHours: { origin: 0.1, destination: 0.1 },
    assumptions: [
      "OPERATOR UPDATE (Feb 2026): A second operator (San Antonio de Torontoy) was authorised alongside Consettur on a temporary basis while a new concession process is defined. Any copy referring to Consettur as the exclusive/sole operator is now inaccurate. Scheduling impact is neutral — same road, same times."
    ],
    sources: [
      "https://www.inkayniperutours.com/blog/bus-to-machu-picchu (25–30 min; Feb 2026 dual-operator status documented)",
      "https://www.yapaexplorers.com/travel-guides/aguas-calientes-to-machu-picchu-bus-times-lines-tickets-and-what-to-expect/ (20–25 min; 2026 detail)",
      "https://www.peruviancuscotraveltour.com/buses-machupicchu-complete-guide-2026/ (20–30 min; 2026 detail)"
    ],
    reviewedBy: "Claude (chat, 23 Sep 2026 live-research pass)",
    reviewedAt: "2026-09-23",
    version: 3
  },
  {
    ...DRAFT_ROW,
    id: 'conn_lim_huz_coach',
    fromPlaceId: 'lima',
    toPlaceId: 'huaraz',
    mode: 'coach_scheduled',
    inVehicleHours: 8.5,
    typicalRangeHours: { min: 8.0, max: 9.5 },
    localTransferHours: { origin: 0.25, destination: 0.1 },
    assumptions: [
      "inVehicleHours corrected to 8.5h: Cruz del Sur's actual Sep 2026 schedule shows 8h30m for the Lima→Huaraz overnight service. Range updated to {8.0, 9.5} per Busbud data for multiple operators."
    ],
    sources: [
      "https://www.checkmybus.com/coach-providers/cruz-del-sur (Cruz del Sur Lima→Huaraz Sep 2026: 8h30m, 9:45PM departure)",
      "https://www.busbud.com/en/bus-lima-huaraz/r/6mc5rp-6q2cgc (multiple operators; Cruz del Sur 8h30m; range 8–9.5h)"
    ],
    reviewedBy: "Claude (chat, 23 Sep 2026 live-research pass)",
    reviewedAt: "2026-09-23",
    version: 3
  },

  // C1 — Eastern Canada connection catalogue (Phase C, Route Family #2).
  // Researched and reviewed 28 September 2026. Every row is bidirectional, so
  // one row serves both trip directions. All seven legs run year-round (C1-F1).
  {
    ...DRAFT_ROW,
    id: 'conn_yvr_yyz_air',
    fromPlaceId: 'vancouver',
    toPlaceId: 'toronto',
    mode: 'flight_domestic',
    inVehicleHours: 4.55,
    typicalRangeHours: { min: 4.3, max: 5.3 },
    localTransferHours: { origin: 0.5, destination: 0.75 },
    assumptions: [
      "4.55h is the published average block time. Eastbound and westbound differ by roughly 30-40 minutes on this route because of the jet stream, and a single bidirectional row cannot express that. Recorded as a known modelling limit (see review doc, finding C1-F3); the average is the honest single value until the Connection model carries per-direction durations.",
      "Nonstop on Air Canada, WestJet and others; 42 carriers listed on the city pair. No gateway preference is set: YYZ is the only Toronto airport in the pilot."
    ],
    sources: [
      "https://www.expedia.com/cn/lp/flight-routes/air-canada-from-vancouver-intl-to-pearson-intl/ac/yvr/yyz (average flight duration 4h33m, Air Canada YVR-YYZ)",
      "https://roame.travel/flightmap/YVR/YYZ (nonstop service confirmed; 2,079 mi great-circle; 42 airlines on the route)"
    ],
    reviewedBy: "Claude (chat, 28 Sep 2026 live-research pass — average block time sourced; direction asymmetry flagged, not resolved)",
    reviewedAt: "2026-09-28",
    version: 1
  },
  {
    ...DRAFT_ROW,
    id: 'conn_yvr_yqb_air',
    fromPlaceId: 'vancouver',
    toPlaceId: 'quebec_city',
    mode: 'flight_domestic',
    inVehicleHours: 6.05,
    segments: [
      { mode: 'flight_domestic', inVehicleHours: 4.55 },  // YVR-YYZ
      { mode: 'flight_domestic', inVehicleHours: 1.5 }    // YYZ-YQB
    ],
    layoverHours: 1.5,
    typicalRangeHours: { min: 8.5, max: 11.0 },
    localTransferHours: { origin: 0.5, destination: 0.4 },
    assumptions: [
      "Modelled as a one-stop connection via Toronto, which is what a Vancouver traveller can actually book on any day. Montréal is an equivalent connecting point; the pilot uses Toronto because its segment time is already sourced.",
      "layoverHours (1.5h) is a conservative domestic-connection estimate at YYZ, NOT a figure read off a booked itinerary. Same class of assumption as the Lima row's 2.0h layover, and it should be replaced with a real date-specific itinerary before this row is trusted beyond the pilot.",
      "Air Transat has operated a seasonal nonstop YVR-YQB (launched Aug 2021, summer schedule, once weekly). Once-weekly service is too sparse to plan an itinerary around, so the row models the connection instead. If that nonstop is ever daily, this row should be revisited.",
      "YQB is a small airport; destination transfer 0.4h reflects that."
    ],
    sources: [
      "https://www.expedia.com/cn/lp/flight-routes/air-canada-from-vancouver-intl-to-pearson-intl/ac/yvr/yyz (YVR-YYZ segment, 4h33m average)",
      "https://static.intrafocus.com/?p=8476 (Toronto-Québec City flight time 1h30m)",
      "https://www.travelweek.ca/news/air-transat-celebrates-first-nonstop-flight-from-yvr-and-yqb/ (Air Transat YVR-YQB seasonal nonstop, once weekly, summer schedule)"
    ],
    reviewedBy: "Claude (chat, 28 Sep 2026 live-research pass — segments sourced; layover is a flagged conservative estimate)",
    reviewedAt: "2026-09-28",
    version: 1
  },
  {
    ...DRAFT_ROW,
    id: 'conn_yyz_yul_train',
    fromPlaceId: 'toronto',
    toPlaceId: 'montreal',
    mode: 'train',
    inVehicleHours: 5.2,
    typicalRangeHours: { min: 4.93, max: 5.5 },
    localTransferHours: { origin: 0.25, destination: 0.25 },
    assumptions: [
      "VIA Rail corridor, Toronto Union to Montréal Central, both city-centre stations, hence the small 0.25h transfers. Roughly one departure every four hours, first 06:32, last 18:08. Year-round, every day.",
      "Used only when Ottawa is not in the variant; with Ottawa the trip runs as two shorter legs."
    ],
    sources: [
      "https://www.rome2rio.com/Train/Toronto/Montreal (average 5h13m, fastest 4h56m, direct, first 06:32, last 18:08)",
      "https://www.viarail.ca/en/plan/train-schedules/toronto-ottawa-montreal (VIA corridor timetable)"
    ],
    reviewedBy: "Claude (chat, 28 Sep 2026 live-research pass)",
    reviewedAt: "2026-09-28",
    version: 1
  },
  {
    ...DRAFT_ROW,
    id: 'conn_yyz_yow_train',
    fromPlaceId: 'toronto',
    toPlaceId: 'ottawa',
    mode: 'train',
    inVehicleHours: 4.8,
    typicalRangeHours: { min: 4.4, max: 5.1 },
    localTransferHours: { origin: 0.25, destination: 0.35 },
    assumptions: [
      "VIA Rail corridor, about one departure every four hours, roughly 55 trains a week. Year-round.",
      "Ottawa station sits outside the core, so the destination transfer is 0.35h rather than 0.25h."
    ],
    sources: [
      "https://www.rome2rio.com/s/Toronto/Ottawa (VIA Rail average 4h49m, a train every four hours, ~55 weekly)"
    ],
    reviewedBy: "Claude (chat, 28 Sep 2026 live-research pass)",
    reviewedAt: "2026-09-28",
    version: 1
  },
  {
    ...DRAFT_ROW,
    id: 'conn_yow_yul_train',
    fromPlaceId: 'ottawa',
    toPlaceId: 'montreal',
    mode: 'train',
    inVehicleHours: 2.0,
    typicalRangeHours: { min: 1.9, max: 2.2 },
    localTransferHours: { origin: 0.35, destination: 0.25 },
    assumptions: [
      "VIA Rail, about 2 hours, 34 departures a week (5-6 a day), first 06:07, last 17:55. Year-round.",
      "Origin transfer 0.35h mirrors the Toronto-Ottawa row's Ottawa end."
    ],
    sources: [
      "https://www.viarail.ca/en/explore-our-destinations/trains/ontario-and-quebec/ottawa-montreal (average duration 2h; 34 departures per week; departures 06:07, 07:45, 10:13, 14:17, 16:05, 17:55)"
    ],
    reviewedBy: "Claude (chat, 28 Sep 2026 live-research pass)",
    reviewedAt: "2026-09-28",
    version: 1
  },
  {
    ...DRAFT_ROW,
    id: 'conn_yul_yqb_train',
    fromPlaceId: 'montreal',
    toPlaceId: 'quebec_city',
    mode: 'train',
    inVehicleHours: 3.4,
    typicalRangeHours: { min: 3.18, max: 3.6 },
    localTransferHours: { origin: 0.25, destination: 0.3 },
    assumptions: [
      "VIA Rail, average 3h26m and fastest 3h11m, five departures a day, first 06:25 and last 18:25. The sparsest corridor service in this family, and still comfortably compatible with the engine's 09:00 departure.",
      "Terminates at Québec's Gare du Palais, near the old town; destination transfer 0.3h."
    ],
    sources: [
      "https://www.rome2rio.com/Train/Montreal/Quebec (average 3h26m, fastest 3h11m, 5 trains a day, first 06:25, last 18:25 arriving 21:48)",
      "https://www.viarail.ca/en/plan/train-schedules/ottawa-montreal-sainte-foy-quebec (VIA timetable)"
    ],
    reviewedBy: "Claude (chat, 28 Sep 2026 live-research pass)",
    reviewedAt: "2026-09-28",
    version: 1
  },
  {
    ...DRAFT_ROW,
    id: 'conn_yyz_nfl_coach',
    fromPlaceId: 'toronto',
    toPlaceId: 'niagara_falls',
    mode: 'coach_scheduled',
    inVehicleHours: 1.6,
    typicalRangeHours: { min: 1.58, max: 2.5 },
    localTransferHours: { origin: 0.25, destination: 0.25 },
    assumptions: [
      "MODELLED AS THE GO BUS, NOT THE GO TRAIN, and this is a deliberate judgment (review doc, finding C1-F2). GO train service to Niagara is year-round but commuter-shaped: one weekday round trip and two at weekends, with the weekday Toronto-bound working leaving Niagara in the morning and returning late afternoon. A traveller leaving Toronto at 09:00 on a weekday cannot take it. The GO bus runs about 37 times a day, year-round, in 1h35m, and is the service actually available at the hour the engine departs.",
      "The range max of 2.5h covers the GO train (2h28m) for travellers who take it at the weekend.",
      "Niagara Falls GO station is about 2 km from the falls themselves; the local WEGO shuttle covers it. Not modelled: the pilot treats Niagara Falls as one place."
    ],
    sources: [
      "https://www.rome2rio.com/s/Toronto/Niagara-Falls-Ontario (bus 1h35m, 257 weekly services; GO train 2h28m, two daily)",
      "https://www.metrolinx.com/en/discover/weekend-go-train-service-to-niagara-continues-year-round (weekday train: one round trip year-round; weekends: two round trips year-round)",
      "https://www.gotransit.com/en/partners-and-promotions/toronto-to-niagara-falls-weekday-trips (when the Niagara GO train is unavailable, Lakeshore West to Burlington plus GO Bus 12)"
    ],
    reviewedBy: "Claude (chat, 28 Sep 2026 live-research pass — mode choice is a reviewed judgment, see assumptions)",
    reviewedAt: "2026-09-28",
    version: 1
  }
];

// ---------------------------------------------------------------------------
// Route Families (design-door2-route-families v2). The hand-written package
// list is replaced by families; compileFamilies() turns them into the same
// RoutePackage shape route.js and schedule.js already read. The backbone of
// `peru_classic` compiles to exactly the package that used to be written here.

/** @returns {import('./types.js').RouteFamilyStop} */
function familyStop(placeId, minNights, maxNights, excursions = []) {
  return { placeId, minNights, maxNights, excursions };
}

const MACHU_PICCHU_EXCURSION = Object.freeze({
  placeId: 'machu_picchu',
  connectionId: 'conn_agc_mp_shuttle',
  hoursOnSite: 4
});

const CUSCO_ACCLIMATISATION =
  'Cusco minimum is 2 nights for altitude acclimatisation (3,400 m) before the Sacred Valley and Machu Picchu.';

const HUARAZ_HUB_BACKTRACK =
  'Huaraz to Cusco backtracks through the Lima hub: there is deliberately no direct Huaraz-Cusco connection.';

// Written direction-neutral, so they stay true in the mirrored variants.
const EC_CORRIDOR_RAIL =
  'Toronto, Ottawa, Montréal and Québec City are linked by the VIA Rail corridor, so the corridor can be travelled in either direction.';

const NIAGARA_SPUR_HUB =
  'Niagara Falls is an out-and-back from Toronto: the route returns to Toronto before continuing along the corridor.';

/** @type {import('./types.js').RouteFamily[]} */
export const PILOT_ROUTE_FAMILIES = [
  {
    id: 'nyc_city',
    name: 'New York City',
    countryId: 'US',
    stops: { nyc_base: familyStop('new_york', 2, 10) },
    backbone: ['nyc_base'],
    optional: []
  },
  {
    id: 'tokyo_city',
    name: 'Tokyo',
    countryId: 'JP',
    preferredGatewayId: 'NRT',
    stops: { tokyo_base: familyStop('tokyo', 3, 10) },
    backbone: ['tokyo_base'],
    optional: []
  },
  {
    id: 'peru_classic',
    name: 'Peru classic: Lima, Cusco, Sacred Valley, Machu Picchu',
    countryId: 'PE',
    assumptions: [CUSCO_ACCLIMATISATION],
    stops: {
      pc_lima_in: familyStop('lima', 1, 3),
      pc_cusco: familyStop('cusco', 2, 4),
      pc_sacred_valley: familyStop('ollantaytambo', 0, 1),
      pc_aguas: familyStop('aguas_calientes', 1, 2, [MACHU_PICCHU_EXCURSION]),
      pc_olly_return: familyStop('ollantaytambo', 0, 0),
      pc_cusco_return: familyStop('cusco', 0, 0),
      pc_lima_out: familyStop('lima', 1, 1),
      pc_huaraz: familyStop('huaraz', 2, 4),
      // Hub night in Lima between Huaraz and the next leg (was ph_lima_mid).
      pc_lima_hub: familyStop('lima', 1, 1)
    },
    backbone: ['pc_lima_in', 'pc_cusco', 'pc_sacred_valley', 'pc_aguas', 'pc_olly_return', 'pc_cusco_return', 'pc_lima_out'],
    optional: [
      {
        id: 'huaraz',
        label: 'Huaraz & the Cordillera Blanca',
        pitch: 'Glacier lakes and high-altitude hiking, about 8½ hours north of Lima by coach.',
        assumptions: [HUARAZ_HUB_BACKTRACK],
        exclusiveWith: [],
        positions: [
          {
            id: 'after_lima_in',
            after: 'pc_lima_in',
            insert: ['pc_huaraz', 'pc_lima_hub'],
            status: 'approved',
            variantName: 'Peru classic with Huaraz',
            // Reproduces the old peru_classic_huaraz package (Lima-in 1–2, not 1–3).
            overrides: { pc_lima_in: { maxNights: 2 } }
          },
          {
            id: 'after_machu_picchu',
            after: 'pc_lima_out',
            insert: ['pc_huaraz', 'pc_lima_hub'],
            status: 'approved',
            variantName: 'Peru classic, then Huaraz',
            assumptions: [
              'Altitude/connection review approved: arriving in Huaraz (≈3,050 m) after Cusco means already acclimatised; reuses the Lima–Huaraz coach both ways.'
            ]
          }
        ]
      }
    ],
    // The old package id stays resolvable for saved drafts and old requests.
    aliases: { 'peru_classic+huaraz@after_lima_in': ['peru_classic_huaraz'] }
  },
  {
    id: 'ec_corridor',
    name: 'Eastern Canada corridor',
    countryId: 'CA',
    assumptions: [EC_CORRIDOR_RAIL],
    directions: [
      { id: 'west_to_east', label: 'Toronto to Québec City', status: 'approved' },
      { id: 'east_to_west', label: 'Québec City to Toronto', status: 'approved' }
    ],
    stops: {
      ec_toronto: familyStop('toronto', 2, 4),
      ec_montreal: familyStop('montreal', 2, 4),
      ec_quebec: familyStop('quebec_city', 1, 3),
      ec_ottawa: familyStop('ottawa', 1, 2),
      ec_niagara: familyStop('niagara_falls', 1, 2),
      // A night back in Toronto after the Niagara spur. Not 0-1: at 0 the
      // default trip puts Niagara -> Toronto -> Montreal (9.1h of travel) on
      // one day. Same reason Peru's Lima hub is 1-1.
      ec_toronto_hub: familyStop('toronto', 1, 1)
    },
    backbone: ['ec_toronto', 'ec_montreal', 'ec_quebec'],
    optional: [
      {
        id: 'ottawa',
        label: 'Ottawa',
        pitch: 'The capital, two hours short of Montréal by train: Parliament Hill, the National Gallery and the Rideau Canal.',
        exclusiveWith: [],
        positions: [
          { id: 'corridor', between: ['ec_toronto', 'ec_montreal'], insert: ['ec_ottawa'], segmentOrder: 2, status: 'approved' }
        ]
      },
      {
        id: 'niagara',
        label: 'Niagara Falls',
        pitch: 'An hour and a half from Toronto by coach, and worth a night to see the falls lit after dark.',
        assumptions: [NIAGARA_SPUR_HUB],
        exclusiveWith: [],
        positions: [
          { id: 'toronto_spur', between: ['ec_toronto', 'ec_montreal'], insert: ['ec_niagara', 'ec_toronto_hub'], segmentOrder: 1, status: 'approved' }
        ]
      }
    ]
  }
];

/**
 * Every compiled variant, held ones included (dev harness, draft upgrader and
 * buildTripFromRoutePlan use this; travellers never get a held variant).
 * @type {RoutePackage[]}
 */
export const PILOT_ROUTE_PACKAGES_ALL = compileFamilies(PILOT_ROUTE_FAMILIES, { includePending: true });

/** The packages served to travellers: only variants whose positions are all approved. @type {RoutePackage[]} */
export const PILOT_ROUTE_PACKAGES = PILOT_ROUTE_PACKAGES_ALL.filter((p) => !p.held);
