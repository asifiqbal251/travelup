// Resolved origin chip list for Door 1. Imports from questionnaireFlow.js
// without modifying it. Resolution order:
//   1. Returning user's saved departureCity (caller supplies it)
//   2. Timezone inference (Intl.DateTimeFormat) — no permission prompt, free, synchronous
//   3. Static ORIGIN_CHIPS fallback
//
// No Geolocation API. No IP-geolocation service. No new network dependencies.
// Any failure falls through silently to the next layer.

import { ORIGIN_CHIPS, ORIGIN_SUGGESTIONS } from "@/lib/questionnaireFlow";

// Map from Intl timezone city portion to a representative city in ORIGIN_SUGGESTIONS.
// Only cities that appear in ORIGIN_SUGGESTIONS are listed; the broad-area
// companions are chosen to give regional variety.
const TZ_CITY_MAP = {
  Vancouver: "Vancouver",
  Toronto: "Toronto",
  Montreal: "Montreal",
  Calgary: "Calgary",
  Los_Angeles: "Los Angeles",
  New_York: "New York",
  Chicago: "Chicago",
  Miami: "Miami",
  San_Francisco: "San Francisco",
  Mexico_City: "Mexico City",
  Paris: "Paris",
  London: "London",
  Edinburgh: "Edinburgh",
  Dublin: "Dublin",
  Amsterdam: "Amsterdam",
  Berlin: "Berlin",
  Rome: "Rome",
  Madrid: "Madrid",
  Barcelona: "Barcelona",
  Lisbon: "Lisbon",
  Athens: "Athens",
  Istanbul: "Istanbul",
  Stockholm: "Stockholm",
  Copenhagen: "Copenhagen",
  Oslo: "Oslo",
  Helsinki: "Helsinki",
  Reykjavik: "Reykjavik",
  Tokyo: "Tokyo",
  Seoul: "Seoul",
  Shanghai: "Shanghai",
  Hong_Kong: "Hong Kong",
  Singapore: "Singapore",
  Bangkok: "Bangkok",
  Kuala_Lumpur: "Kuala Lumpur",
  Jakarta: "Jakarta",
  Manila: "Manila",
  Kolkata: "Kolkata",
  Calcutta: "Kolkata",
  Dhaka: "Dhaka",
  Chittagong: "Chittagong",
  Karachi: "Karachi",
  Dubai: "Dubai",
  Riyadh: "Riyadh",
  Doha: "Doha",
  Tbilisi: "Tbilisi",
  Tehran: "Tehran",
  Delhi: "Delhi",
  Mumbai: "Mumbai",
  Bengaluru: "Bengaluru",
  Kolkata2: "Kolkata",
  Chennai: "Chennai",
  Hyderabad: "Hyderabad",
  Kolkata3: "Kolkata",
  Kochi: "Kochi",
  Colombo: "Colombo",
  Kathmandu: "Kathmandu",
  Hanoi: "Hanoi",
  Ho_Chi_Minh: "Ho Chi Minh",
  Phnom_Penh: "Phnom Penh",
  Cairo: "Cairo",
  Casablanca: "Casablanca",
  Nairobi: "Nairobi",
  Johannesburg: "Johannesburg",
  Cape_Town: "Cape Town",
  Lagos: "Lagos",
  Accra: "Accra",
  Dar_es_Salaam: "Dar es Salaam",
  Sydney: "Sydney",
  Melbourne: "Melbourne",
  Perth: "Perth",
  Auckland: "Auckland",
  Wellington: "Wellington",
  Sao_Paulo: "São Paulo",
  Rio_de_Janeiro: "Rio de Janeiro",
  Buenos_Aires: "Buenos Aires",
  Santiago: "Santiago",
  Lima: "Lima",
  Bogota: "Bogota",
};

