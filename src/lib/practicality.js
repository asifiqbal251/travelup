// Deterministic, destination-specific travel-practicality assessment.
// One-way door-to-door time = flight-time band + airport/immigration overhead +
// distance-derived connection burden + curated internal-access (onward ground) time.
// Regional-route overrides (driving, ferry, train, shuttle) replace the flight
// estimate with a complete curated journey time for nearby destinations.
// Practicality is based on the share of the total trip consumed by round-trip
// travel. No live geocoding, flight, schedule or mapping APIs.

import { getCityCoords, getDestinationCoords } from "@/lib/coordinates";
import { getRegionalRoute } from "@/lib/regionalRoutes";
import { genericTravelMode } from "@/lib/travelMode";

const EARTH_R = 6371;
function toRad(d) {
  return (d * Math.PI) / 180;
}

export function haversineKm(a, b) {
  if (!a || !b) return null;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const la1 = toRad(a.lat);
  const la2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Smooth one-way flight-time estimate: ~800 km/h average cruise plus a fixed
// 45-minute allowance for takeoff, climb, descent and landing. Stays within
// roughly 1 hour of real nonstop times across short to long routes; planning
// estimate only, no claim about live schedules or direct flights.
function flightHours(distanceKm) {
  if (distanceKm == null) return null;
  return distanceKm / 800 + 0.75;
}

// Extra connection/transfer burden for routes unlikely to be nonstop.
// Deterministic and scales with distance: long intercontinental routes
// typically need one or more connections, so they carry more transfer time.
// This is added to any destination-curated connection time.
function connectionBurden(distanceKm) {
  if (distanceKm == null) return 0;
  if (distanceKm < 4000) return 0;
  if (distanceKm < 8000) return 2;
  if (distanceKm < 12000) return 3;
  return 5;
}

const DOMESTIC_OVERHEAD = 1.5; // check-in, security, station/airport transfer
const INTERNATIONAL_OVERHEAD = 2.5; // adds immigration/customs

function levelAndMessage(travelShare) {
  if (travelShare <= 0.2) return { level: "Practical", message: "Practical for your selected trip length." };
  if (travelShare <= 0.3) return { level: "Manageable", message: "Manageable for your trip length, but allow time for travel." };
  if (travelShare <= 0.45) return { level: "Stretch", message: "Travel may consume a significant share of this trip." };
  return { level: "Poor practical fit", message: "A large share of this trip would be spent travelling." };
}

// Absolute one-way travel hours as the primary driver, modified (softened,
// never eliminated) by trip length. Below PENALTY_FLOOR_HOURS, travel is
// genuinely free; above it, the penalty grows continuously and saturates at
// PENALTY_MAX by PENALTY_HOURS_CAP -- a ceiling reachable by real long-haul
// routes in the catalogue, unlike the old travel-share cap which needed an
// unreachable ~85% travel share. Trip length only softens the penalty: even
// at PENALTY_LENGTH_REF_DAYS+ it still pays PENALTY_LENGTH_FLOOR of the
// unmodified amount, so a long flight is never free just because the trip is
// long.
const PENALTY_FLOOR_HOURS = 3.5;
const PENALTY_HOURS_CAP = 24;
const PENALTY_MAX = 38;
const PENALTY_LENGTH_FLOOR = 0.62;
const PENALTY_LENGTH_REF_DAYS = 14;
const PENALTY_LENGTH_MIN_DAYS = 3;

function penaltyFor(oneWayHours, tripDays) {
  const shape =
    oneWayHours <= PENALTY_FLOOR_HOURS
      ? 0
      : Math.min(1, (oneWayHours - PENALTY_FLOOR_HOURS) / (PENALTY_HOURS_CAP - PENALTY_FLOOR_HOURS));
  const clampedDays = Math.max(PENALTY_LENGTH_MIN_DAYS, Math.min(PENALTY_LENGTH_REF_DAYS, tripDays));
  const lengthFactor =
    (PENALTY_LENGTH_REF_DAYS - clampedDays) / (PENALTY_LENGTH_REF_DAYS - PENALTY_LENGTH_MIN_DAYS);
  const modifier = PENALTY_LENGTH_FLOOR + (1 - PENALTY_LENGTH_FLOOR) * lengthFactor;
  return PENALTY_MAX * shape * modifier;
}

// Override path: the curated one-way time already includes the full transport
// burden, so no flight overhead, connection hours or internal-access hours are
// added. Destination time is derived consistently from the round-trip travel.
function assessOverride(dest, prefs, override) {
  const oneWayHours = override.oneWayHours;
  const roundTripHours = oneWayHours * 2;
  const tripDays = Number((prefs && prefs.travelDays) || 0);
  const tripHours = tripDays * 24;
  const travelShare = tripHours > 0 ? roundTripHours / tripHours : 0;
  const { level, message } = levelAndMessage(travelShare);
  const penalty = penaltyFor(oneWayHours, tripDays);

  // Destination time = total days − (round-trip hours ÷ 24), rounded to the
  // nearest half day, never more than the total trip duration.
  const usableRaw = tripDays - roundTripHours / 24;
  const usableDestinationDays = Math.max(0, Math.min(tripDays, Math.round(usableRaw * 2) / 2));

  const isDomestic =
    !!prefs && !!prefs.residenceCountry && !!dest &&
    String(prefs.residenceCountry).toLowerCase().trim() ===
      String(dest.country).toLowerCase().trim();

  const tier =
    oneWayHours <= 5 ? "fold" :
    oneWayHours <= 8 ? "partialFold" :
    oneWayHours <= 15 ? "medium" :
    "long";

  return {
    level,
    tier,
    message,
    oneWayHours: Math.round(oneWayHours * 10) / 10,
    roundTripHours: Math.round(roundTripHours * 10) / 10,
    travelShare,
    travelPenalty: penalty,
    usableDestinationDays,
    travelMode: override.mode,
    distanceKm: null,
    known: true,
    isDomestic,
    isOverride: true
  };
}

export function assessPracticality(dest, prefs) {
  const override = getRegionalRoute(prefs, dest);
  if (override) {
    return assessOverride(dest, prefs, override);
  }

  const destCoords = getDestinationCoords(dest);
  const origin = getCityCoords(
    prefs && prefs.departureCity,
    prefs && prefs.residenceCountry
  );
  const isDomestic =
    !!prefs &&
    !!prefs.residenceCountry &&
    !!dest &&
    String(prefs.residenceCountry).toLowerCase().trim() ===
      String(dest.country).toLowerCase().trim();
  // internal_access_penalty models the onward ground transfer from the
  // international gateway to the destination itself. A domestic traveller
  // reaches the destination directly, so it does not apply.
  //
  // dest.connection_hours is intentionally not used: it's a flat, origin-blind
  // guess at flight-connection burden, which connectionBurden(distanceKm)
  // below already models per-origin. Adding both double-counts connection
  // time whenever the real route is a nonstop the distance formula got right.
  const internalAccess = isDomestic ? 0 : Number((dest && dest.internal_access_penalty) || 0);

  let distanceKm = null;
  let baseHours;
  let known = true;

  if (origin && destCoords) {
    distanceKm = haversineKm(origin, destCoords);
    baseHours = flightHours(distanceKm);
  } else {
    // Origin unrecognized: be conservative. Treat as an intercontinental
    // journey so a short trip is not falsely presented as practical.
    known = false;
    baseHours = 16;
  }

  const overhead = isDomestic ? DOMESTIC_OVERHEAD : INTERNATIONAL_OVERHEAD;
  const routeConnection = distanceKm != null ? connectionBurden(distanceKm) : 4;
  const oneWayHours = baseHours + overhead + routeConnection + internalAccess;
  const roundTripHours = oneWayHours * 2;

  const tripDays = Number((prefs && prefs.travelDays) || 0);
  const tripHours = tripDays * 24;
  const travelShare = tripHours > 0 ? roundTripHours / tripHours : 0;
  const { level, message } = levelAndMessage(travelShare);
  const penalty = penaltyFor(oneWayHours, tripDays);

  // One source of truth for "time at destination": derive it from the SAME
  // travel-day allocation the itinerary uses, so the Travel Fit value agrees
  // with the generated itinerary rather than from a raw hours/24 subtraction.
  //   fold        under 5h:    no day lost (travel folded into day 1/N)
  //   partialFold 5–8h:       half a day lost each way (1 day total)
  //   medium      8–15h:      one full day lost each way (2 days total)
  //   long        >15h:        two full days lost each way (4 days total)
  const tier =
    oneWayHours <= 5 ? "fold" :
    oneWayHours <= 8 ? "partialFold" :
    oneWayHours <= 15 ? "medium" :
    "long";
  let usableRaw;
  if (tier === "fold") usableRaw = tripDays;
  else if (tier === "partialFold") usableRaw = tripDays - 1;
  else if (tier === "medium") usableRaw = tripDays - 2;
  else usableRaw = tripDays - 4;
  const usableDestinationDays = Math.max(0, Math.round(usableRaw * 2) / 2);

  // The destination's authored `travel_mode` field is a single value written
  // assuming a specific (often nearby) origin — it's only accurate here when
  // a regional-route override matched above and confirmed this origin. For
  // every other origin, show a generic label for the actual computed path
  // (flight, plus local transport) rather than a curated string that may
  // describe an unrelated journey (e.g. a train, for a traveller who is
  // flying).
  const travelMode = genericTravelMode(isDomestic);

  return {
    level,
    tier,
    message,
    oneWayHours: Math.round(oneWayHours * 10) / 10,
    roundTripHours: Math.round(roundTripHours * 10) / 10,
    travelShare,
    travelPenalty: penalty,
    usableDestinationDays,
    travelMode,
    distanceKm: distanceKm ? Math.round(distanceKm) : null,
    known,
    isDomestic,
    isOverride: false
  };
}