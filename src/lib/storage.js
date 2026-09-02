// Browser-only storage for TravelUp. No questionnaire data is sent to any server.
const KEY = "travelup_state_v1";

// Centralized MVP cap on saved trips. Consumed by every limit check and the
// user-facing limit message so it is cheap to adjust later.
export const MAX_SAVED_TRIPS = 30;

export function loadState() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {
    return {};
  }
}

// Persist the full state and return a discriminated result so mutation helpers
// can surface quota/unavailable failures without false success. Existing void
// saveState() wraps this for backward compatibility.
function persistState(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return { ok: true };
  } catch (e) {
    const name = e && e.name;
    const code = e && e.code;
    if (name === "QuotaExceededError" || code === 22 || code === 1014) {
      return { ok: false, reason: "quota" };
    }
    return { ok: false, reason: "unavailable" };
  }
}

export function saveState(state) {
  persistState(state);
}

export function clearState() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

// ---- Existing prefs / selection / legacy packing (compatibility) ----

export function getPrefs() {
  return loadState().prefs || null;
}

export function setPrefs(prefs) {
  const s = loadState();
  s.prefs = prefs;
  persistState(s);
}

export function getSelectedDestinationId() {
  return loadState().selectedDestinationId || null;
}

export function setSelectedDestinationId(id) {
  const s = loadState();
  s.selectedDestinationId = id;
  persistState(s);
}

// Legacy destination-keyed packing. Kept for backward-compatibility seeding only;
// new writes go to the trip-keyed store via setActiveTripPacking.
export function getPackingState(destId) {
  const s = loadState();
  return (s.packing && s.packing[destId]) || { checked: [], custom: [] };
}

export function setPackingState(destId, packing) {
  const s = loadState();
  s.packing = s.packing || {};
  s.packing[destId] = packing;
  persistState(s);
}

// ---- Trip fingerprint ----

function normStr(v) {
  if (v == null) return "";
  return String(v).trim().toLowerCase();
}

function dedupeSort(arr) {
  if (!Array.isArray(arr)) return [];
  return [...new Set(arr.map((s) => String(s == null ? "" : s).trim()).filter(Boolean))].sort();
}

// Canonical trip fingerprint: the selected destination plus the preferences
// that define the itinerary. Discovery filters (travelScope, visitedCountries,
// excludedDestinations) are intentionally excluded — they shape ranking, not
// the selected trip. Stored as "v1:" + canonical JSON so changes are auditable.
export function tripFingerprint(prefs, destinationId) {
  if (!prefs) return "v1:";
  const fields = {
    destinationId: String(destinationId || ""),
    residenceCountry: normStr(prefs.residenceCountry),
    departureCity: normStr(prefs.departureCity),
    citizenship: normStr(prefs.citizenship),
    travelMonth: prefs.travelMonth != null ? String(prefs.travelMonth) : "",
    travelDays: prefs.travelDays != null ? String(prefs.travelDays) : "",
    travellerType: normStr(prefs.travellerType),
    budget: normStr(prefs.budget),
    interests: dedupeSort(prefs.interests),
    climate: normStr(prefs.climate),
    pace: normStr(prefs.pace),
    activity: normStr(prefs.activity),
    dietary: normStr(prefs.dietary),
    dietaryOther: normStr(prefs.dietaryOther)
  };
  return "v1:" + JSON.stringify(fields);
}

// ---- Active-trip packing (keyed by fingerprint) ----

// Normalize any packing state (new shape or legacy) to the canonical shape.
function normalizePackingState(p) {
  if (!p || typeof p !== "object") return { checkedItemIds: [], customItems: [] };
  const checked = Array.isArray(p.checkedItemIds) ? p.checkedItemIds
    : Array.isArray(p.checked) ? p.checked : [];
  const custom = Array.isArray(p.customItems) ? p.customItems
    : Array.isArray(p.custom) ? p.custom : [];
  return { checkedItemIds: [...checked], customItems: [...custom] };
}

export function getActiveTripPacking(fingerprint) {
  const s = loadState();
  if (s.packingByTrip && s.packingByTrip[fingerprint]) {
    return normalizePackingState(s.packingByTrip[fingerprint]);
  }
  return null;
}

// One-time backward-compat seeding: if a fingerprint has no packing state yet,
// copy legacy destination-keyed packing into the trip-keyed store. Does not
// delete legacy data. Subsequent reads return the trip-keyed state.
export function seedActiveTripPacking(fingerprint, legacyDestinationId) {
  const existing = getActiveTripPacking(fingerprint);
  if (existing) return existing;
  if (!legacyDestinationId) return { checkedItemIds: [], customItems: [] };
  const s = loadState();
  if (s.packing && s.packing[legacyDestinationId]) {
    const seeded = normalizePackingState(s.packing[legacyDestinationId]);
    setActiveTripPacking(fingerprint, seeded);
    return seeded;
  }
  return { checkedItemIds: [], customItems: [] };
}

