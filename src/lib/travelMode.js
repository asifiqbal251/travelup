// Display-only helpers for travel-mode and travel-time presentation.
//
// normalizeMode() maps the curated travel_mode vocabulary (and the regional-
// route override mode strings from regionalRoutes.js) to compact one-line
// labels for the results cards, the destination modal and the trip-page Travel
// Fit panel. The stored travel_mode value is NEVER changed by this —
// practicality.js still returns the raw string, and scoring / eligibility
// never read from here.
//
// roundedTravelHours() rounds a modelled one-way time to the nearest whole
// hour for display only. practicality.js keeps the raw unrounded value because
// usableDestinationDays and the isPractical eligibility gate calculate from
// it — rounding upstream would change which destinations qualify for which
// trip lengths (a scoring change, not a copy change).

// Ordered [pattern, replacement] regex pairs, applied in sequence so the more
// specific multi-segment patterns match before the generic bare-mode
// fallbacks. Case-insensitive.
const RULES = [
  // International flight + local ground/rail/public transport
  [/international flight \+ local (?:rail\/)?ground transportation/gi, "Flight + local transit"],
  [/international flight \+ local public transportation/gi, "Flight + local transit"],
  // International flight + metro and taxis
  [/international flight \+ metro and taxis/gi, "Flight + metro & taxi"],
  // International flight + domestic connection + (ground transfer | rental car)
  [/international flight \+ domestic connection \+ ground transfer/gi, "Flight + connection + transfer"],
  [/international flight \+ domestic connection \+ rental car/gi, "Flight + connection + car"],
  // International flight + ferry/ground transfer
  [/international flight \+ ferry\/ground transfer/gi, "Flight + ferry + transfer"],
  // International flight + train/ground transfer
  [/international flight \+ train\/ground transfer/gi, "Flight + train + transfer"],
  // International flight + (domestic) transfer
  [/international flight \+ domestic transfer/gi, "Flight + transfer"],
  [/international flight \+ ground transfer/gi, "Flight + transfer"],
  // Bare international-flight fallback (catches any unmapped variant)
  [/international flight/gi, "Flight"],
  // Domestic-flight variants — practicality.js swaps "International flight" →
  // "Domestic flight" for same-country trips before returning travelMode.
  [/domestic flight \+ local ground transportation/gi, "Flight + local transit"],
  [/domestic flight \+ ground transfer/gi, "Flight + transfer"],
  [/domestic flight/gi, "Flight"],
  // Short flight + local transport
  [/short flight \+ local transport/gi, "Short flight + transit"],
  // Flight to Inverness + road transfer
  [/flight to inverness \+ road transfer/gi, "Flight + road transfer"],
  // Flight, train or drive / Flight or drive depending on origin
  [/flight, train or drive depending on origin/gi, "Flight, train or drive"],
  [/flight or drive depending on origin/gi, "Flight or drive"],
  // Eurostar
  [/eurostar \+ onward belgian train/gi, "Eurostar + local train"],
  [/direct eurostar train/gi, "Direct Eurostar"],
  // Train
  [/direct train \+ local transfer/gi, "Train + local transfer"],
  [/train \+ onward local transfer/gi, "Train + local transfer"],
  [/direct train/gi, "Direct train"],
  // Drive
  [/drive or ground transfer from a (?:california|bay area) gateway/gi, "Drive or transfer"],
  [/drive and ferry, regional flight or floatplane/gi, "Drive, ferry or flight"],
  [/drive or regional flight/gi, "Drive or flight"],
  [/drive or scheduled shuttle/gi, "Drive or shuttle"],
  [/driving \+ boat transfer/gi, "Drive + boat"],
  // Ferry
  [/ferry \+ ground transfer/gi, "Ferry + transfer"],
  [/ferry, short flight or ground connections depending on origin/gi, "Ferry, flight or transfer"]
];

export function normalizeMode(mode) {
  if (!mode) return "Local transport";
  let m = String(mode);
  for (const [pattern, replacement] of RULES) {
    m = m.replace(pattern, replacement);
  }
  return m.trim();
}

// Round a modelled one-way travel time to the nearest whole hour for display.
// Returns null for missing/invalid input so callers can fall back gracefully.
export function roundedTravelHours(hours) {
  const n = Number(hours);
  if (hours == null || Number.isNaN(n)) return null;
  return Math.round(n);
}