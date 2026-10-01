// Destination-factory generality probe (Phase E checkpoint, decision E5-3).
//
// QUESTION: can a new destination be added as DATA ONLY, with zero change to any
// engine file? This is deliberately SYNTHETIC — the places, connections and content
// are invented placeholders with no real-world facts to maintain. Its job is to prove
// MECHANISM COMPOSITION, not to carry a product destination.
//
// It composes a combination no shipped family has:
//   reversible directions (Eastern Canada) + mid-route optional (Eastern Canada)
//   + traveller-selectable excursion menu (Japan) + an attraction place that is never a base.
// Directions and excursion menus have never appeared in the same family.
//
// If this file ever needs an engine change to keep passing, the generality claim in
// claude/checkpoint-phase-e-2026-09-30.md §5 has become false. That is the whole point.

import { compileFamilies, checkVariantsSchedulable } from '../../../src/lib/door2/families.js';
import { PILOT_PLACES, PILOT_CONNECTIONS } from '../../../src/lib/door2/pilotData.js';
import { PILOT_CONTENT } from '../../../src/lib/door2/pilotContent.js';
import { buildFilledTrip } from '../../../src/lib/door2/planner.js';
import * as R from '../../../src/lib/door2/restructure.js';

const COUNTRY = 'ZZ'; // reserved, never a real destination

const place = (id, name, lat, lng, visitKind = 'base') =>
  ({ id, name, aliases: [], countryId: COUNTRY, coordinates: { lat, lng }, visitKind, utcOffsetHours: 1 });

const TF_PLACES = {
  tf_base_a: place('tf_base_a', 'Base A', 10.0, 10.0),
  tf_base_b: place('tf_base_b', 'Base B', 12.0, 10.5),
  tf_base_c: place('tf_base_c', 'Base C', 11.0, 10.2),
  tf_site_a: place('tf_site_a', 'Site A', 10.2,  9.7, 'attraction'),
  tf_site_b: place('tf_site_b', 'Site B',  9.6, 10.4, 'attraction')
};

const ROW = { direction: 'bidirectional', gatewayRequirements: [], assumptions: [], sources: [],
              reviewedBy: 'synthetic generality probe — not real data', reviewedAt: '2026-09-30', version: 2 };

const conn = (id, from, to, mode, hours, origin, dest, extra = {}) =>
  ({ ...ROW, id, fromPlaceId: from, toPlaceId: to, mode, inVehicleHours: hours,
     typicalRangeHours: { min: hours - 0.2, max: hours + 0.3 },
     localTransferHours: { origin, destination: dest }, ...extra });

const TF_CONNECTIONS = [
  conn('conn_tf_gw_a', 'vancouver', 'tf_base_a', 'flight_international', 11.5, 0.5, 1.25, { gatewayId: 'TFA' }),
  conn('conn_tf_gw_b', 'vancouver', 'tf_base_b', 'flight_international', 12.1, 0.5, 1.25, { gatewayId: 'TFB' }),
  conn('conn_tf_a_b',  'tf_base_a', 'tf_base_b', 'train', 2.9, 0.4, 0.4),
  conn('conn_tf_a_c',  'tf_base_a', 'tf_base_c', 'train', 1.8, 0.4, 0.4),
  conn('conn_tf_c_b',  'tf_base_c', 'tf_base_b', 'train', 1.1, 0.4, 0.4),
  conn('conn_tf_a_sa', 'tf_base_a', 'tf_site_a', 'train', 0.7, 0.4, 0.3),
  conn('conn_tf_a_sb', 'tf_base_a', 'tf_site_b', 'coach_scheduled', 1.6, 0.4, 0.3)
];

const SRC = { kind: 'authored', note: 'Synthetic generality probe; not product content.' };
const item = (id, placeId, title, slots, summary, extra = {}) => ({
  id, placeId, title, slots, intensity: 'Moderate', interests: ['Cities', 'History and culture'],
  summary, source: SRC, ...extra });
const full = (id, p, t) => item(id, p, t, ['full'], `${t} — synthetic full-day placeholder.`,
  { morning: 'Synthetic morning.', afternoon: 'Synthetic afternoon.', evening: 'Synthetic evening.' });

