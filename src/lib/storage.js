// Browser-only storage for TravelUp. No questionnaire data is sent to any server.
const KEY = "travelup_state_v1";

export function loadState() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {
    return {};
  }
}

export function saveState(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage may be unavailable; ignore */
  }
}

export function clearState() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function getPrefs() {
  return loadState().prefs || null;
}

export function setPrefs(prefs) {
  const s = loadState();
  s.prefs = prefs;
  saveState(s);
}

export function getSelectedDestinationId() {
  return loadState().selectedDestinationId || null;
}

export function setSelectedDestinationId(id) {
  const s = loadState();
  s.selectedDestinationId = id;
  saveState(s);
}

export function getPackingState(destId) {
  const s = loadState();
  return (s.packing && s.packing[destId]) || { checked: [], custom: [] };
}

export function setPackingState(destId, packing) {
  const s = loadState();
  s.packing = s.packing || {};
  s.packing[destId] = packing;
  saveState(s);
}