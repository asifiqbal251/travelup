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
// door2-v8 is read-only in packet 1a: the reader opens it and the page locks it. No
// client can produce one yet — the writer still stamps door2-v7 (SAVABLE_SCHEMAS).
// The lock is keyed on this schema, never on whether identity is present: a v8 record
// with no identity map is the row that most needs locking, because a missing `used`
// would let a later client reissue a retired token.
const V8_SCHEMA = 'door2-v8';
// What saveDraftTrip accepts as input; anything else is refused before any write.
// V8_SCHEMA is deliberately absent: it is the only guard that stops a v8 payload
// carrying no identity at all, which Rule B cannot catch (nothing is present to refuse).
const SAVABLE_SCHEMAS = ['door2-v6', ENVELOPE_SCHEMA];
// Identity versions this packet recognises structurally. Structural classification is
// never a claim of full validity: D-B §4.2's coverage validation belongs to packet 1b.
const KNOWN_IDENTITY_VERSIONS = [1];
// Block types the producers emit at this revision (schedule.js travel/open/rest,
// fill.js and edit.js activity, edit.js open). types.js additionally declares meal and
// free, and the page has an `arrive` branch; neither is produced today, so neither is
// admitted here. Derived from source, not from one sample trip.
const V8_BLOCK_TYPES = ['travel', 'open', 'rest', 'activity'];

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
 * check (field names the first failing field). check 'identity': the trip carries an
 * identity map, so it saves only as door2-v8, which this version cannot write (Rule B).
 * The field is for diagnosis, not display.
 */
