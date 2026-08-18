// Deterministic, destination-specific travel-practicality assessment.
// One-way door-to-door time = flight-time band + airport/immigration overhead +
// expected connection time + curated internal-access (onward ground) time.
// Practicality is based on the share of the total trip consumed by round-trip
// travel. No live geocoding, flight, schedule or mapping APIs.

import { getCityCoords, getDestinationCoords } from "@/lib/coordinates";

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

// Approximate one-way flight time by distance band (hours). Planning bands,
// not claims about live schedules; no direct flights are implied.
function flightHours(distanceKm) {
  if (distanceKm == null) return null;
  if (distanceKm < 400) return 2.5;
  if (distanceKm < 900) return 3.5;
  if (distanceKm < 1800) return 4.5;
  if (distanceKm < 3500) return 6;
  if (distanceKm < 5500) return 8.5;
  if (distanceKm < 8000) return 11;
  if (distanceKm < 11000) return 14;
  if (distanceKm < 14000) return 17;
  return 20;
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

export function assessPracticality(dest, prefs) {
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
  // connection_hours and internal_access_penalty model the burden of reaching
  // the destination from an international gateway. A domestic traveller reaches
  // the destination directly, so these do not apply.
  const internalAccess = isDomestic ? 0 : Number((dest && dest.internal_access_penalty) || 0);
  const connectionHours = isDomestic ? 0 : Number((dest && dest.connection_hours) || 0);

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
  const oneWayHours = baseHours + overhead + connectionHours + routeConnection + internalAccess;
  const roundTripHours = oneWayHours * 2;

  const tripDays = Number((prefs && prefs.travelDays) || 0);
  const tripHours = tripDays * 24;
  const travelShare = tripHours > 0 ? roundTripHours / tripHours : 0;

  let level;
  let message;
  if (travelShare <= 0.2) {
    level = "Practical";
    message = "Practical for your selected trip length.";
  } else if (travelShare <= 0.3) {
    level = "Manageable";
    message = "Manageable for your trip length, but allow time for travel.";
  } else if (travelShare <= 0.45) {
    level = "Stretch";
    message = "Travel may consume a significant share of this trip.";
  } else {
    level = "Poor practical fit";
    message = "A large share of this trip would be spent travelling.";
  }

  let penalty;
  if (travelShare <= 0.2) penalty = 0;
  else if (travelShare <= 0.3) penalty = ((travelShare - 0.2) / 0.1) * 10;
  else if (travelShare <= 0.45)
    penalty = 10 + ((travelShare - 0.3) / 0.15) * 20;
  else penalty = Math.min(50, 30 + ((travelShare - 0.45) / 0.25) * 20);

  // One source of truth for "time at destination": derive it from the SAME
  // travel-day allocation the itinerary uses (short = none, medium = 2,
  // long = 4 dedicated travel days), so the Travel Fit value agrees with the
  // generated itinerary rather than from a raw hours/24 subtraction.
  // Fold (short) when the journey is same-day arrivable (depart morning,
  // arrive evening); medium = one dedicated travel day each way; long = the
  // journey spans two calendar days each way (preserved long-haul handling).
  const tier = oneWayHours <= 13 ? "short" : oneWayHours <= 16 ? "medium" : "long";
  let usableRaw;
  if (tier === "short") usableRaw = tripDays;
  else if (tier === "medium") usableRaw = tripDays - 2;
  else usableRaw = tripDays - 4;
  const usableDestinationDays = Math.max(0, Math.round(usableRaw * 2) / 2);

  let travelMode =
    (dest && dest.travel_mode) ||
    (isDomestic
      ? "Domestic flight + local ground transportation"
      : "International flight + local ground transportation");
  if (isDomestic && travelMode.includes("International flight"))
    travelMode = travelMode.replace("International flight", "Domestic flight");

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
    isDomestic
  };
}