export function setActiveTripPacking(fingerprint, packing) {
  const s = loadState();
  s.packingByTrip = s.packingByTrip || {};
  s.packingByTrip[fingerprint] = normalizePackingState(packing);
  const res = persistState(s);
  return res.ok ? { ok: true } : res;
}

// ---- Saved trips ----

function genId() {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  } catch {
    /* fall through to timestamp/random fallback */
  }
  return "id-" + Date.now() + "-" + Math.random().toString(36).slice(2, 10);
}

function isValidSavedTrip(t) {
  return !!t && typeof t === "object" &&
    t.schemaVersion === 1 && typeof t.id === "string" &&
    typeof t.fingerprint === "string" && !!t.destination && Array.isArray(t.itinerary);
}

function rawSavedTrips(state) {
  return Array.isArray(state.savedTrips) ? state.savedTrips : [];
}

export function getSavedTrips() {
  const arr = rawSavedTrips(loadState()).filter(isValidSavedTrip);
  return arr.slice().sort((a, b) =>
    String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""))
  );
}

export function getSavedTrip(id) {
  return getSavedTrips().find((t) => t.id === id) || null;
}

export function findSavedTripByFingerprint(fingerprint) {
  return getSavedTrips().find((t) => t.fingerprint === fingerprint) || null;
}

export function getSavedTripCount() {
  return getSavedTrips().length;
}

export function saveNewTrip(snapshot) {
  if (!isValidSavedTrip(snapshot)) return { ok: false, reason: "invalid" };
  const s = loadState();
  const arr = rawSavedTrips(s).filter(isValidSavedTrip);
  if (arr.length >= MAX_SAVED_TRIPS) return { ok: false, reason: "limit" };
  if (arr.some((t) => t.fingerprint === snapshot.fingerprint)) {
    return { ok: false, reason: "duplicate" };
  }
  s.savedTrips = [snapshot, ...arr];
  const res = persistState(s);
  return res.ok ? { ok: true, value: snapshot } : res;
}

// Replace an existing saved trip's snapshot while preserving its id and
// original savedAt; sets a new updatedAt and moves it to the top of the list.
export function replaceSavedTrip(id, snapshot) {
  const s = loadState();
  const arr = rawSavedTrips(s).filter(isValidSavedTrip);
  const original = arr.find((t) => t.id === id);
  if (!original) return { ok: false, reason: "invalid" };
  const updated = {
    ...snapshot,
    id: original.id,
    savedAt: original.savedAt,
    updatedAt: new Date().toISOString()
  };
  s.savedTrips = [updated, ...arr.filter((t) => t.id !== id)];
  const res = persistState(s);
  return res.ok ? { ok: true, value: updated } : res;
}

// Update only a saved trip's packing progress and bump its updatedAt.
export function updateSavedTripPacking(id, packing) {
  const s = loadState();
  const arr = rawSavedTrips(s).filter(isValidSavedTrip);
  const idx = arr.findIndex((t) => t.id === id);
  if (idx < 0) return { ok: false, reason: "invalid" };
  const updated = {
    ...arr[idx],
    packing: {
      ...(arr[idx].packing || {}),
      checkedItemIds: Array.isArray(packing.checkedItemIds) ? packing.checkedItemIds : [],
      customItems: Array.isArray(packing.customItems) ? packing.customItems : []
    },
    updatedAt: new Date().toISOString()
  };
  s.savedTrips = [updated, ...arr.filter((t) => t.id !== id)];
  const res = persistState(s);
  return res.ok ? { ok: true, value: updated } : res;
}

export function deleteSavedTrip(id) {
  const s = loadState();
  const arr = rawSavedTrips(s).filter(isValidSavedTrip);
  if (!arr.some((t) => t.id === id)) return { ok: false, reason: "invalid" };
  s.savedTrips = arr.filter((t) => t.id !== id);
  const res = persistState(s);
  return res.ok ? { ok: true } : res;
}

// ---- Snapshot builder ----