const TF_CONTENT = [
  full('tf_a_1', 'tf_base_a', 'Base A day one'), full('tf_a_2', 'tf_base_a', 'Base A day two'),
  full('tf_a_3', 'tf_base_a', 'Base A day three'),
  item('tf_a_eve', 'tf_base_a', 'Base A evening', ['evening'], 'Synthetic evening placeholder.'),
  item('tf_a_short', 'tf_base_a', 'Base A short', ['short', 'half'], 'Synthetic short placeholder.'),
  full('tf_b_1', 'tf_base_b', 'Base B day one'), full('tf_b_2', 'tf_base_b', 'Base B day two'),
  item('tf_b_eve', 'tf_base_b', 'Base B evening', ['evening'], 'Synthetic evening placeholder.'),
  item('tf_b_short', 'tf_base_b', 'Base B short', ['short', 'half'], 'Synthetic short placeholder.'),
  full('tf_c_1', 'tf_base_c', 'Base C day one'),
  item('tf_c_eve', 'tf_base_c', 'Base C evening', ['evening'], 'Synthetic evening placeholder.'),
  item('tf_c_short', 'tf_base_c', 'Base C short', ['short', 'half'], 'Synthetic short placeholder.'),
  full('tf_sa_1', 'tf_site_a', 'Site A visit'),
  item('tf_sa_half', 'tf_site_a', 'Site A half day', ['half', 'short'], 'Synthetic half-day placeholder.'),
  full('tf_sb_1', 'tf_site_b', 'Site B visit'),
  item('tf_sb_half', 'tf_site_b', 'Site B half day', ['half', 'short'], 'Synthetic half-day placeholder.')
];

const familyStop = (placeId, minNights, maxNights, excursions = [], excursionMenu) => ({
  placeId, minNights, maxNights, excursions,
  ...(excursionMenu && excursionMenu.length ? { excursionMenu } : {})
});

const BASE_A_DAY_TRIPS = [
  { id: 'site_a', placeId: 'tf_site_a', connectionId: 'conn_tf_a_sa', hoursOnSite: 6, status: 'approved' },
  { id: 'site_b', placeId: 'tf_site_b', connectionId: 'conn_tf_a_sb', hoursOnSite: 5, status: 'approved' }
];

export const TF_FAMILY = {
  id: 'tf_corridor',
  name: 'Synthetic corridor',
  countryId: COUNTRY,
  preferredGatewayId: 'TFA',
  // The combination under test: directions AND excursionMenu in one family.
  directions: [
    { id: 'a_to_b', label: 'Base A to Base B', status: 'approved' },
    { id: 'b_to_a', label: 'Base B to Base A', status: 'approved' }
  ],
  stops: {
    tf_a: familyStop('tf_base_a', 2, 5, [], BASE_A_DAY_TRIPS),
    tf_b: familyStop('tf_base_b', 2, 4),
    tf_c: familyStop('tf_base_c', 1, 2)
  },
  backbone: ['tf_a', 'tf_b'],
  optional: [
    { id: 'base_c', label: 'Base C', pitch: 'Synthetic mid-route optional.', exclusiveWith: [],
      positions: [{ id: 'corridor', between: ['tf_a', 'tf_b'], insert: ['tf_c'], segmentOrder: 1, status: 'approved' }] }
  ]
};

export function buildProbeWorld() {
  const packages = compileFamilies([TF_FAMILY], { includePending: true });
  return {
    packages,
    data: {
      places: { ...PILOT_PLACES, ...TF_PLACES },
      connections: [...PILOT_CONNECTIONS, ...TF_CONNECTIONS],
      routePackages: packages.filter((p) => !p.held),
      allRoutePackages: packages
    },
    content: [...PILOT_CONTENT, ...TF_CONTENT]
  };
}

export const probeSpec = (days, routeTemplateId) => ({
  originPlaceId: 'vancouver', destination: { kind: 'country', id: COUNTRY }, travelMonth: 10,
  totalDays: days, travellerType: 'couple', interests: [], pace: 'balanced', budget: 'mid',
  requiredPlaceIds: [], routeTemplateId, stops: [], choices: { pinned: [], rejected: [], placed: [] }
});

export { checkVariantsSchedulable, buildFilledTrip, R };
