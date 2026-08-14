// Deterministic travel-practicality assessment for TravelUp.
// Uses departure city, destination gateway coordinates, a geographic-distance
// band, an airport/transfer allowance, a curated internal-access penalty and
// the selected trip duration. No live geocoding or flight APIs.

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

// Approximate one-way flight time by distance band (hours). These are planning
// bands, not claims about live schedules; no direct flights are implied.
function flightHours(distanceKm) {
  if (distanceKm == null) return null;
  if (distanceKm < 400) return 2.5;
  if (distanceKm < 900) return 3.5;
  if (distanceKm < 1800) return 4.5;
  if (distanceKm < 3500) return 6;
  if (distanceKm < 5500) return 8.5;
  if (distanceKm < 8000) return 11;
  if (distanceKm < 11000) return 14;
  return 17;
}

// Airport check-in, security and ground transfers at both ends (one-way).
const TRANSFER_ALLOWANCE = 2.5;

export function practicalThreshold(tripDays) {
  const d = Number(tripDays);
  if (d <= 3) return 5;
  if (d === 4) return 7;
  if (d <= 6) return 10;
  if (d <= 9) return 15;
  return 22; // 10-14
}

export function assessPracticality(dest, prefs) {
  const destCoords = getDestinationCoords(dest);
  const origin = getCityCoords(
    prefs && prefs.departureCity,
    prefs && prefs.residenceCountry
  );
  const internalAccess = Number((dest && dest.internal_access_penalty) || 0);

  let distanceKm = null;
  let oneWayHours;
  let known = true;

  if (origin && destCoords) {
    distanceKm = haversineKm(origin, destCoords);
    oneWayHours = flightHours(distanceKm) + TRANSFER_ALLOWANCE + internalAccess;
  } else {
    // Conservative fallback when a city is not recognized.
    known = false;
    oneWayHours = 8.5 + internalAccess;
  }

  const threshold = practicalThreshold(prefs && prefs.travelDays);
  const stretchUpper = Math.round(threshold * 1.8);

  let level;
  if (oneWayHours <= threshold) level = "Practical";
  else if (oneWayHours <= stretchUpper) level = "Stretch";
  else level = "Poor";

  const days = prefs && prefs.travelDays ? prefs.travelDays : "short";
  const explanation =
    level === "Practical"
      ? "Practical for your selected trip length."
      : level === "Stretch"
      ? "Possible, but travel time may consume a significant part of your trip."
      : `Not practical for a ${days}-day trip from your departure location.`;

  return {
    level,
    oneWayHours: Math.round(oneWayHours * 10) / 10,
    threshold,
    stretchUpper,
    distanceKm: distanceKm ? Math.round(distanceKm) : null,
    known,
    explanation
  };
}