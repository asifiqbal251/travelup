const STORAGE_KEY = 'door2_drafts_v1';
const SUPPORTED_SCHEMAS = ['door2-v5'];

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
  return { compatible: true, trip: entry.trip };
}

export function deleteDraftTrip(id) {
  writeAll(readAll().filter((d) => d.id !== id));
}
