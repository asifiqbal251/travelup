// Deterministic regional-route overrides for nearby destinations reached by
// driving, ferry, train or shuttle, plus curated local-transport guidance.
// When a route matches, its complete one-way journey time (already including
// the practical transport burden) replaces the straight-line flight estimate.
// No live schedules; planning estimates only.

// Accent- and punctuation-insensitive normalization, shared with scoring.js
// so user-typed exclusion terms match destination names containing diacritics
// (e.g. "Montreal" matches "Montréal").
export function norm(s) {
  if (!s) return "";
  return String(s)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, "and")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Canonical origin matching, supporting common equivalents and state/province
// suffixes: "Vancouver, BC" -> "vancouver", "LA" -> "los angeles", "SF" -> "san francisco".
const ORIGIN_ALIASES = {
  vancouver: "vancouver",
  "los angeles": "los angeles",
  la: "los angeles",
  "san francisco": "san francisco",
  sf: "san francisco",
  london: "london",
  "london uk": "london",
  "london england": "london"
};

function originKey(raw) {
  const n = norm(raw);
  const stripped = n
    .replace(/\b(bc|ca|wa|or|ny|tx|fl|il|nv|az|on|ab|qc)\b/g, " ")
    .trim()
    .replace(/\s+/g, " ");
  return ORIGIN_ALIASES[stripped] || ORIGIN_ALIASES[n] || stripped || n;
}

function destKey(raw) {
  return norm(raw);
}

// One-way journey times already include the practical transport burden; do not
// add flight overhead, connection hours or internal-access hours on top.
const OVERRIDES = [
  { country: "Canada", origin: "vancouver", dest: "victoria", mode: "Ferry + ground transfer", oneWayHours: 4 },
  { country: "Canada", origin: "vancouver", dest: "whistler", mode: "Drive or scheduled shuttle", oneWayHours: 2 },
  { country: "Canada", origin: "vancouver", dest: "tofino", mode: "Ferry + drive", oneWayHours: 6 },
  { country: "Canada", origin: "vancouver", dest: "kelowna and the okanagan valley", mode: "Drive", oneWayHours: 4.5 },
  { country: "United States", origin: "los angeles", dest: "san diego", mode: "Drive or train", oneWayHours: 2.5 },
  { country: "United States", origin: "los angeles", dest: "las vegas", mode: "Flight or drive", oneWayHours: 4.5 },
  { country: "United States", origin: "san francisco", dest: "napa and sonoma", mode: "Drive", oneWayHours: 1.5 },
  { country: "United States", origin: "san francisco", dest: "yosemite national park", mode: "Drive", oneWayHours: 4.5 },
  { country: "United Kingdom", origin: "london", dest: "paris", mode: "Direct Eurostar train", oneWayHours: 3 },
  { country: "United Kingdom", origin: "london", dest: "edinburgh", mode: "Direct train", oneWayHours: 4.5 },
  { country: "United Kingdom", origin: "london", dest: "amsterdam", mode: "Direct Eurostar train", oneWayHours: 5 },
  { country: "United Kingdom", origin: "london", dest: "bath", mode: "Direct train + local transfer", oneWayHours: 2 },
  { country: "United Kingdom", origin: "london", dest: "lake district", mode: "Train + onward local transfer", oneWayHours: 4 },
  { country: "United Kingdom", origin: "london", dest: "brussels and bruges", mode: "Eurostar + onward Belgian train", oneWayHours: 3.5 },
  { country: "United Kingdom", origin: "london", dest: "isle of skye", mode: "Flight to Inverness + road transfer", oneWayHours: 8 }
];

// Returns { mode, oneWayHours } when an override matches, otherwise null.
export function getRegionalRoute(prefs, dest) {
  if (!prefs || !dest) return null;
  const country = norm(prefs.residenceCountry);
  const ok = originKey(prefs.departureCity);
  const dk = destKey(dest.name);
  if (!country || !ok || !dk) return null;
  const m = OVERRIDES.find(
    (o) => norm(o.country) === country && o.origin === ok && o.dest === dk
  );
  return m ? { mode: m.mode, oneWayHours: m.oneWayHours } : null;
}

