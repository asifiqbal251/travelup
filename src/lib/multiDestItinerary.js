import { generateItinerary } from "@/lib/itinerary";
import { haversineKm, assessPracticality } from "@/lib/practicality";
import { getDestinationCoords } from "@/lib/coordinates";
import { distributeLeftovers } from "@/lib/tripFit";

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

// A fold/partialFold-tier leg embeds its outbound/return travel as seq() entries
// (time: null) inside a normal activity day (isTravel: false). Detect these.
function isFoldBoundaryDay(day) {
  return day.isTravel === false
    && Array.isArray(day.timeline)
    && day.timeline.some((e) => e.time == null);
}

// Strip the journey seq() lines from a fold-boundary day, fix overnight, clear journey.
// Returns null if no real activity entries remain (caller should drop the day entirely).
function stripFoldBoundaryDay(day, destName) {
  const activities = day.timeline.filter((e) => e.time != null);
  if (activities.length === 0) return null;
  return { ...day, timeline: activities, overnight: destName, journey: null };
}

// Trim the leading edge of a non-first leg's day array.
// Drops pure isTravel days (medium/long tiers, unchanged behaviour), then
// strips seq journey lines from a fold-boundary day if one sits at the new start.
function trimLeadingEdge(days, destName) {
  let start = 0;
  while (start < days.length && days[start].isTravel) start++;
  const d = start > 0 ? days.slice(start) : days;
  if (d.length > 0 && isFoldBoundaryDay(d[0])) {
    const stripped = stripFoldBoundaryDay(d[0], destName);
    if (stripped === null) return d.slice(1);
    return [stripped, ...d.slice(1)];
  }
  return d;
}

