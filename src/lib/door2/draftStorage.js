import { PILOT_ROUTE_PACKAGES_ALL } from './pilotData.js';
import { makeRoutePlan } from './routePlan.js';

const STORAGE_KEY = 'door2_drafts_v1';
const SUPPORTED_SCHEMAS = ['door2-v5', 'door2-v6'];
// Envelope version 2 (F4 persistence, Stage A): read, and written only to preserve a
// door2-v7 payload the reader handed out (Stage A.2). Stage A never creates a v7 payload:
// a newly built trip is door2-v6 and is saved in the legacy envelope.
const ENVELOPE_VERSION = 2;
const ENVELOPE_SCHEMA = 'door2-v7';

/**
 * Reads the stored draft list without ever writing it.
 * 'empty' — no key. 'unreadable' — the stored value can't be read, doesn't parse, or
 * parses to a non-array; its bytes are left exactly as they are. 'ok' — an array,
 * which may still hold malformed entries (see isListable).
 * @returns {{status: 'empty' | 'ok' | 'unreadable', drafts: any[]}}
 */
function readStore() {
  let raw;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    return { status: 'unreadable', drafts: [] };
  }
  if (raw === null) return { status: 'empty', drafts: [] };
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? { status: 'ok', drafts: parsed } : { status: 'unreadable', drafts: [] };
  } catch {
    return { status: 'unreadable', drafts: [] };
  }
}

function writeAll(drafts) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts));
}

export function isSchemaSupported(versions) {
  return SUPPORTED_SCHEMAS.includes(versions?.schema);
}

/** 'empty' | 'ok' | 'unreadable' — lets the page tell "no drafts" from "drafts it can't read". */
export function draftStorageStatus() {
  return readStore().status;
}

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isNonEmptyString = (v) => typeof v === 'string' && v !== '';

// An entry is listed (and can be opened) only if it is an object with a usable id and
// savedAt. Anything else is skipped, never thrown on, and left in storage.
const isListable = (d) => isObject(d) && isNonEmptyString(d.id) && isNonEmptyString(d.savedAt);

