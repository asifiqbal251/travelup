import { getCityCoords, getDestinationCoords } from "@/lib/coordinates";
import { haversineKm } from "@/lib/practicality";

// Moved verbatim from DoorB.jsx. Nearest-neighbor greedy route: starting from
// the destination nearest the departure city (if coords resolve), visit each
// remaining destination in order of proximity to the current position.
export function nearestNeighborOrder(dests, departureCity, residenceCountry) {
  if (dests.length <= 1) return [...dests];

  const depCoords = getCityCoords(departureCity || "", residenceCountry || "");

  let startIdx = 0;
  if (depCoords) {
    let nearestDist = Infinity;
    dests.forEach((d, i) => {
      const dc = getDestinationCoords(d);
      if (!dc) return;
      const dist = haversineKm(depCoords, dc);
      if (dist != null && dist < nearestDist) { nearestDist = dist; startIdx = i; }
    });
  }

  const remaining = dests.filter((_, i) => i !== startIdx);
  const ordered = [dests[startIdx]];

  while (remaining.length > 0) {
    const lastCoords = getDestinationCoords(ordered[ordered.length - 1]);
    let nearestIdx = 0;
    let nearestDist = Infinity;
    remaining.forEach((d, i) => {
      if (!lastCoords) return;
      const dc = getDestinationCoords(d);
      if (!dc) return;
      const dist = haversineKm(lastCoords, dc);
      if (dist != null && dist < nearestDist) { nearestDist = dist; nearestIdx = i; }
    });
    ordered.push(remaining[nearestIdx]);
    remaining.splice(nearestIdx, 1);
  }

  return ordered;
}

// Shared round-robin growth loop: grows each leg toward its max_days cap,
// earlier legs get priority each pass. Returns new legs array + leftover days.
export function distributeLeftovers(legs, remaining) {
  const result = legs.map((l) => ({ ...l }));
  let rem = remaining;
  while (rem > 0) {
    let grew = false;
    for (const leg of result) {
      if (rem === 0) break;
      const cap = leg.destination.max_days ?? Infinity;
      if (leg.days < cap) {
        leg.days += 1;
        rem -= 1;
        grew = true;
      }
    }
    if (!grew) break;
  }
  return { legs: result, freeDays: rem };
}

// Walk orderedDests in route order, greedily selecting each destination at its
// min_days floor until the budget runs out. Distributes leftover days
// round-robin up to each destination's max_days. freeDays > 0 after
// distribution means every kept leg is already at max_days.
export function fitDestinationsToDays(orderedDests, totalDays) {
  const selected = [];
  let remaining = totalDays;

  for (const dest of orderedDests) {
    const floor = dest.min_days || 1;
    if (remaining - floor < 0) break;
    selected.push({ destination: dest, days: floor });
    remaining -= floor;
  }

  const droppedCount = orderedDests.length - selected.length;

  if (selected.length === 0) {
    return { legs: [], droppedCount, freeDays: 0, tooShort: true };
  }

  const { legs, freeDays } = distributeLeftovers(selected, remaining);
  return { legs, droppedCount, freeDays, tooShort: false };
}

// Returns up to maxSuggestions destinations from orderedDests not already in
// selectedLegs, in route order. fits: false when min_days > freeDays — still
// returned so the UI can show the requirement rather than hiding the option.
export function suggestAdditions(orderedDests, selectedLegs, freeDays, maxSuggestions = 2) {
  const selectedIds = new Set(selectedLegs.map((l) => l.destination.id));
  const suggestions = [];
  for (const dest of orderedDests) {
    if (selectedIds.has(dest.id)) continue;
    suggestions.push({ destination: dest, fits: (dest.min_days || 1) <= freeDays });
    if (suggestions.length >= maxSuggestions) break;
  }
  return suggestions;
}

// Appends destToAdd at min_days, re-sorts to preserve route order, then
// distributes the remaining freeDays across all legs round-robin.
export function addDestination(selectedLegs, destToAdd, orderedDests, freeDays) {
  const newLeg = { destination: destToAdd, days: destToAdd.min_days || 1 };
  const combined = [...selectedLegs, newLeg];
  const posMap = new Map(orderedDests.map((d, i) => [d.id, i]));
  combined.sort(
    (a, b) =>
      (posMap.get(a.destination.id) ?? 999) - (posMap.get(b.destination.id) ?? 999)
  );
  const remaining = freeDays - (destToAdd.min_days || 1);
  const { legs, freeDays: newFreeDays } = distributeLeftovers(
    combined,
    Math.max(0, remaining)
  );
  return { legs, droppedCount: 0, freeDays: newFreeDays, tooShort: false };
}

// Removes the leg for destId, then redistributes the freed days (plus any
// existing freeDays) across the remaining legs round-robin.
export function removeDestination(selectedLegs, destId, freeDays) {
  const removedLeg = selectedLegs.find((l) => l.destination.id === destId);
  const freedDays = removedLeg ? removedLeg.days : 0;
  const remaining = freedDays + freeDays;
  const filtered = selectedLegs.filter((l) => l.destination.id !== destId);

  if (filtered.length === 0) {
    return { legs: [], droppedCount: 0, freeDays: remaining, tooShort: false };
  }

  const { legs, freeDays: newFreeDays } = distributeLeftovers(filtered, remaining);
  return { legs, droppedCount: 0, freeDays: newFreeDays, tooShort: false };
}
