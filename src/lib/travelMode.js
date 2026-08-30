// Shared travel-mode label vocabulary, used to keep "Getting there" wording
// consistent wherever a travel mode string is displayed.

// Cosmetic wording cleanup only (e.g. "ground transportation" -> "local
// transport"). Safe to apply to any mode string, curated or generated.
export function normalizeMode(mode) {
  if (!mode) return "Local transport";
  return String(mode)
    .replace(/local ground transportation/gi, "local transport")
    .replace(/ground transportation/gi, "local transport")
    .replace(/ground transfer/gi, "transfer");
}

// The generic label for a route with no curated regional-route override:
// a flight (domestic or international) plus local transport at the
// destination. Used instead of the destination's single authored
// `travel_mode` field, which is often written assuming one specific nearby
// origin and is not accurate for every traveller's actual origin.
export function genericTravelMode(isDomestic) {
  return normalizeMode(
    isDomestic
      ? "Domestic flight + local ground transportation"
      : "International flight + local ground transportation"
  );
}

// Round a modelled one-way travel time to the nearest whole hour for
// display only. practicality.js keeps the raw unrounded value — rounding
// upstream would change which destinations qualify for which trip lengths.
export function roundedTravelHours(hours) {
  const n = Number(hours);
  if (hours == null || Number.isNaN(n)) return null;
  return Math.round(n);
}