export function listDraftTrips() {
  return readStore().drafts.filter(isListable).sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

/** Thrown by saveDraftTrip when the stored draft list can't be read; nothing is written. */
export class DraftStorageUnreadableError extends Error {
  constructor() {
    super("Saved trips couldn't be read from this browser's storage, so nothing was saved.");
    this.name = 'DraftStorageUnreadableError';
  }
}

// Readability is checked from current storage on every save: writing over a store that
// can't be read would destroy its bytes. A door2-v7 payload is kept in envelope version 2,
// the only envelope that reopens it; the trip itself is stored as handed in, never rewritten.
export function saveDraftTrip(trip, label) {
  const store = readStore();
  if (store.status === 'unreadable') throw new DraftStorageUnreadableError();
  const id = `d2draft_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const savedAt = new Date().toISOString();
  const entry =
    trip?.versions?.schema === ENVELOPE_SCHEMA
      ? { envelopeVersion: ENVELOPE_VERSION, id, label, savedAt, trip }
      : { id, label, savedAt, trip };
  writeAll([...store.drafts, entry]);
  return id;
}

/** The label to show for a listed draft: its stored label when that is a usable string,
 * otherwise a fallback. Display only — the stored entry is never touched. */
export function draftDisplayLabel(entry) {
  return typeof entry?.label === 'string' && entry.label.trim() !== '' ? entry.label : 'Untitled trip';
}

// A refusal names the draft from envelope metadata only, never from inside trip.
function draftName(entry) {
  if (isNonEmptyString(entry.destinationLabel)) return entry.destinationLabel;
  if (isNonEmptyString(entry.label)) return entry.label;
  return `The draft saved ${entry.savedAt}`;
}

const refuse = (entry, why) => ({ compatible: false, reason: `"${draftName(entry)}" can't be reopened here — ${why}.` });

export function loadDraftTrip(id) {
  const store = readStore();
  if (store.status === 'unreadable') {
    return { compatible: false, reason: "Saved trips couldn't be read from this browser's storage." };
  }
  const entry = store.drafts.find((d) => isListable(d) && d.id === id);
  if (!entry) return { compatible: false, reason: 'Draft not found.' };
  if (Object.hasOwn(entry, 'envelopeVersion')) return loadEnvelope(entry);
  if (!isSchemaSupported(entry.trip?.versions)) {
    const schema = entry.trip?.versions?.schema ?? 'unknown';
    return { compatible: false, reason: `Built with schema "${schema}" — can't be reopened here.` };
  }
  if (entry.trip.versions.schema === 'door2-v5') return upgradeV5toV6(entry.trip);
  return { compatible: true, trip: entry.trip };
}

// Envelope version 2 only — exactly 2, not "2 or later". The payload is inspected to
// establish compatibility and returned as saved; it is never scheduled or repaired.
function loadEnvelope(entry) {
  if (entry.envelopeVersion !== ENVELOPE_VERSION) return refuse(entry, "it was saved in a format this version doesn't recognise");
  if (entry.trip?.versions?.schema !== ENVELOPE_SCHEMA) return refuse(entry, "its saved format and trip version don't match");
  const failed = v7ShapeFailure(entry.trip);
  if (failed) return refuse(entry, `its saved trip is incomplete (${failed})`);
  return { compatible: true, trip: entry.trip };
}

const isInt = Number.isInteger;
const isPositiveInt = (n) => isInt(n) && n > 0;

/**
 * The required shape of a door2-v7 payload (build brief §3). history and contentGaps
 * are not required. Returns the name of the first failing field, or null.
 * @returns {string | null}
 */
function v7ShapeFailure(trip) {
  if (!isObject(trip)) return 'trip';
  const { versions: v, spec, routePlan: rp, days } = trip;
  if (!isObject(v) || v.schema !== ENVELOPE_SCHEMA) return 'versions.schema';
  for (const k of ['engine', 'content', 'routeData', 'bufferRuleset']) if (typeof v[k] !== 'string') return `versions.${k}`;

  if (!isObject(spec)) return 'spec';
  if (!isPositiveInt(spec.totalDays)) return 'spec.totalDays';
  if (spec.destination == null) return 'spec.destination';
  if (!isObject(spec.choices)) return 'spec.choices';
  for (const k of ['pinned', 'rejected', 'placed']) if (!Array.isArray(spec.choices[k])) return `spec.choices.${k}`;

  if (!isObject(rp)) return 'routePlan';
  if (typeof rp.variantId !== 'string') return 'routePlan.variantId';
  if (!Array.isArray(rp.stops) || rp.stops.length === 0 || !rp.stops.every(isObject)) return 'routePlan.stops';
  if (!rp.stops.every((s) => typeof s.key === 'string')) return 'routePlan.stops.key';
  if (!rp.stops.every((s) => typeof s.placeId === 'string')) return 'routePlan.stops.placeId';
  if (!rp.stops.every((s) => isInt(s.nights))) return 'routePlan.stops.nights';
  if (!Array.isArray(rp.connectionIds)) return 'routePlan.connectionIds';
  if (!isInt(rp.minDays)) return 'routePlan.minDays';
  if (!isInt(rp.maxDays)) return 'routePlan.maxDays';

  if (!Array.isArray(days) || !days.every(isObject)) return 'days';
  if (days.length !== spec.totalDays) return 'days.length';
  if (!days.every((d) => isInt(d.dayNumber))) return 'days.dayNumber';
  if (!days.every((d) => Array.isArray(d.blocks) && d.blocks.every(isObject))) return 'days.blocks';
  const blocks = days.flatMap((d) => d.blocks);
  if (!blocks.every((b) => typeof b.id === 'string')) return 'days.blocks.id';
  if (!blocks.every((b) => typeof b.type === 'string')) return 'days.blocks.type';

  if (typeof trip.status !== 'string') return 'status';
  if (!Array.isArray(trip.warnings)) return 'warnings';
  return null;
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

// Removes only a listable entry with this id; malformed entries are skipped, never
// thrown on, and left in storage. Nothing matched means nothing is written.
export function deleteDraftTrip(id) {
  const { drafts } = readStore();
  const kept = drafts.filter((d) => !(isListable(d) && d.id === id));
  if (kept.length !== drafts.length) writeAll(kept);
}