// Broad-area companions shown alongside the inferred city.
const AREA_COMPANIONS = {
  "Vancouver": ["Toronto", "Los Angeles", "San Francisco"],
  "Toronto": ["Montreal", "Vancouver", "New York"],
  "Montreal": ["Toronto", "Vancouver", "New York"],
  "Calgary": ["Vancouver", "Toronto", "Los Angeles"],
  "Los Angeles": ["San Francisco", "Vancouver", "New York"],
  "San Francisco": ["Los Angeles", "Vancouver", "New York"],
  "New York": ["Miami", "Chicago", "London"],
  "Chicago": ["New York", "Miami", "Los Angeles"],
  "Miami": ["New York", "Chicago", "Los Angeles"],
  "Mexico City": ["Los Angeles", "Miami", "New York"],
  "Paris": ["London", "Amsterdam", "Rome"],
  "London": ["Paris", "Amsterdam", "Dublin"],
  "Edinburgh": ["London", "Dublin", "Paris"],
  "Dublin": ["London", "Edinburgh", "Paris"],
  "Amsterdam": ["London", "Paris", "Berlin"],
  "Berlin": ["Amsterdam", "Paris", "Rome"],
  "Rome": ["Madrid", "Barcelona", "Paris"],
  "Madrid": ["Barcelona", "Lisbon", "Paris"],
  "Barcelona": ["Madrid", "Lisbon", "Paris"],
  "Lisbon": ["Madrid", "Barcelona", "London"],
  "Athens": ["Istanbul", "Rome", "Barcelona"],
  "Istanbul": ["Athens", "Dubai", "Rome"],
  "Stockholm": ["Copenhagen", "Oslo", "Amsterdam"],
  "Copenhagen": ["Stockholm", "Oslo", "Amsterdam"],
  "Oslo": ["Stockholm", "Copenhagen", "Amsterdam"],
  "Helsinki": ["Stockholm", "Oslo", "Amsterdam"],
  "Reykjavik": ["London", "Amsterdam", "Toronto"],
  "Tokyo": ["Seoul", "Singapore", "Bangkok"],
  "Seoul": ["Tokyo", "Singapore", "Bangkok"],
  "Shanghai": ["Beijing", "Seoul", "Tokyo"],
  "Hong Kong": ["Singapore", "Bangkok", "Tokyo"],
  "Singapore": ["Bangkok", "Kuala Lumpur", "Jakarta"],
  "Bangkok": ["Singapore", "Kuala Lumpur", "Ho Chi Minh"],
  "Kuala Lumpur": ["Singapore", "Bangkok", "Jakarta"],
  "Jakarta": ["Singapore", "Bangkok", "Sydney"],
  "Manila": ["Singapore", "Bangkok", "Hong Kong"],
  "Delhi": ["Mumbai", "Bengaluru", "Kolkata"],
  "Mumbai": ["Delhi", "Bengaluru", "Kochi"],
  "Bengaluru": ["Mumbai", "Chennai", "Hyderabad"],
  "Kolkata": ["Delhi", "Mumbai", "Dhaka"],
  "Chennai": ["Bengaluru", "Hyderabad", "Kochi"],
  "Hyderabad": ["Bengaluru", "Chennai", "Mumbai"],
  "Kochi": ["Mumbai", "Bengaluru", "Chennai"],
  "Dhaka": ["Kolkata", "Delhi", "Mumbai"],
  "Chittagong": ["Dhaka", "Kolkata", "Mumbai"],
  "Colombo": ["Kochi", "Mumbai", "Singapore"],
  "Kathmandu": ["Delhi", "Kolkata", "Mumbai"],
  "Dubai": ["Abu Dhabi", "Doha", "Istanbul"],
  "Doha": ["Dubai", "Istanbul", "Cairo"],
  "Cairo": ["Istanbul", "Doha", "Casablanca"],
  "Casablanca": ["Lisbon", "Madrid", "Cairo"],
  "Nairobi": ["Johannesburg", "Cape Town", "Lagos"],
  "Johannesburg": ["Cape Town", "Nairobi", "Lagos"],
  "Cape Town": ["Johannesburg", "Nairobi", "Lagos"],
  "Lagos": ["Accra", "Nairobi", "Cairo"],
  "Accra": ["Lagos", "Nairobi", "Cape Town"],
  "Sydney": ["Melbourne", "Auckland", "Singapore"],
  "Melbourne": ["Sydney", "Auckland", "Singapore"],
  "Perth": ["Sydney", "Melbourne", "Singapore"],
  "Auckland": ["Wellington", "Sydney", "Singapore"],
  "Wellington": ["Auckland", "Sydney", "Melbourne"],
  "São Paulo": ["Rio de Janeiro", "Buenos Aires", "Lima"],
  "Buenos Aires": ["São Paulo", "Santiago", "Lima"],
  "Santiago": ["Buenos Aires", "Lima", "São Paulo"],
  "Lima": ["Buenos Aires", "Santiago", "São Paulo"],
  "Bogota": ["Lima", "Buenos Aires", "São Paulo"],
};

function tzCityToSuggestion(tzCity) {
  // Intl gives "Vancouver", "Los_Angeles", "Ho_Chi_Minh", etc.
  // Normalise underscores to spaces and look up.
  const spaced = tzCity.replace(/_/g, " ");
  // Direct hit
  if (TZ_CITY_MAP[tzCity]) return TZ_CITY_MAP[tzCity];
  // Try space-normalised key
  const found = Object.keys(TZ_CITY_MAP).find(
    (k) => k.replace(/_/g, " ").toLowerCase() === spaced.toLowerCase()
  );
  return found ? TZ_CITY_MAP[found] : null;
}

function inferChipsFromTimezone() {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone; // e.g. "America/Vancouver"
    if (!tz) return null;
    const parts = tz.split("/");
    const cityPart = parts[parts.length - 1]; // "Vancouver", "Los_Angeles", etc.
    const city = tzCityToSuggestion(cityPart);
    if (!city) return null;
    // Verify city is in ORIGIN_SUGGESTIONS
    if (!ORIGIN_SUGGESTIONS.includes(city)) return null;
    // Build chip list: inferred city + up to 2 area companions
    const companions = (AREA_COMPANIONS[city] || [])
      .filter((c) => ORIGIN_SUGGESTIONS.includes(c))
      .slice(0, 2);
    const chips = [city, ...companions];
    // Pad to 4 with fallback ORIGIN_CHIPS not already in list
    for (const fb of ORIGIN_CHIPS) {
      if (chips.length >= 4) break;
      if (!chips.includes(fb)) chips.push(fb);
    }
    return chips.slice(0, 4);
  } catch {
    return null;
  }
}

// Main export — resolves the chip list for the origin question.
// savedCity: the user's last saved departureCity (string or null).
export function resolveOriginChips(savedCity) {
  try {
    // Layer 1: returning user's city leads
    if (savedCity && typeof savedCity === "string" && savedCity.trim()) {
      const city = savedCity.trim();
      const companions = (AREA_COMPANIONS[city] || [])
        .filter((c) => ORIGIN_SUGGESTIONS.includes(c))
        .slice(0, 2);
      const chips = [city, ...companions];
      for (const fb of ORIGIN_CHIPS) {
        if (chips.length >= 4) break;
        if (!chips.includes(fb)) chips.push(fb);
      }
      return chips.slice(0, 4);
    }
  } catch {
    // fall through
  }

  try {
    // Layer 2: timezone inference
    const tzChips = inferChipsFromTimezone();
    if (tzChips) return tzChips;
  } catch {
    // fall through
  }

  // Layer 3: static fallback
  return ORIGIN_CHIPS;
}