// Curated local-transport guidance for the eight new short-trip destinations.
const LOCAL_TRANSPORT = {
  "Victoria": "Walking, local buses, taxis and harbour transport where useful.",
  "Whistler": "Walking, village transit and local shuttles.",
  "Tofino": "Rental car or local taxi/shuttle, with walking in the village.",
  "Kelowna and the Okanagan Valley": "Car, designated-driver tour or local transportation.",
  "San Diego": "Public transit, rideshare or car depending on the area.",
  "Las Vegas": "Walking, monorail, taxi or rideshare.",
  "Napa and Sonoma": "Guided tour, designated driver or car when no tasting is involved.",
  "Yosemite National Park": "Park shuttle when operating, car and walking trails.",
  "Paris": "Walking and the metro; taxis for longer hops.",
  "Edinburgh": "Walking and Lothian buses; taxis for longer hops.",
  "Amsterdam": "Walking, trams and bikes; taxis for longer hops.",
  "Bath": "Walking; local buses and taxis for longer hops.",
  "Lake District": "Local buses and a car give the most flexibility; taxis with prior booking.",
  "Dublin": "Walking, Dublin Bus, Luas tram and taxis.",
  "Brussels & Bruges": "Walking and local trains between Brussels and Bruges; trams within each city.",
  "Isle of Skye": "A car is strongly recommended; local buses are very limited.",
  "Beijing": "Metro, taxis and ride-hailing apps.",
  "Shanghai": "Metro, taxis and ride-hailing apps."
};

export function getLocalTransport(destName) {
  return (destName && LOCAL_TRANSPORT[destName]) || null;
}

// Mode-appropriate travel-day wording. Each entry is a list of [slot, name, note]
// steps for the outbound journey and the return journey (without the final
// "Arrive and check in" / "Arrive home" steps, which the itinerary adds uniformly).
const DRIVE = {
  outbound: [["Departure", "Begin the drive", "Head out from your origin with rest stops along the way."]],
  return: [["Return begins", "Begin the return drive", "Check out and drive home with rest stops along the way."]]
};
const FERRY = {
  outbound: [
    ["Departure", "Drive or transfer to the ferry terminal", "Allow time to check in for the ferry."],
    ["Ferry crossing", "Board the ferry", "Cross by ferry; times are indicative only."],
    ["Onward travel", "Continue by road after arrival", "Drive or transfer toward your destination."]
  ],
  return: [
    ["Return begins", "Head to the ferry terminal", "Check out and transfer to the terminal in good time."],
    ["Ferry crossing", "Board the ferry", "Cross by ferry on the way home."]
  ]
};
const SHUTTLE = {
  outbound: [
    ["Departure", "Reach the pickup point", "Meet the scheduled shuttle."],
    ["Shuttle", "Board the scheduled shuttle", "Travel to the destination."]
  ],
  return: [
    ["Return begins", "Reach the pickup point", "Meet the return shuttle."],
    ["Shuttle", "Board the scheduled shuttle", "Travel home."]
  ]
};
const TRAIN = {
  outbound: [
    ["Departure", "Reach the station", "Allow time before departure."],
    ["Train", "Board the train", "Travel to the destination."]
  ],
  return: [
    ["Return begins", "Reach the station", "Allow time before departure."],
    ["Train", "Board the train", "Travel home."]
  ]
};
const NEUTRAL = {
  outbound: [["Departure", "Depart for your destination", "Travel by your chosen mode."]],
  return: [["Return begins", "Begin the return journey", "Check out and travel home."]]
};

// Ferry wording applies to any ferry journey (including combined ferry + drive);
// shuttle wording to scheduled shuttles; train wording to a single-mode train;
// drive wording to a pure drive. Combined alternatives ("Flight or drive",
// "Drive or train") use concise neutral language.
export function modeWording(mode) {
  const m = (mode || "").toLowerCase();
  if (m.includes("ferry")) return FERRY;
  if (m.includes("shuttle")) return SHUTTLE;
  if (m.includes("train") && !m.includes("or")) return TRAIN;
  if (m === "drive") return DRIVE;
  return NEUTRAL;
}