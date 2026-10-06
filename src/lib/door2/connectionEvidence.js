import { DEFAULT_BUFFER_RULESET, computeUsableTimeLost, orientConnection } from './bufferRuleset.js';
import { ESTIMATOR_VERSION, ESTIMATE_LIMITATIONS, estimatedFacts, validateEstimate } from './connectionEstimator.js';
import { demand, exact, featureRow, finite, iso, plain, resolveExperiences, text, validateCatalogue, validateExperience, validOriginSnapshot } from './connectionModel.js';

export const EVIDENCE_VERSION = 'f6-evidence@1';
export const ESTIMATED_REBUILD_MESSAGE = 'This trip uses estimated transport. Changing its route or length needs a new plan; your saved trip is unchanged.';
export const READ_ONLY_NOTICE = 'This trip has a newer version of recorded reasons. You can view it, but editing and saving a new copy are unavailable.';
const clone = v => JSON.parse(JSON.stringify(v));
const travel = trip => (trip?.days ?? []).flatMap(d => d.blocks ?? []).filter(b => b.type === 'travel');
const marked = b => b.transport?.derivation === 'estimated' || b.provenance?.source === 'estimated' || b.transport?.connectionId?.startsWith('est:');
export const hasEvidence = trip => trip?.evidence !== undefined || trip?.versions?.connectionEvidence !== undefined || travel(trip).some(marked);
export const hasEstimates = trip => travel(trip).some(marked) || trip?.evidence?.entries?.some(e => e.code === 'connection_estimated');
const finiteJson = (v, seen = new Set()) => {
  if (v === null || typeof v === 'string' || typeof v === 'boolean') return true;
  if (typeof v === 'number') return Number.isFinite(v);
  if ((!plain(v) && !Array.isArray(v)) || seen.has(v)) return false;
  seen.add(v); const ok = Object.values(v).every(x => finiteJson(x, seen)); seen.delete(v); return ok;
};
export function connectionTiming(c, rules = DEFAULT_BUFFER_RULESET) {
  const usable = computeUsableTimeLost(c, rules);
  return { inVehicleHours: c.segments?.length ? c.segments.reduce((n, s) => n + s.inVehicleHours, 0) : c.inVehicleHours,
    layoverHours: c.layoverHours ?? 0, transfers: c.segments?.length ? c.segments.length - 1 : 0,
    localTransferHours: { origin: c.localTransferHours?.origin ?? rules.localTransferDefault.eachEndHours, destination: c.localTransferHours?.destination ?? rules.localTransferDefault.eachEndHours },
    computedUsableTimeLost: usable, roundedMinutes: Math.round(usable * 60) };
}
export function estimatedEntry(row, blockId, rules, assessedRoutePackageId) {
  const facts = estimatedFacts(row);
  demand(facts, 'evidence.admission');
  return { code: 'connection_estimated', scope: 'connection', refId: row.id, values: {
    blockId, fromPlaceId: row.fromPlaceId, toPlaceId: row.toPlaceId,
    recordedText: 'Approximate flight time from supplied service facts; no timetable, wind or ground-delay calibration. Fixed local offsets.',
    estimatorRulesetVersion: ESTIMATOR_VERSION, ...clone(facts), timing: connectionTiming(row, rules), limitations: [...ESTIMATE_LIMITATIONS],
    ...(assessedRoutePackageId ? { assessedRoutePackageId } : {})
  } };
}
export function decorateConnections(trip, data, { generatedAt, content = [], bufferRuleset = DEFAULT_BUFFER_RULESET } = {}) {
  const blocks = travel(trip);
  if (!blocks.some(b => featureRow(data.connections.find(c => c.id === b.transport.connectionId)))) return trip;
  demand(iso(generatedAt), 'generatedAt', 'connection_context_required');
  validateCatalogue(data.connections, content, generatedAt);
  const entries = [];
  for (const b of blocks) {
    const t = b.transport, row = data.connections.find(c => c.id === t.connectionId);
    if (!featureRow(row)) continue;
    if (row.derivation === 'estimated') entries.push(estimatedEntry(row, b.id, bufferRuleset));
    else {
      const oriented = orientConnection(row, t.fromPlaceId, t.toPlaceId);
      demand(oriented, 'evidence.direction');
      entries.push({ code: 'connection_curated', scope: 'connection', refId: row.id, values: {
        blockId: b.id, fromPlaceId: t.fromPlaceId, toPlaceId: t.toPlaceId, recordedText: 'Curated transport timing and reviewed connection experiences.',
        timing: connectionTiming(oriented, bufferRuleset),
        ownerFacts: { fromPlaceId: row.fromPlaceId, toPlaceId: row.toPlaceId, direction: row.direction, derivation: 'curated', reviewedBy: row.reviewedBy ?? null, reviewedAt: row.reviewedAt ?? null },
        direction: row.fromPlaceId === t.fromPlaceId ? 'forward' : 'reverse', ...clone(resolveExperiences(row, t.fromPlaceId, generatedAt))
      } });
    }
  }
  const result = { ...trip, evidence: { rulesetVersion: EVIDENCE_VERSION, generatedAt, entries }, versions: { ...trip.versions, connectionEvidence: EVIDENCE_VERSION } };
  const checked = inspectEvidence(result);
  demand(checked.ok, checked.field ?? 'evidence');
  return result;
}
// Stored evidence is checked without current graph lookups or runtime admission.
export function inspectEvidence(trip) {
  if (!hasEvidence(trip)) return { ok: true, legacy: true };
  let field = 'evidence';
  const check = (ok, path) => { field = path; if (!ok) throw new Error(path); };
  try {
    const e = trip.evidence;
    check(exact(e, ['rulesetVersion', 'generatedAt', 'entries']) && text(e.rulesetVersion) && iso(e.generatedAt) && Array.isArray(e.entries) && finiteJson(e), 'evidence');
    check(trip.versions?.connectionEvidence === e.rulesetVersion, 'versions.connectionEvidence');
    const known = e.rulesetVersion === EVIDENCE_VERSION;
    if (known) check(e.entries.length > 0, 'evidence.entries');
    const used = new Set(), experienceOwners = new Map(), fragmentOwners = new Map();
    for (const [i, entry] of e.entries.entries()) {
      const path = `evidence.entries[${i}]`, v = entry?.values;
      check(exact(entry, ['code', 'scope', 'refId', 'values']) && text(entry.code) && entry.scope === 'connection' && text(entry.refId) && plain(v), path);
      check((v.blockId === null || text(v.blockId)) && text(v.fromPlaceId) && text(v.toPlaceId) && text(v.recordedText), `${path}.values`);
      if (!known) continue;
      const common = ['blockId', 'fromPlaceId', 'toPlaceId', 'recordedText', 'timing'];
      check(['connection_estimated', 'connection_curated'].includes(entry.code), `${path}.code`);
      check(text(v.blockId) && !used.has(v.blockId), `${path}.values.blockId`); used.add(v.blockId);
      const b = travel(trip).find(b => b.id === v.blockId), t = b?.transport;
      check(t && t.connectionId === entry.refId && t.fromPlaceId === v.fromPlaceId && t.toPlaceId === v.toPlaceId, `${path}.occurrence`);
      const timing = v.timing;
      check(exact(timing, ['inVehicleHours', 'layoverHours', 'transfers', 'localTransferHours', 'computedUsableTimeLost', 'roundedMinutes']) && finite(timing.inVehicleHours) && timing.inVehicleHours > 0 && finite(timing.layoverHours) && Number.isInteger(timing.transfers) && timing.transfers >= 0 && exact(timing.localTransferHours, ['origin', 'destination']) && Object.values(timing.localTransferHours).every(n => finite(n)) && finite(timing.computedUsableTimeLost) && timing.roundedMinutes === Math.round(timing.computedUsableTimeLost * 60), `${path}.timing`);
      check(timing.inVehicleHours === t.inVehicleHours && timing.layoverHours === (t.layoverHours ?? 0) && timing.computedUsableTimeLost === t.computedUsableTimeLost && timing.roundedMinutes / 60 === b.durationHours, `${path}.timing.block`);
      if (entry.code === 'connection_estimated') {
        check(exact(v, [...common, 'estimatorRulesetVersion', 'inputs', 'originSnapshot', 'limitations']), `${path}.values`);
        check(marked(b) && t.derivation === 'estimated' && t.estimatorRulesetVersion === ESTIMATOR_VERSION && b.provenance?.source === 'estimated' && b.provenance.reviewed === false && b.provenance.confidence === 'low', `${path}.derivation`);
        check(v.estimatorRulesetVersion === ESTIMATOR_VERSION && entry.refId === `est:${ESTIMATOR_VERSION}:${encodeURIComponent(v.fromPlaceId)}:${encodeURIComponent(v.toPlaceId)}` && JSON.stringify(v.limitations) === JSON.stringify(ESTIMATE_LIMITATIONS), `${path}.ruleset`);
        field = `${path}.inputs`; validateEstimate(v.inputs, e.generatedAt);
        check(v.inputs.fromPlaceId === v.fromPlaceId && v.inputs.toPlaceId === v.toPlaceId && v.inputs.mode === t.mode && v.inputs.segments.length - 1 === timing.transfers && v.inputs.layoverHours === timing.layoverHours && ['origin', 'destination'].every(k => v.inputs.localTransferHours[k] === timing.localTransferHours[k]), `${path}.inputs.timing`);
        check(v.originSnapshot === null || validOriginSnapshot(v.originSnapshot, trip.spec.originPlaceId, e.generatedAt), `${path}.originSnapshot`);
      } else {
        check(exact(v, [...common, 'ownerFacts', 'direction', 'experiences', 'deferredExperiences']) && !marked(b), `${path}.values`);
        const o = v.ownerFacts;
        check(exact(o, ['fromPlaceId', 'toPlaceId', 'direction', 'derivation', 'reviewedBy', 'reviewedAt']) && text(o.fromPlaceId) && text(o.toPlaceId) && ['oneway', 'bidirectional'].includes(o.direction) && o.derivation === 'curated' && (o.reviewedBy === null || text(o.reviewedBy)) && (o.reviewedAt === null || iso(o.reviewedAt)), `${path}.ownerFacts`);
        check(['forward', 'reverse'].includes(v.direction) && (v.direction === 'forward' ? o.fromPlaceId === v.fromPlaceId && o.toPlaceId === v.toPlaceId : o.direction === 'bidirectional' && o.fromPlaceId === v.toPlaceId && o.toPlaceId === v.fromPlaceId), `${path}.direction`);
        check(Array.isArray(v.experiences) && Array.isArray(v.deferredExperiences), `${path}.experiences`);
        const ids = new Set(), triples = new Set();
        for (const x of v.experiences) {
          field = `${path}.experiences`; validateExperience(x, o, e.generatedAt);
          const key = JSON.stringify([x.provenance.sourceBundleId, x.provenance.sourceTemplateTitle, x.provenance.sourceFragmentId]);
          const owner = JSON.stringify([entry.refId, o, x]);
          check((!experienceOwners.has(x.id) || experienceOwners.get(x.id) === owner) && (!fragmentOwners.has(key) || fragmentOwners.get(key) === owner), `${path}.experiences.provenance`);
          experienceOwners.set(x.id, owner); fragmentOwners.set(key, owner);
          check(!ids.has(x.id) && !triples.has(key), `${path}.experiences.duplicate`); ids.add(x.id); triples.add(key);
          check(resolveExperiences({ ...o, experiences: [x] }, v.fromPlaceId, e.generatedAt).experiences.length === 1, `${path}.experiences.eligibility`);
        }
        for (const x of v.deferredExperiences) {
          check(exact(x, ['id', 'reason']) && text(x.id) && !ids.has(x.id) && ['owner_unreviewed', 'pending_review', 'rejected', 'direction_mismatch', 'additional_time_not_modelled'].includes(x.reason), `${path}.deferredExperiences`); ids.add(x.id);
        }
      }
    }
    if (known) for (const b of travel(trip).filter(b => marked(b) || e.entries.some(entry => entry.refId === b.transport?.connectionId))) check(used.has(b.id), `evidence.missing.${b.id}`);
    return { ok: true, readOnly: !known, ...(known ? {} : { notice: READ_ONLY_NOTICE }) };
  } catch { return { ok: false, field, reason: 'evidence_invalid', message: 'This trip has incomplete saved evidence and cannot be displayed or edited.' }; }
}
export function editEvidenceGuard(trip) {
  const status = inspectEvidence(trip);
  if (!status.ok) return { ok: false, reason: 'evidence_invalid', message: status.message, proposals: [] };
  if (status.readOnly) return { ok: false, reason: 'evidence_version_unsupported', message: READ_ONLY_NOTICE, proposals: [] };
  return null;
}
export function structuralEvidenceGuard(trip) {
  return editEvidenceGuard(trip) ?? (hasEstimates(trip) ? { ok: false, reason: 'estimated_transport_rebuild_unavailable', message: ESTIMATED_REBUILD_MESSAGE, proposals: [] } : null);
}
export function connectionDisplay(trip, block) {
  const status = inspectEvidence(trip);
  if (!status.ok) return { error: status.message, experiences: [] };
  if (status.readOnly) return { experiences: [], readOnly: true };
  const entry = trip?.evidence?.entries.find(e => e.values.blockId === block.id && e.refId === block.transport?.connectionId);
  return { experiences: entry?.code === 'connection_curated' ? entry.values.experiences : [], estimated: entry?.code === 'connection_estimated' };
}
