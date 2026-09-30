// Synthetic data for E3a (traveller-selectable same-day excursions). Every place,
// connection, family and content item is invented (`syn_` ids); the only shared
// id is the `vancouver` origin. Nothing here touches pilotData.js or
// pilotContent.js: the bundle is passed through the engine's existing `data`,
// `content` and `families` options.
//
// All places sit in one time zone (UTC+0, same as the origin), so the numbers
// below are easy to check by hand. Allowances come from buffer_ruleset_v2:
//   flight_international  pre 2.5h + post 1.0h     train  pre 0.5h + post 0.25h
//   flight_domestic       pre 1.5h + post 0.5h     local_shuttle pre 0.1h + post 0.1h
// and a connection's localTransferHours default to 0.5h per end.
//
// Usable time of a connection = in-vehicle + pre + post + local transfers:
//   HOME_LX flight      8h   -> 8   + 3.5  + 1.0 = 12.5h   (long haul: arrives 21:30 on day 1)
//   LX_SINTRA train     1h   -> 1   + 0.75 + 0.5 = 2.25h   (also Cascais, Obidos)
//   LX_PORTO train      3h   -> 3   + 0.75 + 0.5 = 4.25h   (arrives 13:15 after a 09:00 departure)
//   PORTO_* train       1h   -> 2.25h each way
// Excursion "total" = out + hoursOnSite + back; the scheduler takes the earliest
// day where it fits 09:00-21:00 (a 12h window), charging both legs in full.
//
//   Lisbon-style base  lx_base, authored 2-5 nights.
//     Arrives 21:30 on day 1, so day 1 holds nothing. Sintra / Cascais: 2.25 + 5 + 2.25 = 9.5h.
//     One fits a full day: at 2 nights (day 2). Two need 3 nights (days 2 and 3).  <- the A5 case
//   Porto-style spur   pt_base, authored 2-4 nights, FIXED excursion (castle, 4h -> 8.5h) plus a menu.
//     Arrives 13:15 on the arrival day (7.75h left), so 8.5h and 9.5h items fit no earlier than day 2.
//     Castle takes day 2. Douro / wine / ports (9.5h each) take days 3, 4 and, at most, none.
//     At 4 nights only days 2-4 exist: castle + two menu items fit; castle + three do not, at any
//     night count the stop allows.  <- the no-alternative case
//   Solo base          solo_base, 2-4 nights, arrives 17:00 on day 1 (long haul, 8.0h usable).
//     `quick` (shuttle, 0.65h each way + 1.5h on site = 2.8h) fits the 4h left on the ARRIVAL day (A24). `ghost` is reachable only by an
//     unreviewed connection (strict-policy refusal, A23).
//   Line family        ln_a -> ln_b -> ln_c, both directions, optional stop ln_d in two positions.
//     ln_b (1-3 nights) and ln_d carry a menu item each (reversible / mirror tests). The Birch excursion
//     ('falls': 2.25 + 3 + 2.25 = 7.5h) fits the arrival day at Birch when coming from Alder (train 3.25h, so a
//     12:15 arrival with 8.75h left) but not when coming from Dogwood over the slow 6h link (7.25h usable, a 16:15
//     arrival with 4.75h left): there it needs the next day, so adding Dogwood raises Birch's effective minimum
//     from 1 night to 2.

const place = (id, name, visitKind = 'base') => ({
  id,
  name,
  aliases: [],
  countryId: 'XX',
  coordinates: { lat: 0, lng: 0 },
  visitKind,
  utcOffsetHours: 0
});

export const SYN_PLACES = Object.freeze(
  Object.fromEntries(
    [
      place('vancouver', 'Vancouver'),
      place('syn_lisbon', 'Lisbon'),
      place('syn_sintra', 'Sintra', 'attraction'),
      place('syn_cascais', 'Cascais', 'attraction'),
      place('syn_obidos', 'Obidos', 'attraction'),
      place('syn_porto', 'Porto'),
      place('syn_castle', 'the Castle', 'attraction'),
      place('syn_douro', 'the Douro', 'attraction'),
      place('syn_wine', 'the Wine Cellars', 'attraction'),
      place('syn_ports', 'the Port Lodges', 'attraction'),
      place('syn_solo', 'Solo Town'),
      place('syn_quick', 'the Quick Site', 'attraction'),
      place('syn_ghost', 'the Ghost Site', 'attraction'),
      place('syn_la', 'Alder'),
      place('syn_lb', 'Birch'),
      place('syn_lc', 'Cedar'),
      place('syn_ld', 'Dogwood'),
      place('syn_lbx', 'the Birch Falls', 'attraction'),
      place('syn_ldx', 'the Dogwood Ridge', 'attraction')
    ].map((p) => [p.id, p])
  )
);

const REVIEW = { reviewedBy: 'test', reviewedAt: '2026-09-28', version: 1 };

