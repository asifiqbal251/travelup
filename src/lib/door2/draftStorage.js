import { inspectEvidence } from './connectionEvidence.js';
const STORAGE_KEY = 'door2_drafts_v1';
// Schemas the unversioned (legacy) envelope still opens. door2-v5 left this set in Stage B:
// a v5 draft is refused by name and kept in storage, never deleted or upgraded on read.
const SUPPORTED_SCHEMAS = ['door2-v6'];
// Envelope version 2 (F4 persistence, Stage B): every save writes it, with a door2-v7
// payload. door2-v7 is a storage-layer schema — the engine and the bridge still emit
// door2-v6, and only saveDraftTrip stamps v7, on a copy.
const ENVELOPE_VERSION = 2;
const ENVELOPE_SCHEMA = 'door2-v7';
// What saveDraftTrip accepts as input; anything else is refused before any write.
const SAVABLE_SCHEMAS = ['door2-v6', ENVELOPE_SCHEMA];

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

/**
 * Thrown by saveDraftTrip when the trip itself can't be stored as a draft that reopens;
 * nothing is written. check 'schema': the input is neither door2-v6 nor door2-v7 (schema
 * holds what it was). check 'shape': the door2-v7 candidate fails the reader's shape
 * check (field names the first failing field). The field is for diagnosis, not display.
 */
export class DraftNotStorableError extends Error {
  constructor(check, detail) {
    super(
      check === 'schema'
        ? `A trip with schema "${detail}" can't be saved as a draft.`
        : `A trip that fails the saved-trip check (${detail}) can't be saved as a draft.`
    );
    this.name = 'DraftNotStorableError';
    this.check = check;
    this.schema = check === 'schema' ? detail : ENVELOPE_SCHEMA;
    this.field = check === 'shape' ? detail : 'versions.schema';
  }
}

// The order below is required (Stage B brief §2); each step stops something that got
// past the one before it.
// 1. Readability, from current storage on every save: writing over a store that can't be
//    read would destroy its bytes.
// 2. Input schema: only door2-v6 or door2-v7. A raw door2-v5 has no routePlan.
// 3. The candidate: a v6 input is stamped door2-v7 on a copy with a fresh versions object
//    (the page hands in a shallow copy, so assigning into trip.versions would change the
//    trip still being edited); a v7 input is taken as handed. history is not touched.
// 4. The candidate passes the same shape check the reader applies, so whatever is
//    written reopens. Nothing is repaired, rescheduled or rebuilt to make it pass.
// 5. Only then is it written, in envelope version 2. destinationLabel is included only
//    when it is a non-empty string; otherwise the key is left out entirely.
export function saveDraftTrip(trip, label, destinationLabel) {
  const store = readStore();
  if (store.status === 'unreadable') throw new DraftStorageUnreadableError();
  const schema = trip?.versions?.schema;
  if (!SAVABLE_SCHEMAS.includes(schema)) throw new DraftNotStorableError('schema', String(schema));
  const candidate = schema === ENVELOPE_SCHEMA ? trip : { ...trip, versions: { ...trip.versions, schema: ENVELOPE_SCHEMA } };
  const failed = v7ShapeFailure(candidate);
  if (failed) throw new DraftNotStorableError('shape', failed);
  const evidence = inspectEvidence(candidate);
  if (!evidence.ok || evidence.readOnly) throw new DraftNotStorableError('shape', evidence.readOnly ? 'evidence_version_unsupported' : evidence.field);
  const id = `d2draft_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const savedAt = new Date().toISOString();
  const entry = {
    envelopeVersion: ENVELOPE_VERSION,
    id,
    label,
    ...(isNonEmptyString(destinationLabel) ? { destinationLabel } : {}),
    savedAt,
    trip: candidate
  };
  writeAll([...store.drafts, entry]);
  return id;
}

/** The label to show for a listed draft: its stored label when that is a usable string,
 * otherwise a fallback. Display only — the stored entry is never touched. */
export function draftDisplayLabel(entry) {
  return typeof entry?.label === 'string' && entry.label.trim() !== '' ? entry.label : 'Untitled trip';
}

// A refusal names the draft from envelope metadata only, never from inside trip. A label
// is usable when it has non-blank text (as in draftDisplayLabel) and is returned as stored.
const isUsableName = (v) => typeof v === 'string' && v.trim() !== '';
function draftName(entry) {
  if (isUsableName(entry.destinationLabel)) return entry.destinationLabel;
  if (isUsableName(entry.label)) return entry.label;
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
  // A compatibility change, not a loss: the v5 draft stays stored exactly as it was.
  if (entry.trip?.versions?.schema === 'door2-v5') {
    return refuse(entry, 'it was saved in an older trip format that this version no longer opens. The saved trip has not been deleted');
  }
  if (!isSchemaSupported(entry.trip?.versions)) {
    const schema = entry.trip?.versions?.schema ?? 'unknown';
    return { compatible: false, reason: `Built with schema "${schema}" — can't be reopened here.` };
  }
  return loadEvidence(entry);
}

// Envelope version 2 only — exactly 2, not "2 or later". The payload is inspected to
// establish compatibility and returned as saved; it is never scheduled or repaired.
function loadEnvelope(entry) {
  if (entry.envelopeVersion !== ENVELOPE_VERSION) return refuse(entry, "it was saved in a format this version doesn't recognise");
  if (entry.trip?.versions?.schema !== ENVELOPE_SCHEMA) return refuse(entry, "its saved format and trip version don't match");
  const failed = v7ShapeFailure(entry.trip);
  if (failed) return refuse(entry, `its saved trip is incomplete (${failed})`);
  return loadEvidence(entry);
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

// Removes only a listable entry with this id; malformed entries are skipped, never
// thrown on, and left in storage. Nothing matched means nothing is written.
export function deleteDraftTrip(id) {
  const { drafts } = readStore();
  const kept = drafts.filter((d) => !(isListable(d) && d.id === id));
  if (kept.length !== drafts.length) writeAll(kept);
}

function loadEvidence(entry) {
  const status = inspectEvidence(entry.trip);
  if (!status.ok) return refuse(entry, `its saved evidence is incomplete (${status.field})`);
  return { compatible: true, trip: entry.trip, ...(status.readOnly ? { evidenceReadOnly: true, evidenceNotice: status.notice } : {}) };
}