export class DraftNotStorableError extends Error {
  constructor(check, detail) {
    super(
      check === 'schema'
        ? `A trip with schema "${detail}" can't be saved as a draft.`
        : check === 'identity'
          ? `A trip that carries durable edit identity can only be saved as "${detail}", which this version can't write. The saved trips already in this browser have not been changed.`
          : `A trip that fails the saved-trip check (${detail}) can't be saved as a draft.`
    );
    this.name = 'DraftNotStorableError';
    this.check = check;
    this.schema = check === 'schema' || check === 'identity' ? detail : ENVELOPE_SCHEMA;
    this.field = check === 'shape' ? detail : check === 'identity' ? 'identity' : 'versions.schema';
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
  // Rule B (D-B §5.1): a trip carrying any identity at all saves only as door2-v8, and
  // this writer cannot emit v8 — so it refuses by name and retains, rather than
  // stamping v7 over a record whose identity would then be silently dropped.
  //
  // The test is presence, not truthiness. `{}` and `[]` are truthy and `null`, 0, false,
  // '' and an explicit undefined are falsey, yet every one of them is a present identity
  // key and must refuse; only a genuinely absent key may proceed. `in` throws on null
  // and primitives, so the object check comes first — which also refuses a non-object
  // payload here instead of letting it reach the schema allowlist.
  // isObject only guards the `in` operator, which throws on null and primitives. It
  // deliberately does not refuse a non-object payload here: the schema allowlist below
  // already refuses one by name and retains, and pre-empting it would change the
  // existing error that draftStorageGuard.test.js B3 asserts for a null trip.
  if (isObject(trip) && 'identity' in trip) throw new DraftNotStorableError('identity', V8_SCHEMA);
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
  const schema = entry.trip?.versions?.schema;
  if (schema === V8_SCHEMA) return loadV8(entry);
  if (schema !== ENVELOPE_SCHEMA) return refuse(entry, "its saved format and trip version don't match");
  const failed = v7ShapeFailure(entry.trip);
  if (failed) return refuse(entry, `its saved trip is incomplete (${failed})`);
  return loadEvidence(entry);
}

/**
 * A door2-v8 record: opened read-only, or refused by name and kept. In that order —
 * structure, then evidence, then identity:
 *
 * 1. The render contract, because inspectEvidence and the page both walk the trip, so
 *    the structure they walk has to be safe before anything else reads it.
 * 2. Evidence, with the existing behaviour preserved: invalid evidence is a named
 *    refusal, and structurally acceptable but unknown evidence stays viewable under its
 *    own explanation. That explanation has priority over the schema lock's wording, but
 *    it never cancels the lock.
 * 3. Identity, classified structurally only.
 *
 * The returned object adds keys to the v7 result shape. Nothing is added to a v6 or v7
 * result, whose exact shape is asserted by draftUpgrade.test.js and is unchanged.
 */
function loadV8(entry) {
  const failed = v8RenderFailure(entry.trip);
  if (failed) return refuse(entry, `its saved trip can't be shown by this version (${failed})`);
  const status = inspectEvidence(entry.trip);
  if (!status.ok) return refuse(entry, `its saved evidence is incomplete (${status.field})`);
  const identity = classifyIdentity(entry.trip);
  return {
    compatible: true,
    trip: entry.trip,
    storedSchema: V8_SCHEMA,
    identity,
    readOnly: true,
    readOnlyReason: 'schema',
    readOnlyNotice: V8_LOCK_NOTICE[identity],
    ...(status.readOnly ? { evidenceReadOnly: true, evidenceNotice: status.notice } : {})
  };
}

const isInt = Number.isInteger;
const isPositiveInt = (n) => isInt(n) && n > 0;

/**
 * The required shape of a door2-v7 payload (build brief §3). history and contentGaps
 * are not required. Returns the name of the first failing field, or null.
 *
 * Unchanged for v7: this is the same check, with the expected schema passed in rather
 * than closed over, so the v8 reader can reuse the body instead of duplicating it. Both
 * existing call sites (loadEnvelope and saveDraftTrip) keep identical behaviour and
 * identical returned field names.
 * @returns {string | null}
 */
function v7ShapeFailure(trip) {
  return shapeFailure(trip, ENVELOPE_SCHEMA);
}

/** @returns {string | null} */
function shapeFailure(trip, expectedSchema) {
  if (!isObject(trip)) return 'trip';
  const { versions: v, spec, routePlan: rp, days } = trip;
  if (!isObject(v) || v.schema !== expectedSchema) return 'versions.schema';
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

// Text that React can render as a child. An object or array here throws
// "Objects are not valid as a React child" at render time, so it is refused instead.
const isText = (v) => typeof v === 'string' || typeof v === 'number';
const isAbsent = (v) => v === undefined || v === null;
const isTextOrAbsent = (v) => isAbsent(v) || isText(v);
// Place ids reach placeName(), which falls through to the raw id when the id is not in
// PILOT_PLACES and then renders it. So a non-string id is a render throw, not a miss.
const isPlaceRefOrAbsent = (v) => isAbsent(v) || typeof v === 'string';

/**
 * The display contract for a door2-v8 payload: the values and collections that
 * Door2Plan and its rendered children actually consume while showing a loaded trip.
 *
 * This is deliberately not a restatement of the structural check. shapeFailure proves
 * the containers exist; this proves the page can render what is inside them. Each row
 * is here because a real consumer dereferences or renders it — the mapping from field
 * to consumer is recorded in the implementation report. It is an audit of the current
 * page, so it grows when the page grows; it is not a closed list.
 *
 * Nothing is coerced, defaulted or repaired. A failure returns the field name and the
 * caller refuses by envelope name, leaving the stored bytes untouched.
 * @returns {string | null}
 */
function v8DisplayFailure(trip) {
  const { spec, routePlan: rp, days } = trip;

  // tripAtGlanceSegments and groupDaysByPlace both call spec.stops.filter(...), and the
  // day-trip sheet reads activeTrip.spec.stops. A missing or non-array value throws.
  if (!Array.isArray(spec.stops)) return 'spec.stops';
  if (!spec.stops.every(isObject)) return 'spec.stops[]';
  if (!spec.stops.every((s) => isPlaceRefOrAbsent(s.placeId))) return 'spec.stops[].placeId';
  if (!spec.stops.every((s) => isInt(s.nights))) return 'spec.stops[].nights';
  if (!isPlaceRefOrAbsent(spec.originPlaceId)) return 'spec.originPlaceId';
  // Restored into the Refine form by formFromSpec (Door2Plan.jsx:169-170) with `?? []`,
  // which does not protect a non-array object; RefineSheet then calls .includes on it
  // (:1515, :1548). The Refine opener is schema-gated too, but an accepted record must
  // not be able to crash the page even if another route to the form appears.
  if (!isAbsent(spec.interests)) {
    if (!Array.isArray(spec.interests)) return 'spec.interests';
    if (!spec.interests.every((v) => typeof v === 'string')) return 'spec.interests[]';
  }
  if (!isAbsent(spec.requiredPlaceIds)) {
    if (!Array.isArray(spec.requiredPlaceIds)) return 'spec.requiredPlaceIds';
    if (!spec.requiredPlaceIds.every((v) => typeof v === 'string')) return 'spec.requiredPlaceIds[]';
  }
  // Also restored into the form and rendered by the sheet's own controls.
  if (!isTextOrAbsent(spec.travellerType)) return 'spec.travellerType';
  if (!isTextOrAbsent(spec.pace)) return 'spec.pace';
  if (!isAbsent(spec.travelMonth) && !isInt(spec.travelMonth)) return 'spec.travelMonth';

  // addableOptionalsFor does (routePlan.optionals ?? []).map(o => o.optionalId): the ??
  // catches null and undefined but not a non-array object, which then throws on .map.
  if (!isAbsent(rp.optionals)) {
    if (!Array.isArray(rp.optionals)) return 'routePlan.optionals';
    if (!rp.optionals.every(isObject)) return 'routePlan.optionals[]';
    if (!rp.optionals.every((o) => typeof o.optionalId === 'string')) return 'routePlan.optionals[].optionalId';
  }
  // listExcursionMenu does new Set(stop.selectedExcursionIds ?? []), which throws on a
  // non-iterable object. hasDayTrips reads .length on the same field.
  for (const s of rp.stops) {
    if (isAbsent(s.selectedExcursionIds)) continue;
    if (!Array.isArray(s.selectedExcursionIds)) return 'routePlan.stops[].selectedExcursionIds';
    if (!s.selectedExcursionIds.every((v) => typeof v === 'string')) return 'routePlan.stops[].selectedExcursionIds[]';
  }

  for (const block of days.flatMap((d) => d.blocks)) {
    if (!V8_BLOCK_TYPES.includes(block.type)) return 'days.blocks.type.unsupported';
    // BlockRow renders block.startTime directly as a child.
    if (!isTextOrAbsent(block.startTime)) return 'days.blocks.startTime';
    if (!isAbsent(block.durationHours) && !Number.isFinite(block.durationHours)) return 'days.blocks.durationHours';
    // placeName(block.placeId) for the gap, arrive and free-time rows.
    if (!isPlaceRefOrAbsent(block.placeId)) return 'days.blocks.placeId';

    if (block.type === 'activity' && !block.gap) {
      // ActivityLine renders a.title, a.summary and a.foodNote as React children.
      if (!isObject(block.activity)) return 'days.blocks.activity';
      if (!isText(block.activity.title)) return 'days.blocks.activity.title';
      if (!isTextOrAbsent(block.activity.summary)) return 'days.blocks.activity.summary';
      if (!isTextOrAbsent(block.activity.foodNote)) return 'days.blocks.activity.foodNote';
    }

    if (block.type === 'travel' && block.transport != null) {
      const t = block.transport;
      if (!isObject(t)) return 'days.blocks.transport';
      if (!isPlaceRefOrAbsent(t.fromPlaceId)) return 'days.blocks.transport.fromPlaceId';
      if (!isPlaceRefOrAbsent(t.toPlaceId)) return 'days.blocks.transport.toPlaceId';
      if (!isTextOrAbsent(t.arriveTime)) return 'days.blocks.transport.arriveTime';
      if (!isAbsent(t.arriveDayNumber) && !isInt(t.arriveDayNumber)) return 'days.blocks.transport.arriveDayNumber';
      if (!isAbsent(t.overnight) && typeof t.overnight !== 'boolean') return 'days.blocks.transport.overnight';
      if (!isTextOrAbsent(t.mode)) return 'days.blocks.transport.mode';
    }
  }
  return null;
}

/**
 * Whether a door2-v8 payload can be handed to the page at all. Structure first, then
 * the display contract. A failure means the trip is never given to the itinerary
 * renderer; the record is refused by name and kept.
 *
 * There is no try/catch around rendering anywhere in this path. A render throw after
 * this check passes is a defect to report, not a route into the degraded rows.
 * @returns {string | null}
 */
function v8RenderFailure(trip) {
  return shapeFailure(trip, V8_SCHEMA) ?? v8DisplayFailure(trip);
}

/**
 * Structural classification of a v8 trip's identity map. Rows 1-5 of D-B §5 all share
 * one outcome in packet 1a — the trip opens read-only — so no traveller-visible
 * decision rests on the part of validation that is deferred to 1b.
 * @returns {'valid' | 'empty' | 'absent' | 'malformed' | 'unknown_version'}
 */
function classifyIdentity(trip) {
  if (!Object.hasOwn(trip, 'identity')) return 'absent';
  const id = trip.identity;
  if (!isObject(id)) return 'malformed';
  if (!isPositiveInt(id.version)) return 'malformed';
  if (!Array.isArray(id.used) || !id.used.every((v) => typeof v === 'string')) return 'malformed';
  for (const k of ['blocks', 'edits']) {
    if (!isObject(id[k])) return 'malformed';
    if (!Object.values(id[k]).every(isObject)) return 'malformed';
  }
  if (!KNOWN_IDENTITY_VERSIONS.includes(id.version)) return 'unknown_version';
  const empty = id.used.length === 0 && Object.keys(id.blocks).length === 0 && Object.keys(id.edits).length === 0;
  return empty ? 'empty' : 'valid';
}

// Why a v8 trip is read-only, in the traveller's terms. Each sentence is true of its own
// row: they are not interchangeable (mutation 7). D-B's missing-record wording is
// reserved for genuinely absent identity.
const V8_LOCK_NOTICE = {
  valid: "This version can show this trip, but can't edit or save it.",
  empty: "This version can show this trip, but can't edit or save it.",
  absent: "This trip opens, but the record of your changes is missing, so it's locked.",
  malformed: "This trip opens, but the record of your changes can't be read, so it's locked.",
  unknown_version: 'This trip was saved by a newer version of the planner, so it opens read-only.'
};

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
