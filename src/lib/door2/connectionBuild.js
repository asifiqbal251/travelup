import { buildF5Trip, PILOT_DATA } from './planner.js';
import { PILOT_CONTENT } from './pilotContent.js';
import { getPlace } from './route.js';
import { decorateConnections, EVIDENCE_VERSION, estimatedEntry } from './connectionEvidence.js';
import { demand, iso, plain, text, validateCatalogue, validOriginSnapshot } from './connectionModel.js';
import { estimateConnection, validateEstimate, ESTIMATOR_VERSION } from './connectionEstimator.js';
import { checkTripSequence, tripSequenceFromTrip } from './tripSequence.js';

export const CONTEXT_MESSAGE = "We couldn't start this plan because required planning information is missing or invalid. Your trip has not changed.";
export function preflightConnectionContext(c) {
  const fail = (field, missing = false) => ({ ok: false, state: 'route_not_supported', message: CONTEXT_MESSAGE,
    options: [{ action: 'check_back_later', detail: 'Start a new plan to try again.' }],
    detail: { reason: 'connection_context_invalid', phase: 'pre_validation', field, issue: missing ? 'missing' : 'invalid' } });
  if (!plain(c)) return fail('connectionContext');
  const field = (k, ok) => ok ? null : fail(`connectionContext.${k}`, !Object.hasOwn(c, k));
  let error = field('schemaVersion', c.schemaVersion === 1); if (error) return error;
  const unknown = Object.keys(c).filter(k => !['schemaVersion', 'sequenceId', 'generatedAt', 'estimatorRulesetVersion', 'origin', 'estimates'].includes(k)).sort()[0];
  if (unknown) return fail(`connectionContext.${unknown}`);
  for (const [k, ok] of [['sequenceId', typeof c.sequenceId === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(c.sequenceId)], ['generatedAt', iso(c.generatedAt)], ['estimatorRulesetVersion', text(c.estimatorRulesetVersion)], ['estimates', Array.isArray(c.estimates)]]) { error = field(k, ok); if (error) return error; }
  for (const [i, entry] of c.estimates.entries()) {
    const path = `connectionContext.estimates[${i}]`;
    if (!plain(entry)) return fail(path);
    for (const k of ['fromPlaceId', 'toPlaceId']) if (!text(entry[k])) return fail(`${path}.${k}`, !Object.hasOwn(entry, k));
  }
  return null;
}
function validateOrigin(o, spec, data, time) {
  demand(validOriginSnapshot(o, spec.originPlaceId, time), 'origin', 'estimation_input_invalid');
  const old = getPlace(data.places, o.id);
  demand(!old || (['name', 'countryId', 'utcOffsetHours'].every(k => old[k] === o[k]) && ['lat', 'lng'].every(k => old.coordinates[k] === o.coordinates[k])), 'origin.catalogue', 'estimation_input_invalid');
}
const pairKey = (from, to) => JSON.stringify([from, to]);
const serves = (r, from, to) => r.fromPlaceId === from && r.toPlaceId === to || r.direction === 'bidirectional' && r.fromPlaceId === to && r.toPlaceId === from;
export function buildF6Trip(spec, data = PILOT_DATA, options = {}) {
  const c = options.connectionContext;
  if (c === undefined) return buildF5Trip(spec, data, options);
  const early = preflightConnectionContext(c); if (early) return early;
  let input = null;
  let refusedInputs = [];
  const graph = { ...data, connections: [...data.connections], places: data.places instanceof Map ? new Map(data.places) : { ...data.places } };
  try {
    if (c.origin !== undefined) {
      validateOrigin(c.origin, spec, data, c.generatedAt);
      if (graph.places instanceof Map) graph.places.set(c.origin.id, { ...c.origin }); else graph.places[c.origin.id] = { ...c.origin };
    }
    validateCatalogue(graph.connections, options.content ?? PILOT_CONTENT, c.generatedAt);
    const packages = data.routePackages.filter(p => !p.held && (spec.destination?.kind === 'country' ? p.countryId === spec.destination.id : p.placeIds.includes(spec.destination?.id)));
    const edges = p => [[spec.originPlaceId, p.stops[0].placeId], [p.stops.at(-1).placeId, spec.originPlaceId]];
    const permitted = new Set(packages.flatMap(edges).map(([a, b]) => pairKey(a, b)));
    const supplied = new Map();
    for (const entry of c.estimates) {
      input = entry;
      validateEstimate(entry, c.generatedAt);
      const key = pairKey(entry.fromPlaceId, entry.toPlaceId);
      demand(getPlace(graph.places, entry.fromPlaceId) && getPlace(graph.places, entry.toPlaceId) && permitted.has(key) && !supplied.has(key), 'endpoints', 'estimation_input_invalid');
      supplied.set(key, entry);
    }
    input = null;
    // Valid supplied pairs remain attributable when their requested ruleset is unavailable.
    if (c.estimatorRulesetVersion !== ESTIMATOR_VERSION) refusedInputs = [...supplied.values()];
    demand(c.estimatorRulesetVersion === ESTIMATOR_VERSION, 'estimatorRulesetVersion', 'estimation_domain_unsupported');
    // Existing coverage/constraint diagnostics remain authoritative. Only candidate gateway edges can be prepared.
    const candidates = packages.filter(p => (spec.requiredPlaceIds ?? []).every(id => p.placeIds.includes(id)));
    const computed = new Set();
    for (const pkg of candidates) for (const [from, to] of edges(pkg)) {
      const key = pairKey(from, to);
      if (graph.connections.some(r => serves(r, from, to)) || computed.has(key)) continue;
      input = supplied.get(key); if (!input) continue;
      graph.connections.push(estimateConnection(input, { ...c, originSnapshot: c.origin ?? null })); computed.add(key);
    }
    input = null;
    const result = buildF5Trip(spec, graph, options);
    if (!result.ok) {
      const assessedIds = new Set([...(result.detail?.supportedRanges ?? []).map(r => r.routePackageId),
        ...(result.options ?? []).filter(o => o.action === 'alternate_route').map(o => o.routePackageId)]);
      const entries = [];
      for (const routePackageId of assessedIds) {
        const pkg = candidates.find(p => p.id === routePackageId);
        for (const [from, to] of pkg ? edges(pkg) : []) {
          const row = graph.connections.find(r => r.derivation === 'estimated' && serves(r, from, to));
          if (row) entries.push(estimatedEntry(row, null, options.bufferRuleset, pkg.id));
        }
      }
      return entries.length ? { ...result, evidence: { rulesetVersion: EVIDENCE_VERSION, generatedAt: c.generatedAt, entries } } : result;
    }
    const trip = decorateConnections(result.value.trip, graph, { ...options, generatedAt: c.generatedAt, content: options.content ?? PILOT_CONTENT });
    if (!trip.evidence) return result;
    const sequence = tripSequenceFromTrip(trip, { id: c.sequenceId, data: graph });
    demand(checkTripSequence(sequence, { data: graph }).length === 0, 'sequence');
    return { ok: true, value: { ...result.value, trip, sequence } };
  } catch (err) {
    if (!err.reason) throw err;
    const entries = (input ? [input] : refusedInputs).map(input => ({ code: 'connection_estimation_refused', scope: 'connection', refId: `est:${c.estimatorRulesetVersion}:${encodeURIComponent(input.fromPlaceId)}:${encodeURIComponent(input.toPlaceId)}`,
      values: { blockId: null, fromPlaceId: input.fromPlaceId, toPlaceId: input.toPlaceId, recordedText: 'Supplied transport facts could not be used.', estimatorRulesetVersion: c.estimatorRulesetVersion, field: err.field ?? null, reason: err.reason, suppliedPair: { fromPlaceId: input.fromPlaceId, toPlaceId: input.toPlaceId } } }));
    return { ok: false, state: 'route_not_supported', message: 'This plan needs valid, supported transport information.', options: [{ action: 'check_back_later', detail: 'Check the supplied transport information.' }], detail: { reason: err.reason, field: err.field ?? null }, evidence: { rulesetVersion: EVIDENCE_VERSION, generatedAt: c.generatedAt, entries } };
  }
}
