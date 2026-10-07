// Direction B, Stage 2 — the one place the /plan -> /find handoff contract lives
// (build brief B Stage 2, revision 3, sections 5 to 8).
//
// The classic planner is handed the traveller's basic answers as query parameters
// and nothing else: no itinerary, no draft, no preferences, and nothing that
// identifies an account. Both directions are here so the sender and the receiver
// cannot drift apart:
//   buildClassicHandoff  /plan side: the link's href and what it actually carries
//   parseClassicHandoff  /find side: strict, field-by-field, first occurrence wins
//   handoffNote          the sentence a link may say, naming only what it carries
//
// Owner amendment, 7 Oct 2026: `route` tells the classic planner that the traveller
// picked a Peru or Eastern Canada route rather than typing those words, so the
// arrival explanation can be accurate. It controls the explanation and nothing
// else — it never selects a destination, changes the trip or carries an itinerary —
// and an unrecognised value is ignored.
//
// Deliberately NOT routed through src/lib/app-params.js. That helper persists URL
// parameters into localStorage and can rewrite the address bar; a handoff must do
// neither, or a reload would restore later edits and the two doors would share a
// store. Everything here reads and writes plain strings.
import { PILOT_PLACES } from "./pilotData.js";

export const CLASSIC_FIND_PATH = "/find";

/** Longest search text carried. It is user text, so it is bounded and only ever rendered as text. */
export const DEST_Q_MAX = 200;

/** What the classic planner's length control offers. */
export const CLASSIC_DAYS_MIN = 3;
export const CLASSIC_DAYS_MAX = 14;

/**
 * The two /plan routes whose classic counterpart is a set of choices, not one record.
 * The value names the route so an unrecognised one can be ignored rather than guessed.
 */
export const CLASSIC_ROUTE_VALUES = Object.freeze(["peru", "eastern-canada"]);
const ROUTE_SET = new Set(CLASSIC_ROUTE_VALUES);
const ROUTE_FOR_COUNTRY = Object.freeze({
  "country:PE": "peru",
  "country:CA": "eastern-canada",
});

/** What /plan accepts (Door2Plan's stepper). */
export const PLAN_DAYS_MIN = 1;
export const PLAN_DAYS_MAX = 60;

// /plan's traveller values -> the classic planner's keys (questionnaireFlow.js, "traveller").
const PARTY_BY_PLAN = Object.freeze({
  solo: "just-me",
  couple: "two",
  friends: "friends",
  family: "family",
});
const PARTY_KEYS = new Set(Object.values(PARTY_BY_PLAN));

/**
 * Catalogue record ids for the two routes whose classic record is a genuine match.
 * The classic catalogue is hosted (Destination.list() on Base44), so an id can only
 * be pinned from an actual read of it; a name is never an id (brief section 11).
 * `null` means "not pinned", and that route then carries search text only.
 */
export const VERIFIED_CLASSIC_DESTINATION_IDS = Object.freeze({
  "country:US": null, // New York City
  "country:JP": null, // Tokyo & Kyoto, Japan
});

// The search text a /plan destination hands over. A country quick-pick stands for a
// route, never the whole country, so only the two genuine matches name a place.
const SEARCH_TEXT_FOR_COUNTRY = Object.freeze({
  "country:US": "New York City",
  "country:JP": "Tokyo",
  "country:PE": "Peru",
  "country:CA": "Canada",
});

/** Whole canonical decimal strings only: no sign, space, fraction, exponent or leading zero. */
export function lexInteger(value) {
  if (typeof value !== "string") return null;
  if (!/^(0|[1-9][0-9]{0,5})$/.test(value)) return null;
  return Number(value);
}