function connection(id, from, to, mode, inVehicleHours, extra = {}) {
  return {
    id,
    fromPlaceId: from,
    toPlaceId: to,
    mode,
    inVehicleHours,
    localTransferHours: { origin: 0.25, destination: 0.25 },
    direction: 'bidirectional',
    gatewayRequirements: [],
    assumptions: [],
    sources: [],
    ...REVIEW,
    ...extra
  };
}
const train = (id, from, to, hours) => connection(id, from, to, 'train', hours);
// Flights and shuttles keep the default 0.5h transfers (no localTransferHours).
const noLocal = ({ localTransferHours, ...rest }) => rest;

export const SYN_CONNECTIONS = Object.freeze([
  noLocal(connection('syn_conn_home_lx', 'vancouver', 'syn_lisbon', 'flight_international', 8)),
  train('syn_conn_lx_sintra', 'syn_lisbon', 'syn_sintra', 1),
  train('syn_conn_lx_cascais', 'syn_lisbon', 'syn_cascais', 1),
  train('syn_conn_lx_obidos', 'syn_lisbon', 'syn_obidos', 1),
  train('syn_conn_lx_porto', 'syn_lisbon', 'syn_porto', 3),
  train('syn_conn_pt_castle', 'syn_porto', 'syn_castle', 1),
  train('syn_conn_pt_douro', 'syn_porto', 'syn_douro', 1),
  train('syn_conn_pt_wine', 'syn_porto', 'syn_wine', 1),
  train('syn_conn_pt_ports', 'syn_porto', 'syn_ports', 1),
  // Solo: 3.5h in the air + 3.5h + 1.0h allowances = exactly 8.0h, so it counts as long haul.
  noLocal(connection('syn_conn_home_solo', 'vancouver', 'syn_solo', 'flight_international', 3.5)),
  // 0.25h + 0.1h + 0.1h + 0.1h + 0.1h = 0.65h each way, so a 1.5h site (the shortest an open block may be) totals 2.8h.
  connection('syn_conn_solo_quick', 'syn_solo', 'syn_quick', 'local_shuttle', 0.25, { localTransferHours: { origin: 0.1, destination: 0.1 } }),
  // The one unreviewed connection: a menu item on it is refused under the strict policy.
  { ...train('syn_conn_solo_ghost', 'syn_solo', 'syn_ghost', 1), reviewedBy: null, reviewedAt: null },
  train('syn_conn_home_la', 'vancouver', 'syn_la', 2),
  train('syn_conn_home_lc', 'vancouver', 'syn_lc', 2),
  train('syn_conn_la_lb', 'syn_la', 'syn_lb', 2),
  train('syn_conn_lb_lc', 'syn_lb', 'syn_lc', 2),
  train('syn_conn_la_ld', 'syn_la', 'syn_ld', 2),
  // Slow on purpose: arriving at Birch from Dogwood (16:15) leaves no room for the Birch excursion that
  // fits the arrival day when coming straight from Alder (12:15), so adding Dogwood can raise Birch's minimum.
  train('syn_conn_ld_lb', 'syn_ld', 'syn_lb', 6),
  train('syn_conn_ld_lc', 'syn_ld', 'syn_lc', 2),
  train('syn_conn_lb_lbx', 'syn_lb', 'syn_lbx', 1),
  train('syn_conn_ld_ldx', 'syn_ld', 'syn_ldx', 1)
]);

const item = (id, placeId, connectionId, hoursOnSite, status = 'approved') => ({ id, placeId, connectionId, hoursOnSite, status });
const stop = (placeId, minNights, maxNights, extra = {}) => ({ placeId, minNights, maxNights, excursions: [], ...extra });

/** Lisbon-style hub with an optional overnight spur that returns to a one-night hub stop. */
export function hubFamily() {
  return {
    id: 'syn_hub',
    name: 'Synthetic hub',
    countryId: 'XX',
    stops: {
      lx_base: stop('syn_lisbon', 2, 5, {
        excursionMenu: [
          item('sintra', 'syn_sintra', 'syn_conn_lx_sintra', 5),
          item('cascais', 'syn_cascais', 'syn_conn_lx_cascais', 5),
          item('obidos', 'syn_obidos', 'syn_conn_lx_obidos', 3, 'pending_review')
        ]
      }),
      pt_base: stop('syn_porto', 2, 4, {
        excursions: [{ placeId: 'syn_castle', connectionId: 'syn_conn_pt_castle', hoursOnSite: 4 }],
        excursionMenu: [
          item('douro', 'syn_douro', 'syn_conn_pt_douro', 5),
          item('wine', 'syn_wine', 'syn_conn_pt_wine', 5),
          item('ports', 'syn_ports', 'syn_conn_pt_ports', 5)
        ]
      }),
      lx_hub: stop('syn_lisbon', 1, 1)
    },
    backbone: ['lx_base'],
    optional: [
      {
        id: 'spur',
        label: 'Porto',
        pitch: '',
        exclusiveWith: [],
        positions: [{ id: 'after_base', after: 'lx_base', insert: ['pt_base', 'lx_hub'], status: 'approved' }]
      }
    ]
  };
}