// Build a self-contained immutable display snapshot from the live destination
// record, preferences, practicality result, generated itinerary and packing
// groups plus the current trip-specific packing progress. Stored verbatim so a
// saved trip renders identically later even if data or code change.
export function buildTripSnapshot({
  dest, prefs, fingerprint, itinerary, packingGroups, packingState, travelFit,
  score, existingId, existingSavedAt
}) {
  const now = new Date().toISOString();
  const id = existingId || genId();
  return {
    schemaVersion: 1,
    id,
    savedAt: existingSavedAt || now,
    updatedAt: now,
    fingerprint,
    // Travel Fit final score (0-100) at save time, for the ring badge on the
    // Saved Trips card. Optional: trips saved before this field existed
    // simply omit it — isValidSavedTrip() doesn't require it, so old saves
    // stay valid and callers fall back to the qualitative fit badge.
    score: typeof score === "number" ? score : null,
    destination: {
      id: dest.id,
      name: dest.name,
      country: dest.country,
      region: dest.region,
      imageUrl: dest.image_url,
      intro: dest.intro,
      topExperiences: dest.top_experiences || [],
      bestForSummary: dest.best_for_summary || "",
      minDays: dest.min_days,
      maxDays: dest.max_days,
      budgetCategories: dest.budget_categories || [],
      climateTags: dest.climate_tags || [],
      travellerTypes: dest.traveller_types || [],
      dietaryNotes: dest.dietary_notes || "",
      currencyCode: dest.currency_code || "",
      currencyName: dest.currency_name || "",
      languages: dest.languages || [],
      plugTypes: dest.plug_types || [],
      voltage: dest.voltage || "",
      emergencyNumbers: dest.emergency_number || [],
      connectivityNote: dest.connectivity_note || "",
      etiquetteNotes: dest.etiquette_notes || [],
      tippingNorm: dest.tipping_norm || "",
      paymentNorm: dest.payment_norm || "",
      dailyCostLow: dest.daily_cost_low,
      dailyCostMid: dest.daily_cost_mid,
      dailyCostHigh: dest.daily_cost_high,
      airportTransferNote: dest.airport_transfer_note || "",
      localTransportNote: dest.local_transport_note || "",
      intercityNote: dest.intercity_note || ""
    },
    preferences: {
      residenceCountry: prefs.residenceCountry,
      departureCity: prefs.departureCity,
      citizenship: prefs.citizenship,
      travelMonth: prefs.travelMonth,
      travelDays: prefs.travelDays,
      travellerType: prefs.travellerType,
      budget: prefs.budget,
      interests: prefs.interests || [],
      climate: prefs.climate,
      pace: prefs.pace,
      activity: prefs.activity,
      dietary: prefs.dietary,
      dietaryOther: prefs.dietaryOther
    },
    travelFit: {
      level: travelFit.level,
      tier: travelFit.tier,
      message: travelFit.message,
      oneWayHours: travelFit.oneWayHours,
      roundTripHours: travelFit.roundTripHours,
      travelShare: travelFit.travelShare,
      travelPenalty: travelFit.travelPenalty,
      usableDestinationDays: travelFit.usableDestinationDays,
      travelMode: travelFit.travelMode,
      distanceKm: travelFit.distanceKm,
      known: travelFit.known,
      isDomestic: travelFit.isDomestic,
      isOverride: travelFit.isOverride
    },
    itinerary,
    packing: {
      groups: packingGroups,
      checkedItemIds: (packingState && packingState.checkedItemIds) || [],
      customItems: (packingState && packingState.customItems) || []
    }
  };
}

// ---- Destination display normalization ----

// Map either the entity record (snake_case) or a saved snapshot (camelCase) to
// one common display object so shared view components don't branch on shape.
export function normalizeDestinationDisplay(d) {
  if (!d) return null;
  return {
    id: d.id,
    name: d.name,
    country: d.country,
    region: d.region,
    imageUrl: d.image_url != null ? d.image_url : d.imageUrl,
    intro: d.intro,
    topExperiences: d.top_experiences || d.topExperiences || [],
    bestForSummary: d.best_for_summary != null ? d.best_for_summary : (d.bestForSummary || ""),
    minDays: d.min_days != null ? d.min_days : d.minDays,
    maxDays: d.max_days != null ? d.max_days : d.maxDays,
    budgetCategories: d.budget_categories || d.budgetCategories || [],
    climateTags: d.climate_tags || d.climateTags || [],
    travellerTypes: d.traveller_types || d.travellerTypes || [],
    dietaryNotes: d.dietary_notes != null ? d.dietary_notes : (d.dietaryNotes || ""),
    currencyCode: d.currency_code != null ? d.currency_code : (d.currencyCode || ""),
    currencyName: d.currency_name != null ? d.currency_name : (d.currencyName || ""),
    languages: d.languages || [],
    plugTypes: d.plug_types || d.plugTypes || [],
    voltage: d.voltage || "",
    emergencyNumbers: d.emergency_number || d.emergencyNumbers || [],
    connectivityNote: d.connectivity_note != null ? d.connectivity_note : (d.connectivityNote || ""),
    etiquetteNotes: d.etiquette_notes || d.etiquetteNotes || [],
    tippingNorm: d.tipping_norm != null ? d.tipping_norm : (d.tippingNorm || ""),
    paymentNorm: d.payment_norm != null ? d.payment_norm : (d.paymentNorm || ""),
    dailyCostLow: d.daily_cost_low != null ? d.daily_cost_low : d.dailyCostLow,
    dailyCostMid: d.daily_cost_mid != null ? d.daily_cost_mid : d.dailyCostMid,
    dailyCostHigh: d.daily_cost_high != null ? d.daily_cost_high : d.dailyCostHigh,
    airportTransferNote: d.airport_transfer_note != null ? d.airport_transfer_note : (d.airportTransferNote || ""),
    localTransportNote: d.local_transport_note != null ? d.local_transport_note : (d.localTransportNote || ""),
    intercityNote: d.intercity_note != null ? d.intercity_note : (d.intercityNote || "")
  };
}