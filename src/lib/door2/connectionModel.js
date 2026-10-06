// F6 opted-in connection contracts. Legacy rows are deliberately untouched.
export const MODES = ['flight_international', 'flight_domestic', 'train', 'road_private_transfer', 'coach_scheduled', 'local_shuttle', 'ferry'];
export const plain = v => v !== null && typeof v === 'object' && !Array.isArray(v) && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);
export const text = v => typeof v === 'string' && v.length > 0 && v.trim() === v;
export const finite = (v, min = 0) => typeof v === 'number' && Number.isFinite(v) && v >= min;
export const iso = v => typeof v === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
export const https = v => { try { const u = new URL(v); return typeof v === 'string' && u.protocol === 'https:' && !!u.hostname; } catch { return false; } };
export const exact = (v, required, optional = []) => plain(v) && required.every(k => Object.hasOwn(v, k)) && Object.keys(v).every(k => [...required, ...optional].includes(k));
export function demand(ok, field, reason = 'connection_content_invalid') { if (!ok) { const e = new Error(`${reason}: ${field}`); Object.assign(e, { reason, field }); throw e; } }
export const featureRow = c => !!c && (c.reverse !== undefined || c.derivation === 'estimated' || (c.experiences?.length > 0));
export function validateConnection(c) {
  if (!['reverse', 'derivation', 'transfers', 'experiences'].some(k => Object.hasOwn(c, k))) return;
  demand(c.derivation === undefined || ['curated', 'estimated'].includes(c.derivation), 'derivation');
  demand(MODES.includes(c.mode), 'mode');
  demand(['oneway', 'bidirectional'].includes(c.direction), 'direction');
  for (const end of ['origin', 'destination']) demand(!c.localTransferHours || !Object.hasOwn(c.localTransferHours, end) || finite(c.localTransferHours[end]), `localTransferHours.${end}`);
  const direction = (movement, segments, layover, transfers, field) => {
    demand(finite(movement) && movement > 0, `${field}.durationHours`);
    demand(segments == null || (Array.isArray(segments) && segments.length > 0 && segments.every(s => exact(s, ['mode', 'inVehicleHours'], ['typicalRangeHours']) && MODES.includes(s.mode) && finite(s.inVehicleHours) && s.inVehicleHours > 0)), `${field}.segments`);
    demand(!segments || Math.abs(segments.reduce((n, s) => n + s.inVehicleHours, 0) - movement) <= 1e-9, `${field}.segments.sum`);
    demand(finite(layover) && (segments || layover === 0), `${field}.layoverHours`);
    demand(transfers === undefined || (Number.isInteger(transfers) && transfers === (segments ? segments.length - 1 : 0)), `${field}.transfers`);
  };
  if (Object.hasOwn(c, 'layoverHours')) demand(finite(c.layoverHours), 'forward.layoverHours');
  direction(c.inVehicleHours, c.segments, c.layoverHours ?? 0, c.transfers, 'forward');
  if (c.reverse !== undefined) {
    demand(c.direction === 'bidirectional' && exact(c.reverse, ['durationHours'], ['segments', 'layoverHours', 'transfers']), 'reverse');
    const r = c.reverse;
    for (const key of ['layoverHours', 'transfers']) if (Object.hasOwn(r, key)) demand(finite(r[key]), `reverse.${key}`);
    direction(r.durationHours, Object.hasOwn(r, 'segments') ? r.segments : c.segments, r.layoverHours ?? c.layoverHours ?? 0, r.transfers, 'reverse');
  }
  if (c.derivation === 'estimated') demand(!Object.hasOwn(c, 'experiences') && !Object.hasOwn(c, 'reverse'), 'estimated.experiences');
}
export function validateExperience(x, owner, generatedAt) {
  demand(exact(x, ['id', 'title', 'description', 'appliesTo', 'timeCost', 'review', 'provenance']), 'experience');
  demand(text(x.id) && /^cx_[A-Za-z0-9._:-]+$/.test(x.id), 'experience.id');
  demand(text(x.title) && text(x.description), 'experience.text');
  demand(['forward', 'reverse', 'both'].includes(x.appliesTo) && !(x.appliesTo === 'reverse' && owner.direction !== 'bidirectional'), 'experience.appliesTo');
  demand(['within_connection', 'requires_additional'].includes(x.timeCost), 'experience.timeCost');
  const r = x.review;
  demand(exact(r, ['status', 'reviewedBy', 'reviewedAt', 'sourceUrl']) && ['approved', 'pending_review', 'rejected'].includes(r.status) && https(r.sourceUrl), 'experience.review');
  demand((r.reviewedBy === null || text(r.reviewedBy)) && (r.reviewedAt === null || (iso(r.reviewedAt) && r.reviewedAt <= generatedAt)), 'experience.review.metadata');
  if (r.status === 'approved') demand(text(r.reviewedBy) && iso(r.reviewedAt), 'experience.review.approval');
  demand(exact(x.provenance, ['sourceBundleId', 'sourceTemplateTitle', 'sourceFragmentId']) && Object.values(x.provenance).every(text), 'experience.provenance');
}
export function resolveExperiences(c, from, generatedAt) {
  const experiences = [], deferredExperiences = [];
  for (const x of c.experiences ?? []) {
    validateExperience(x, c, generatedAt);
    const direction = from === c.fromPlaceId ? 'forward' : 'reverse';
    const reason = !text(c.reviewedBy) || !iso(c.reviewedAt) || c.reviewedAt > generatedAt ? 'owner_unreviewed'
      : x.review.status !== 'approved' ? x.review.status
      : x.appliesTo !== 'both' && x.appliesTo !== direction ? 'direction_mismatch'
      : x.timeCost === 'requires_additional' ? 'additional_time_not_modelled' : null;
    if (reason) deferredExperiences.push({ id: x.id, reason }); else experiences.push(x);
  }
  return { experiences, deferredExperiences };
}
export function validateCatalogue(connections, content, generatedAt) {
  const ids = new Set(), triples = new Set();
  const triple = p => p && [p.sourceBundleId, p.sourceTemplateTitle, p.sourceFragmentId].every(text) ? JSON.stringify([p.sourceBundleId, p.sourceTemplateTitle, p.sourceFragmentId]) : null;
  for (const item of content ?? []) { const key = triple(item.provenance); if (key) triples.add(key); }
  for (const c of connections) {
    validateConnection(c);
    if (c.experiences !== undefined) demand(Array.isArray(c.experiences), 'experiences');
    for (const x of c.experiences ?? []) {
      validateExperience(x, c, generatedAt);
      const key = triple(x.provenance);
      demand(!ids.has(x.id) && !triples.has(key), 'experience.duplicate');
      ids.add(x.id); triples.add(key);
    }
  }
}

/** Same source-backed Place contract on request and saved evidence; no graph access. */
export function validOriginSnapshot(o, originId, time) {
  return exact(o, ['id', 'name', 'aliases', 'countryId', 'coordinates', 'visitKind', 'utcOffsetHours', 'sourceUrl', 'observedAt', 'offsetBasis']) &&
    o.id === originId && text(o.id) && text(o.name) && text(o.countryId) && Array.isArray(o.aliases) && o.aliases.every(text) &&
    ['base', 'gateway', 'attraction'].includes(o.visitKind) && exact(o.coordinates, ['lat', 'lng']) &&
    finite(o.coordinates.lat, -90) && o.coordinates.lat <= 90 && finite(o.coordinates.lng, -180) && o.coordinates.lng <= 180 &&
    finite(o.utcOffsetHours, -14) && o.utcOffsetHours <= 14 && Number.isInteger(o.utcOffsetHours * 60) &&
    https(o.sourceUrl) && iso(o.observedAt) && o.observedAt <= time && o.offsetBasis === 'fixed-pilot';
}