/** One base, arriving on a long-haul flight, with a menu item that fits the arrival day and one that is unreviewed. */
export function soloFamily() {
  return {
    id: 'syn_solo',
    name: 'Synthetic solo',
    countryId: 'XX',
    stops: {
      solo_base: stop('syn_solo', 2, 4, {
        excursionMenu: [item('quick', 'syn_quick', 'syn_conn_solo_quick', 1.5), item('ghost', 'syn_ghost', 'syn_conn_solo_ghost', 3)]
      })
    },
    backbone: ['solo_base'],
    optional: []
  };
}

/** A small reversible corridor with a menu on its middle stop and on the optional stop. */
export function lineFamily() {
  return {
    id: 'syn_line',
    name: 'Synthetic line',
    countryId: 'XX',
    directions: [
      { id: 'fwd', label: 'Alder to Cedar', status: 'approved' },
      { id: 'rev', label: 'Cedar to Alder', status: 'approved' }
    ],
    stops: {
      ln_a: stop('syn_la', 1, 2),
      ln_b: stop('syn_lb', 1, 3, { excursionMenu: [item('falls', 'syn_lbx', 'syn_conn_lb_lbx', 3)] }),
      ln_c: stop('syn_lc', 1, 2),
      ln_d: stop('syn_ld', 1, 2, { excursionMenu: [item('ridge', 'syn_ldx', 'syn_conn_ld_ldx', 3)] })
    },
    backbone: ['ln_a', 'ln_b', 'ln_c'],
    optional: [
      {
        id: 'mid',
        label: 'Dogwood',
        pitch: '',
        exclusiveWith: [],
        positions: [
          { id: 'ab', between: ['ln_a', 'ln_b'], insert: ['ln_d'], segmentOrder: 1, status: 'approved' },
          { id: 'bc', between: ['ln_b', 'ln_c'], insert: ['ln_d'], segmentOrder: 1, status: 'approved' }
        ]
      }
    ]
  };
}

/** Every synthetic family. */
export const synFamilies = () => [hubFamily(), soloFamily(), lineFamily()];

// ---------------------------------------------------------------------------
// Content. Sintra has exactly two half-day items; Cascais has none at all (the
// honest-gap case); everything else has a small full shelf.

const source = { kind: 'authored', note: 'synthetic test content' };

function shelf(placeId, prefix, kinds) {
  const make = (slot, n) => ({
    id: `${prefix}_${slot}_${n}`,
    placeId,
    title: `${prefix} ${slot} ${n}`,
    slots: [slot],
    intensity: 'Moderate',
    interests: [],
    summary: `${prefix} ${slot} ${n}`,
    ...(slot === 'full' ? { morning: 'Morning.', afternoon: 'Afternoon.', evening: 'Evening.' } : {}),
    source
  });
  return Object.entries(kinds).flatMap(([slot, count]) => Array.from({ length: count }, (_, i) => make(slot, i + 1)));
}

const baseShelf = { full: 4, half: 3, evening: 3, short: 2 };

export const SYN_CONTENT = Object.freeze([
  ...shelf('syn_lisbon', 'lisbon', { ...baseShelf, full: 6, half: 6, evening: 6 }),
  ...shelf('syn_sintra', 'sintra', { half: 2 }),
  // syn_cascais: deliberately no content.
  ...shelf('syn_porto', 'porto', baseShelf),
  ...shelf('syn_castle', 'castle', { half: 2 }),
  ...shelf('syn_douro', 'douro', { half: 2 }),
  ...shelf('syn_wine', 'wine', { half: 2 }),
  ...shelf('syn_ports', 'ports', { half: 2 }),
  ...shelf('syn_solo', 'solo', baseShelf),
  ...shelf('syn_quick', 'quick', { short: 2, half: 1 }),
  ...shelf('syn_la', 'alder', baseShelf),
  ...shelf('syn_lb', 'birch', baseShelf),
  ...shelf('syn_lc', 'cedar', baseShelf),
  ...shelf('syn_ld', 'dogwood', baseShelf),
  ...shelf('syn_lbx', 'falls', { half: 2 }),
  ...shelf('syn_ldx', 'ridge', { half: 2 })
]);

// ---------------------------------------------------------------------------
// Assembly. `compile` is injected so the helper has no import-time dependency
// on the engine (a test that fails to load the engine still reports why).

/**
 * @param {Function} compileFamilies  families.js compileFamilies
 * @param {Object[]} [families]
 * @returns {{data: Object, content: Object[], families: Object[], options: Object}}
 */
export function synBundle(compileFamilies, families = synFamilies()) {
  const all = compileFamilies(families, { includePending: true });
  const data = {
    places: SYN_PLACES,
    connections: [...SYN_CONNECTIONS],
    routePackages: all.filter((p) => !p.held),
    allRoutePackages: all
  };
  return { data, content: [...SYN_CONTENT], families, options: { data, content: [...SYN_CONTENT], families } };
}

export function synSpec(totalDays, extra = {}) {
  return {
    originPlaceId: 'vancouver',
    destination: { kind: 'country', id: 'XX' },
    travelMonth: 6,
    totalDays,
    travellerType: 'couple',
    interests: [],
    pace: 'balanced',
    budget: 'mid',
    requiredPlaceIds: [],
    routeTemplateId: null,
    stops: [],
    choices: { pinned: [], rejected: [], placed: [] },
    ...extra
  };
}