// Trim the trailing edge of a non-last leg's day array.
// Drops pure isTravel days (medium/long tiers, unchanged behaviour), then
// strips seq journey lines from a fold-boundary day if one sits at the new end.
function trimTrailingEdge(days, destName) {
  let end = days.length - 1;
  while (end >= 0 && days[end].isTravel) end--;
  const d = days.slice(0, end + 1);
  if (d.length > 0 && isFoldBoundaryDay(d[d.length - 1])) {
    const stripped = stripFoldBoundaryDay(d[d.length - 1], destName);
    if (stripped === null) return d.slice(0, -1);
    return [...d.slice(0, -1), stripped];
  }
  return d;
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

// generateItinerary() spends a tier-dependent number of days on round-trip travel
// from home (itinerary.js:586-589) which the stitcher then trims away. Rather than
// duplicating that tier→overhead table here — itinerary.js is protected and its
// arithmetic may change — ask for progressively longer trips until the trimmed
// result is the length this leg actually needs.
//
// Never truncates from the end to force a fit (that is how return-home days get
// silently eaten). If no request lands exactly on target, returns the longest
// trimmed result still under it, or [] if every request trims to nothing.
const MAX_REQUEST_DAYS = 14; // generateItinerary clamps travelDays to 14

function generateLegDays(leg, prefs, isFirst, isLast, target) {
  // travelDays: 0 is falsy and generateItinerary would default it to 7.
  if (target < 1) return [];
  let bestUnder = null;
  for (let request = target; request <= MAX_REQUEST_DAYS; request++) {
    let d = generateItinerary(leg.destination, { ...prefs, travelDays: request });
    if (!isFirst) d = trimLeadingEdge(d, leg.destination.name);
    if (!isLast) d = trimTrailingEdge(d, leg.destination.name);
    if (d.length === target) return d;
    if (d.length > target) break;          // overshot; fall back to bestUnder
    if (d.length > 0) bestUnder = d;       // keep the longest short result
  }
  return bestUnder || [];
}

function legTier(leg, prefs) {
  return assessPracticality(leg.destination, { ...prefs, travelDays: leg.days }).tier;
}

// Generate a stitched multi-destination itinerary.
// legs: [{destination, days}] — ordered list from the leg planner (§4)
// prefs: the standard buildPrefs() output, applied trip-wide
//
// Day accounting: each leg's `days` are calendar days inside the traveller's
// budget, and the transit day between two legs is the day the earlier leg is
// left. So a non-last leg contributes `days - 1` of its own plus the transit day
// after it, and the last leg contributes `days` (keeping its return home). The
// total is sum(leg.days) — never more.
//
// A leg that would contribute zero days is dropped with a console warning and the
// remaining legs are regenerated, because dropping a first/last leg changes which
// neighbour keeps the outbound/return travel. The dropped leg's allocated days are
// not lost: they're redistributed round-robin to the surviving legs (same
// distribute-to-max_days strategy tripFit.js uses pre-build), up to each leg's own
// max_days and never below any leg's own min_days (redistribution only grows legs,
// it never shrinks one). This keeps the trip's total length equal to the
// traveller's original day budget even when a destination doesn't make the cut.
// Every drop is strictly one fewer active leg, so the retry loop below always
// terminates.
//
// Returns { days, legDays, droppedLegs }. legDays is [{destinationId, days}] for
// the legs that were actually built, each non-last leg counting its outgoing
// transit day, so sum(legDays[].days) === days.length. droppedLegs is
// [{destinationId, destinationName, allocatedDays, minDays}] for any leg removed
// during the retry loop (empty array if nothing was dropped).
export function generateMultiDestItinerary(legs, prefs) {
  if (!legs || legs.length === 0) return { days: [], legDays: [], droppedLegs: [] };

  let active = legs.slice();
  const droppedLegs = [];
  let trimmed;
  for (;;) {
    if (active.length === 1) {
      const only = active[0];
      const days = generateItinerary(only.destination, { ...prefs, travelDays: only.days });
      return {
        days,
        legDays: days.length ? [{ destinationId: only.destination.id, days: days.length }] : [],
        droppedLegs,
      };
    }

    trimmed = active.map((leg, i) => {
      const isLast = i === active.length - 1;
      const target = isLast ? leg.days : leg.days - 1;
      const d = generateLegDays(leg, prefs, i === 0, isLast, target);
      if (d.length > 0 && d.length < target) {
        console.warn(
          `[multiDestItinerary] ${leg.destination.name} built ${d.length} of ${target} target days (allocated ${leg.days}d, tier ${legTier(leg, prefs)}).`
        );
      }
      // Tag every day with the leg it belongs to
      return d.map((day) => ({ ...day, legDestinationId: leg.destination.id }));
    });

    const emptyIdx = trimmed.findIndex((d) => d.length === 0);
    if (emptyIdx === -1) break;
    const dropped = active[emptyIdx];
    console.warn(
      `[multiDestItinerary] Dropping ${dropped.destination.name} from the trip: allocated ${dropped.days}d (tier ${legTier(dropped, prefs)}) but it produced no days.`
    );
    droppedLegs.push({
      destinationId: dropped.destination.id,
      destinationName: dropped.destination.name,
      allocatedDays: dropped.days,
      minDays: dropped.destination.min_days || 1,
    });
    const survivors = active.filter((_, i) => i !== emptyIdx);
    // Give the dropped leg's days back to the trip: round-robin them onto the
    // remaining legs up to each one's own max_days cap. distributeLeftovers only
    // grows legs (never below their own min_days) and strictly shrinks
    // active.length above, so this loop is guaranteed to terminate.
    const { legs: grown } = distributeLeftovers(survivors, dropped.days);
    active = grown;
  }

  // Stitch: interleave transit days between legs and renumber sequentially
  const allDays = [];
  const legDays = [];
  let counter = 1;

  for (let i = 0; i < trimmed.length; i++) {
    for (const day of trimmed[i]) {
      allDays.push({ ...day, day: counter++ });
    }
    let achieved = trimmed[i].length;
    if (i < trimmed.length - 1) {
      const transit = makeTransitDay(active[i].destination, active[i + 1].destination);
      allDays.push({ ...transit, day: counter++ });
      achieved += 1;
    }
    legDays.push({ destinationId: active[i].destination.id, days: achieved });
  }

  return { days: allDays, legDays, droppedLegs };
}
