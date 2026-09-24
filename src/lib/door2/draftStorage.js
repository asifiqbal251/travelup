import { PILOT_ROUTE_PACKAGES_ALL } from './pilotData.js';
import { makeRoutePlan } from './routePlan.js';

const STORAGE_KEY = 'door2_drafts_v1';
const SUPPORTED_SCHEMAS = ['door2-v5', 'door2-v6'];

function readAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(drafts) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts));
}

export function isSchemaSupported(versions) {
  return SUPPORTED_SCHEMAS.includes(versions?.schema);
}

export function listDraftTrips() {
  return readAll().slice().sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

export function saveDraftTrip(trip, label) {
  const drafts = readAll();
  const id = `d2draft_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const entry = { id, label, savedAt: new Date().toISOString(), trip };
  writeAll([...drafts, entry]);
  return id;
}

export function loadDraftTrip(id) {
  const entry = readAll().find((d) => d.id === id);
  if (!entry) return { compatible: false, reason: 'Draft not found.' };
  if (!isSchemaSupported(entry.trip?.versions)) {
    const schema = entry.trip?.versions?.schema ?? 'unknown';
    return { compatible: false, reason: `Built with schema "${schema}" — can't be reopened here.` };
  }
  if (entry.trip.versions.schema === 'door2-v5') return upgradeV5toV6(entry.trip);
  return { compatible: true, trip: entry.trip };
}

// ---------------------------------------------------------------------------
// v5 → v6 (Route Families, design §7). Adds trip.routePlan and maps the old
// Huaraz package's stop keys to family keys (ph_* → pc_*, ph_lima_mid →
// pc_lima_hub) in stop keys, block ids, anchors and gap records. It NEVER
// regenerates the trip: days, times and activities are kept as saved.

const UPGRADE_FAILED = (what) => ({ compatible: false, reason: `Built with an older route (${what}) — can't be reopened here.` });

const mapStopKey = (key) => (key === 'ph_lima_mid' ? 'pc_lima_hub' : key.replace(/^ph_/, 'pc_'));
const mapIdString = (s) =>
  s.replace(/(?<![a-z0-9_])ph_lima_mid(?![a-z0-9_])/g, 'pc_lima_hub').replace(/(?<![a-z0-9_])ph_/g, 'pc_');

class UpgradeError extends Error {}

function upgradeOne(trip, packages) {
  const fail = (what) => {
    throw new UpgradeError(what);
  };
  if (!trip || typeof trip !== 'object') fail('not a trip');
  if (trip.versions?.schema !== 'door2-v5') fail(`schema "${trip.versions?.schema}"`);
  const spec = trip.spec;
  if (!spec || typeof spec.routeTemplateId !== 'string' || !Array.isArray(spec.stops) || !Array.isArray(trip.days)) fail('incomplete trip');
  if (!Number.isInteger(spec.totalDays) || spec.totalDays !== trip.days.length) fail('day count');

  const oldTemplate = spec.routeTemplateId;
  const pkg = packages.find((p) => p.id === oldTemplate) ?? packages.find((p) => (p.aliases ?? []).includes(oldTemplate));
  if (!pkg) fail(`"${oldTemplate}"`);

  const stops = spec.stops.map((s) => ({ ...s, id: mapStopKey(String(s.id)) }));
  if (stops.map((s) => s.id).join('|') !== pkg.stops.map((s) => s.id).join('|')) fail(`"${oldTemplate}" stops`);
  const overMaxAllowed = (trip.warnings ?? []).includes('nights_above_package_max');
  let extra = 0;
  pkg.stops.forEach((p, i) => {
    const n = stops[i].nights;
    if (stops[i].placeId !== p.placeId) fail(`"${p.id}" place`);
    if (!Number.isInteger(n) || n < p.minNights || (n > p.maxNights && !overMaxAllowed)) fail(`"${p.id}" nights`);
    extra += n - p.minNights;
  });
  // Night allocation is linear (design §1.1): totalDays = minDays + Σ(n − min).
  const minDays = spec.totalDays - extra;
  if (minDays < 1) fail('night allocation');

  const mapBlock = (b) => ({
    ...b,
    id: mapIdString(String(b.id)),
    anchor: b.anchor ? { ...b.anchor, stopId: b.anchor.stopId == null ? b.anchor.stopId : mapStopKey(String(b.anchor.stopId)) } : b.anchor
  });
  const days = trip.days.map((d) => ({ ...d, blocks: (d.blocks ?? []).map(mapBlock) }));
  const legs = days.flatMap((d) => d.blocks).filter((b) => b.type === 'travel' && b.id.startsWith('tr:'));
  if (legs.length !== pkg.stops.length + 1) fail('route legs');

  const routePlan = makeRoutePlan({
    pkg,
    stops: pkg.stops.map((p, i) => ({
      key: p.id,
      placeId: p.placeId,
      nights: stops[i].nights,
      minNights: p.minNights,
      maxNights: p.maxNights,
      isRequired: stops[i].isRequired === true,
      excursions: p.excursions
    })),
    connectionIds: legs.map((b) => b.transport.connectionId),
    minDays,
    source: 'authored',
    nightsSource: 'auto'
  });

  const suffix = `:${oldTemplate}`;
  const upgraded = {
    ...trip,
    id: typeof trip.id === 'string' && trip.id.endsWith(suffix) ? trip.id.slice(0, -suffix.length) + `:${pkg.id}` : trip.id,
    spec: { ...spec, routeTemplateId: pkg.id, stops },
    routePlan,
    days,
    versions: { ...trip.versions, schema: 'door2-v6' },
    history: (trip.history ?? []).map((h) => upgradeOne(h, packages))
  };
  if (Array.isArray(trip.contentGaps)) {
    upgraded.contentGaps = trip.contentGaps.map((g) => ({ ...g, blockId: mapIdString(String(g.blockId)) }));
  }
  return upgraded;
}

/**
 * Upgrades a saved door2-v5 trip to door2-v6 without regenerating it.
 * @param {Object} trip
 * @param {Object[]} [packages]  Every compiled variant (held included) plus aliases.
 * @returns {{compatible: true, trip: Object} | {compatible: false, reason: string}}
 */
export function upgradeV5toV6(trip, packages = PILOT_ROUTE_PACKAGES_ALL) {
  try {
    return { compatible: true, trip: upgradeOne(trip, packages) };
  } catch (err) {
    if (err instanceof UpgradeError) return UPGRADE_FAILED(err.message);
    return UPGRADE_FAILED('unreadable');
  }
}

export function deleteDraftTrip(id) {
  writeAll(readAll().filter((d) => d.id !== id));
}
