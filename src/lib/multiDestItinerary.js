import { generateItinerary } from "@/lib/itinerary";
import { haversineKm } from "@/lib/practicality";
import { getDestinationCoords } from "@/lib/coordinates";

// Transit-time formula mirrors practicality.js flightHours (not exported — §2 of brief).
// distanceKm / 800 gives a ~800 km/h cruise estimate; 0.75 is a 45-minute boarding allowance.
function estimateTransitHours(distanceKm) {
  return distanceKm / 800 + 0.75;
}

function formatHours(h) {
  const rounded = Math.round(h * 2) / 2; // nearest 0.5hr
  return `~${rounded}hr`;
}

// Distance band for mode label — same wording pattern used elsewhere in the app.
const FLIGHT_THRESHOLD_KM = 400;

function transitModeLabel(distanceKm) {
  return distanceKm >= FLIGHT_THRESHOLD_KM ? "flight" : "overland";
}

// Strip isTravel days from the start (outbound travel — assumes departure from home).
function dropLeadingTravel(days) {
  let i = 0;
  while (i < days.length && days[i].isTravel) i++;
  return days.slice(i);
}

// Strip isTravel days from the end (return travel — assumes return to home).
function dropTrailingTravel(days) {
  let i = days.length - 1;
  while (i >= 0 && days[i].isTravel) i--;
  return days.slice(0, i + 1);
}

function makeTransitDay(fromDest, toDest) {
  const fromCoords = getDestinationCoords(fromDest);
  const toCoords = getDestinationCoords(toDest);

  const placeholder = {
    isTravel: true,
    flexible: false,
    isTransitBoundary: true,
    legDestinationId: toDest.id,
    label: "Travel day",
    events: [],
    intensity: null,
    overnight: toDest.name,
  };

  if (!fromCoords || !toCoords) {
    console.warn(
      `[multiDestItinerary] Missing gateway coords for ${fromDest.name} → ${toDest.name} — inserting placeholder transit day.`
    );
    return {
      ...placeholder,
      title: `${fromDest.name} → ${toDest.name} (transit)`,
      description: `Travel from ${fromDest.name} to ${toDest.name}. Journey time estimate unavailable — verify local transport options.`,
    };
  }

  const distKm = haversineKm(fromCoords, toCoords);
  if (distKm == null) {
    console.warn(
      `[multiDestItinerary] haversineKm returned null for ${fromDest.name} → ${toDest.name} — inserting placeholder.`
    );
    return {
      ...placeholder,
      title: `${fromDest.name} → ${toDest.name} (transit)`,
      description: `Travel from ${fromDest.name} to ${toDest.name}. Journey time estimate unavailable.`,
    };
  }

  const hours = estimateTransitHours(distKm);
  const mode = transitModeLabel(distKm);
  const hoursLabel = formatHours(hours);
  const transitTitle = `${fromDest.name} → ${toDest.name}, ${hoursLabel} ${mode}`;

  return {
    ...placeholder,
    title: transitTitle,
    description: `Travel from ${fromDest.name} to ${toDest.name} by ${mode}. Estimated journey: ${hoursLabel}.`,
    events: [{ slot: "Transit", name: transitTitle }],
    transitKm: Math.round(distKm),
    transitHours: Math.round(hours * 10) / 10,
    transitMode: mode,
  };
}

// Generate a stitched multi-destination itinerary.
// legs: [{destination, days}] — ordered list from the leg planner (§4)
// prefs: the standard buildPrefs() output, applied trip-wide
//
// Per leg: calls generateItinerary exactly as it works today, then stitches by
// dropping the trailing return-travel days from leg N and the leading outbound-
// travel days from leg N+1, replacing both with one transit day.
export function generateMultiDestItinerary(legs, prefs) {
  if (!legs || legs.length === 0) return [];
  if (legs.length === 1) {
    return generateItinerary(legs[0].destination, { ...prefs, travelDays: legs[0].days });
  }

  // Generate each leg's standalone itinerary
  const perLeg = legs.map((leg) =>
    generateItinerary(leg.destination, { ...prefs, travelDays: leg.days })
  );

  // Trim each leg: drop outbound days from non-first, drop return days from non-last
  const trimmed = perLeg.map((days, i) => {
    let d = days;
    if (i > 0) d = dropLeadingTravel(d);
    if (i < legs.length - 1) d = dropTrailingTravel(d);
    // Tag every day with the leg it belongs to
    return d.map((day) => ({ ...day, legDestinationId: legs[i].destination.id }));
  });

  // Stitch: interleave transit days between legs and renumber sequentially
  const allDays = [];
  let counter = 1;

  for (let i = 0; i < trimmed.length; i++) {
    for (const day of trimmed[i]) {
      allDays.push({ ...day, day: counter++ });
    }
    if (i < trimmed.length - 1) {
      const transit = makeTransitDay(legs[i].destination, legs[i + 1].destination);
      allDays.push({ ...transit, day: counter++ });
    }
  }

  return allDays;
}