/** Search text, bounded and stripped of control characters. "" when there is nothing to carry. */
export function boundedQuery(text) {
  const clean = String(text ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  return [...clean].slice(0, DEST_Q_MAX).join("").trim();
}

/**
 * What a /plan destination value hands over: search text, a record id when one is
 * verified, and the route name when the value is a multi-stop route the classic
 * planner cannot hold. A typed search never produces a route.
 */
export function destinationHandoff(destinationValue) {
  if (typeof destinationValue !== "string") return { query: "", id: null, route: null };
  if (Object.hasOwn(SEARCH_TEXT_FOR_COUNTRY, destinationValue)) {
    return {
      query: SEARCH_TEXT_FOR_COUNTRY[destinationValue],
      id: VERIFIED_CLASSIC_DESTINATION_IDS[destinationValue] ?? null,
      route: ROUTE_FOR_COUNTRY[destinationValue] ?? null,
    };
  }
  if (destinationValue.startsWith("place:")) {
    const place = PILOT_PLACES[destinationValue.slice("place:".length)];
    return { query: place ? boundedQuery(place.name) : "", id: null, route: null };
  }
  return { query: "", id: null, route: null };
}

/** `days` when the classic planner offers the length; `daysReq` when /plan accepted a length it cannot. */
export function durationHandoff(totalDays) {
  const n = Number(totalDays);
  if (!Number.isInteger(n)) return { days: null, daysReq: null };
  if (n >= CLASSIC_DAYS_MIN && n <= CLASSIC_DAYS_MAX) return { days: n, daysReq: null };
  if (n >= PLAN_DAYS_MIN && n <= PLAN_DAYS_MAX) return { days: null, daysReq: n };
  return { days: null, daysReq: null };
}

/**
 * The /plan side. Pass either `queryText` (the search box, nothing chosen yet) or the
 * basics of a request. Returns the href and, separately, exactly what it carries, so
 * a link's wording can never claim more than its parameters hold.
 */
export function buildClassicHandoff({ destination, totalDays, travelMonth, travellerType, queryText } = {}) {
  const params = new URLSearchParams();
  const carried = { query: false, month: false, days: false, party: false, outOfRange: false, route: null };

  if (destination !== undefined) {
    const { query, id, route } = destinationHandoff(destination);
    if (query) { params.set("dest_q", query); carried.query = true; }
    if (id) params.set("dest_id", id);
    if (route) { params.set("route", route); carried.route = route; }
  } else {
    const query = boundedQuery(queryText);
    if (query) { params.set("dest_q", query); carried.query = true; }
  }

  const month = Number(travelMonth);
  if (Number.isInteger(month) && month >= 1 && month <= 12) { params.set("month", String(month)); carried.month = true; }

  const { days, daysReq } = durationHandoff(totalDays);
  if (days !== null) { params.set("days", String(days)); carried.days = true; }
  if (daysReq !== null) { params.set("days_req", String(daysReq)); carried.outOfRange = true; }

  const party = Object.hasOwn(PARTY_BY_PLAN, travellerType) ? PARTY_BY_PLAN[travellerType] : null;
  if (party) { params.set("party", party); carried.party = true; }

  const qs = params.toString();
  return { href: qs ? `${CLASSIC_FIND_PATH}?${qs}` : CLASSIC_FIND_PATH, carried };
}

/**
 * The /find side. Each field is validated on its own and falls back to null alone: one
 * bad parameter never discards the others. The first occurrence of a repeated key
 * wins, and if that first occurrence is invalid the field is invalid (the second is
 * never consulted).
 */
export function parseClassicHandoff(search) {
  const p = new URLSearchParams(typeof search === "string" ? search : "");

  const destQ = boundedQuery(p.get("dest_q")) || null;

  const rawId = p.get("dest_id");
  const destId = rawId !== null && /^[A-Za-z0-9_-]{1,64}$/.test(rawId) ? rawId : null;

  const monthN = lexInteger(p.get("month"));
  const month = monthN !== null && monthN >= 1 && monthN <= 12 ? String(monthN) : null;

  const daysN = lexInteger(p.get("days"));
  const days = daysN !== null && daysN >= CLASSIC_DAYS_MIN && daysN <= CLASSIC_DAYS_MAX ? daysN : null;

  // days_req is only about a length the classic planner cannot offer, and only when
  // the `days` key is absent altogether. An invalid or empty `days` is still present.
  const reqN = lexInteger(p.get("days_req"));
  const outOfRange = reqN !== null && ((reqN >= PLAN_DAYS_MIN && reqN < CLASSIC_DAYS_MIN) || (reqN > CLASSIC_DAYS_MAX && reqN <= PLAN_DAYS_MAX));
  const daysReq = !p.has("days") && outOfRange ? reqN : null;

  const partyRaw = p.get("party");
  const party = partyRaw !== null && PARTY_KEYS.has(partyRaw) ? partyRaw : null;

  // Explanation only. An unrecognised value is ignored, exactly like an unknown party.
  const routeRaw = p.get("route");
  const route = routeRaw !== null && ROUTE_SET.has(routeRaw) ? routeRaw : null;

  const active = [destQ, destId, month, days, daysReq, party, route].some((v) => v !== null);
  return { active, destQ, destId, month, days, daysReq, party, route };
}

/**
 * `route` is deliberately absent from this sentence: a route is what did *not*
 * transfer, and the classic planner explains that on arrival.
 *
 * The sentence a handoff link may say. It names only what the href really carries:
 * a length that could not be carried is never listed, and is said to need choosing.
 */
export function handoffNote(carried) {
  const parts = [];
  if (carried.month) parts.push("month");
  if (carried.days) parts.push("trip length");
  if (carried.party) parts.push("who's coming");
  if (parts.length === 0) return carried.query ? "We'll take what you typed with you." : "";

  const named = parts.map((part, i) => (i === 0 ? `your ${part}` : part));
  const joined =
    named.length === 1 ? named[0]
    : named.length === 2 ? `${named[0]} and ${named[1]}`
    : `${named.slice(0, -1).join(", ")} and ${named[named.length - 1]}`;
  return `We'll bring ${joined}.${carried.outOfRange ? " You'll need to choose a trip length there." : ""}`;
}
