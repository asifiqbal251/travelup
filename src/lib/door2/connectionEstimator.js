import { demand, exact, finite, https, iso, text } from './connectionModel.js';

// Registration of the approved F6 flight-gc-v1 approximation. Independent code
// review and release approval are still required before production activation.
// Source constants: NASA mean Earth radius 6371 km; Travelmath 500 mph + 0.5 h
// per segment; Veness haversine. See approved F6 brief §3.1 for source URLs and
// limits. The literals in f6Estimator.test.js are independently calculated oracles.
// This is typical-service planning, not a timetable. No caller approval flags.
export const ESTIMATOR_VERSION = 'flight-gc-v1';
export const ESTIMATE_LIMITATIONS = Object.freeze(['spherical_distance', 'typical_flight_speed', 'no_timetable', 'wind_and_ground_delay_not_calibrated', 'fixed_offsets']);
const admission = new WeakMap();
const freeze = value => { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
const clone = v => JSON.parse(JSON.stringify(v));
export function isAdmitted(c) { return !!c && admission.has(c) && admission.get(c).canonical === JSON.stringify(c); }
export function estimatedFacts(c) { return isAdmitted(c) ? admission.get(c).facts : null; }
export function connectionPolicy(c) {
  if (c?.derivation === 'estimated') return { eligible: isAdmitted(c), draft: false, reason: 'estimator_not_admitted', reviewed: false };
  if (c?.derivation !== undefined && c.derivation !== 'curated') return { eligible: false, draft: false, reason: 'connection_content_invalid', reviewed: false };
  return { eligible: true, draft: c?.reviewedAt == null, reviewed: c?.reviewedAt != null };
}
// Cannot brand a supplied copy: this function makes its own exact immutable copy.
export function orientAdmitted(c, from, to) {
  if (!isAdmitted(c) || c.fromPlaceId !== from || c.toPlaceId !== to) return null;
  const result = freeze(clone(c));
  admission.set(result, { ...admission.get(c), canonical: JSON.stringify(result) });
  return result;
}
export function distanceKm(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (((b.lng - a.lng + 540) % 360) - 180) * rad;
  const h = Math.min(1, Math.max(0, Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2));
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
export function validateEstimate(input, generatedAt) {
  const check = (ok, field, domain = false) => demand(ok, field, domain ? 'estimation_domain_unsupported' : 'estimation_input_invalid');
  check(exact(input, ['fromPlaceId', 'toPlaceId', 'mode', 'segments', 'layoverHours', 'localTransferHours', 'localTransferSources', 'sourceUrl', 'observedAt'], ['layoverSource']), 'estimate');
  check(text(input.fromPlaceId) && text(input.toPlaceId) && input.fromPlaceId !== input.toPlaceId, 'endpoints');
  const source = (s, field, shape = true) => check((!shape || exact(s, ['sourceUrl', 'observedAt'])) && https(s?.sourceUrl) && iso(s?.observedAt) && s.observedAt <= generatedAt, field);
  source(input, 'source', false);
  check(['flight_international', 'flight_domestic'].includes(input.mode), 'mode', true);
  check(Array.isArray(input.segments) && [1, 2].includes(input.segments.length), 'segments', true);
  const airport = (a, field) => {
    check(exact(a, ['key', 'lat', 'lng', 'countryId', 'sourceUrl', 'observedAt']) && text(a.key) && text(a.countryId) && finite(a.lat, -90) && a.lat <= 90 && finite(a.lng, -180) && a.lng <= 180, field);
    source(a, field, false);
  };
  for (const [i, s] of input.segments.entries()) {
    check(exact(s, ['fromAirport', 'toAirport', 'serviceSourceUrl', 'observedAt']), `segments[${i}]`);
    airport(s.fromAirport, `segments[${i}].fromAirport`); airport(s.toAirport, `segments[${i}].toAirport`);
    source({ sourceUrl: s.serviceSourceUrl, observedAt: s.observedAt }, `segments[${i}].service`);
    const d = distanceKm(s.fromAirport, s.toAirport);
    check(d > 0 && d <= Math.PI * 6371, `segments[${i}].distance`, true);
  }
  if (input.mode === 'flight_domestic') check(new Set(input.segments.flatMap(s => [s.fromAirport.countryId, s.toAirport.countryId])).size === 1, 'segments.countryId', true);
  if (input.segments.length === 2) {
    const a = input.segments[0].toAirport, b = input.segments[1].fromAirport;
    check(['key', 'lat', 'lng', 'countryId'].every(k => a[k] === b[k]), 'segments.join', true);
    check(finite(input.layoverHours) && input.layoverHours > 0, 'layoverHours'); source(input.layoverSource, 'layoverSource');
  } else check(input.layoverHours === 0 && !Object.hasOwn(input, 'layoverSource'), 'layoverHours');
  check(exact(input.localTransferHours, ['origin', 'destination']) && exact(input.localTransferSources, ['origin', 'destination']), 'localTransferHours');
  for (const end of ['origin', 'destination']) { check(finite(input.localTransferHours[end]), `localTransferHours.${end}`); source(input.localTransferSources[end], `localTransferSources.${end}`); }
}
export function estimateConnection(input, { generatedAt, estimatorRulesetVersion, originSnapshot = null }) {
  demand(iso(generatedAt), 'generatedAt', 'estimation_input_invalid');
  demand(estimatorRulesetVersion === ESTIMATOR_VERSION, 'estimatorRulesetVersion', 'estimation_domain_unsupported');
  validateEstimate(input, generatedAt);
  const segments = input.segments.map(s => ({ mode: input.mode, inVehicleHours: distanceKm(s.fromAirport, s.toAirport) / 804.672 + 0.5 }));
  const row = freeze({ id: `est:${ESTIMATOR_VERSION}:${encodeURIComponent(input.fromPlaceId)}:${encodeURIComponent(input.toPlaceId)}`, fromPlaceId: input.fromPlaceId, toPlaceId: input.toPlaceId, direction: 'oneway', mode: input.mode, inVehicleHours: segments.reduce((n, s) => n + s.inVehicleHours, 0), segments, layoverHours: input.layoverHours, transfers: segments.length - 1, localTransferHours: clone(input.localTransferHours), derivation: 'estimated', estimatorRulesetVersion: ESTIMATOR_VERSION, reviewedBy: null, reviewedAt: null, version: 1 });
  admission.set(row, { canonical: JSON.stringify(row), facts: freeze({ inputs: clone(input), originSnapshot: clone(originSnapshot) }) });
  return row;
}
