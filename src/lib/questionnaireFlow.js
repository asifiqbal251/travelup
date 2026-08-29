// Travel Fit flow. One question per screen on mobile; desktop (>=1024px)
// deliberately pairs Q6+Q7 and Q8+Q9 on a shared screen (see screenOrderFor)
// so related preferences sit side by side on wider viewports.
//
// Presentation only — every answer maps to the SAME controlled vocabulary the
// scoring engine already consumes (src/lib/options.js, src/lib/scoring.js).
// "No preference" maps to the literal "No preference" the engine already
// recognises (climate -> full climate points; pace/activity/budget -> neutral,
// since the engine treats an off-scale value as no contribution). No formula or
// vocabulary changes.

import { MONTHS } from "@/lib/options";

// --- Question definitions -------------------------------------------------

export const QUESTIONS = [
  {
    id: "origin",
    field: "departureCity",
    type: "text",
    eyebrow: "Origin",
    title: "Where are you starting from?",
  },
  {
    id: "days",
    field: "travelDays",
    type: "days",
    eyebrow: "Duration",
    title: "How long do you have?",
    hint: "Including travel days.",
  },
  {
    id: "month",
    field: "travelMonth",
    type: "months",
    eyebrow: "Timing",
    title: "When are you going?",
  },
  {
    id: "traveller",
    field: "travellerType",
    type: "single",
    eyebrow: "Company",
    title: "Who's coming?",
    options: [
      { key: "just-me", label: "Just me", value: "Solo" },
      { key: "two", label: "Two of us", value: "Couple" },
      { key: "friends", label: "Friends", value: "Friends" },
      { key: "family", label: "Family", value: "Family" },
    ],
  },
  {
    id: "interests",
    field: "interests",
    type: "multi",
    eyebrow: "Interests",
    title: "What pulls you somewhere?",
    options: [
      { key: "food", label: "Food", value: "Food" },
      { key: "cities", label: "Cities", value: "Cities" },
      { key: "nature", label: "Nature", value: "Nature" },
      { key: "history", label: "History", value: "History and culture" },
      { key: "beaches", label: "Beaches", value: "Beaches" },
      { key: "hiking", label: "Hiking", value: "Hiking" },
      { key: "photography", label: "Photography", value: "Photography" },
      { key: "wildlife", label: "Wildlife", value: "Wildlife" },
      { key: "adventure", label: "Adventure", value: "Adventure" },
      { key: "slowing", label: "Slowing down", value: "Relaxation" },
    ],
  },
  {
    id: "budget",
    field: "budget",
    type: "single",
    eyebrow: "Budget",
    noPref: true,
    title: "What are you spending?",
    options: [
      { key: "budget", label: "Budget", value: "Budget" },
      { key: "moderate", label: "Moderate", value: "Moderate" },
      { key: "comfortable", label: "Comfortable", value: "Comfortable" },
      { key: "premium", label: "Premium", value: "Premium" },
      { key: "no-pref", label: "No preference", value: "No preference", noPref: true },
    ],
  },
  {
    id: "climate",
    field: "climate",
    type: "single",
    eyebrow: "Climate",
    noPref: true,
    title: "What weather do you want?",
    options: [
      { key: "warm", label: "Warm", value: "Warm" },
      { key: "mild", label: "Mild", value: "Mild" },
      { key: "cool", label: "Cool", value: "Cool" },
      { key: "cold", label: "Cold or snowy", value: "Cold or snowy" },
      { key: "no-pref", label: "No preference", value: "No preference", noPref: true },
    ],
  },
  {
    id: "pace",
    field: "pace",
    type: "single",
    eyebrow: "Pace",
    noPref: true,
    title: "What pace suits you?",
    options: [
      { key: "relaxed", label: "Relaxed", value: "Relaxed" },
      { key: "balanced", label: "Balanced", value: "Balanced" },
      { key: "full", label: "Full", value: "Fast-paced" },
      { key: "packed", label: "Packed", value: "Fast-paced" },
      { key: "no-pref", label: "No preference", value: "No preference", noPref: true },
    ],
  },
  {
    id: "activity",
    field: "activity",
    type: "single",
    eyebrow: "Activity",
    noPref: true,
    title: "How active do you want to be?",
    options: [
      { key: "light", label: "Light", value: "Light" },
      { key: "moderate", label: "Moderate", value: "Moderate" },
      { key: "active", label: "Active", value: "Active" },
      { key: "very", label: "Very active", value: "Highly active" },
      { key: "no-pref", label: "No preference", value: "No preference", noPref: true },
    ],
  },
];

// Desktop (>=1024px) deliberately pairs Q6+Q7 (indices 5,6) and Q8+Q9
// (indices 7,8) on shared screens — an intentional design choice, not a gap.
export function screenOrderFor(desktop) {
  return desktop ? [0, 1, 2, 3, 4, 5, 7] : [0, 1, 2, 3, 4, 5, 6, 7, 8];
}
export function screenStartFor(q, desktop) {
  if (!desktop) return q;
  if (q === 6) return 5;
  if (q === 8) return 7;
  return q;
}
export function screenQuestions(start, desktop) {
  if (desktop && start === 5) return [5, 6];
  if (desktop && start === 7) return [7, 8];
  return [start];
}

// --- Origin autocomplete + country inference ------------------------------

function normCity(s) {
  if (!s) return "";
  return String(s)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Normalized city -> residence country (COUNTRIES vocabulary). Covers the
// regional-route origins so practicality and isDomestic behave as before.
const CITY_COUNTRY = {
  vancouver: "Canada", victoria: "Canada", toronto: "Canada", montreal: "Canada",
  "quebec city": "Canada", calgary: "Canada", edmonton: "Canada",
  "los angeles": "United States", "san francisco": "United States",
  "new york": "United States", "new york city": "United States",
  miami: "United States", chicago: "United States",
  "mexico city": "Mexico", cancun: "Mexico", monterrey: "Mexico",
  paris: "France", lyon: "France", nice: "France",
  london: "United Kingdom", edinburgh: "United Kingdom", manchester: "United Kingdom",
  dublin: "Ireland", amsterdam: "Netherlands",
  berlin: "Germany", frankfurt: "Germany", munich: "Germany",
  rome: "Italy", milan: "Italy", madrid: "Spain", barcelona: "Spain",
  lisbon: "Portugal", porto: "Portugal", athens: "Greece",
  istanbul: "Türkiye", vienna: "Austria", zurich: "Switzerland", geneva: "Switzerland",
  prague: "Czech Republic", budapest: "Hungary", warsaw: "Poland",
  brussels: "Belgium", copenhagen: "Denmark", stockholm: "Sweden",
  oslo: "Norway", helsinki: "Finland", reykjavik: "Iceland",
  moscow: "Russia", kyiv: "Ukraine", bucharest: "Romania", sofia: "Bulgaria",
  zagreb: "Croatia", riga: "Latvia", vilnius: "Lithuania", tallinn: "Estonia",
  tokyo: "Japan", osaka: "Japan", seoul: "South Korea", beijing: "China",
  shanghai: "China", "hong kong": "Hong Kong", taipei: "Taiwan",
  singapore: "Singapore", bangkok: "Thailand", "kuala lumpur": "Malaysia",
  jakarta: "Indonesia", manila: "Philippines", delhi: "India", mumbai: "India",
  hanoi: "Vietnam", "ho chi minh": "Vietnam", "phnom penh": "Cambodia",
  kathmandu: "Nepal", colombo: "Sri Lanka",
  dubai: "United Arab Emirates", doha: "Qatar", "tel aviv": "Israel", amman: "Jordan",
  riyadh: "Saudi Arabia", tehran: "Iran", tbilisi: "Georgia",
  "cape town": "South Africa", johannesburg: "South Africa", nairobi: "Kenya",
  cairo: "Egypt", casablanca: "Morocco", marrakech: "Morocco", tunis: "Tunisia",
  lagos: "Nigeria", accra: "Ghana", "dar es salaam": "Tanzania",
  sydney: "Australia", melbourne: "Australia", perth: "Australia",
  auckland: "New Zealand", wellington: "New Zealand", queenstown: "New Zealand",
  denpasar: "Indonesia",
  "sao paulo": "Brazil", "rio de janeiro": "Brazil",
  "buenos aires": "Argentina", santiago: "Chile", lima: "Peru", cusco: "Peru",
  bogota: "Colombia", cartagena: "Colombia", quito: "Ecuador",
  dhaka: "Bangladesh", karachi: "Pakistan", lahore: "Pakistan", islamabad: "Pakistan",
};

export const ORIGIN_CHIPS = ["Vancouver", "Los Angeles", "San Francisco", "Paris"];

export const ORIGIN_SUGGESTIONS = [
  "Vancouver", "Toronto", "Montreal", "Calgary",
  "Los Angeles", "San Francisco", "New York", "Miami", "Chicago",
  "Mexico City", "Paris", "London", "Edinburgh", "Dublin",
  "Amsterdam", "Berlin", "Rome", "Madrid", "Barcelona", "Lisbon",
  "Tokyo", "Seoul", "Sydney", "Auckland", "Dubai", "Istanbul",
  "Buenos Aires", "São Paulo", "Lima", "Cape Town", "Reykjavik",
  "Singapore", "Bangkok", "Delhi", "Hong Kong",
];

export function inferCountry(city) {
  return CITY_COUNTRY[normCity(city)] || "";
}

export function suggestOrigins(query) {
  const q = normCity(query);
  if (!q) return ORIGIN_SUGGESTIONS.slice(0, 8);
  return ORIGIN_SUGGESTIONS.filter((s) => normCity(s).includes(q)).slice(0, 8);
}

// --- Answer state ---------------------------------------------------------

export const BLANK_ANSWERS = {
  departureCity: "",
  travelDays: 7,
  travelMonth: "",
  travellerType: "",
  interests: [],
  budget: "",
  climate: "",
  pace: "",
  activity: "",
};

function findKey(question, value) {
  if (value == null || value === "") return "";
  const opt = question.options.find((o) => o.value === value);
  return opt ? opt.key : "";
}
function findValue(question, key) {
  if (!key) return "";
  const opt = question.options.find((o) => o.key === key);
  return opt ? opt.value : "";
}
function findLabel(question, key) {
  if (!key) return "";
  const opt = question.options.find((o) => o.key === key);
  return opt ? opt.label : "";
}

// Hydrate answers from stored prefs (returning users). Best-effort reverse
// mapping; pace "Fast-paced" resolves to the first matching key ("full").
export function hydrateAnswers(prefs) {
  if (!prefs) return { ...BLANK_ANSWERS };
  const byId = (id) => QUESTIONS.find((x) => x.id === id);
  return {
    departureCity: prefs.departureCity || "",
    travelDays: typeof prefs.travelDays === "number" ? prefs.travelDays : 7,
    travelMonth: prefs.travelMonth || "",
    travellerType: findKey(byId("traveller"), prefs.travellerType),
    interests: (prefs.interests || []).map((v) => findKey(byId("interests"), v)).filter(Boolean),
    budget: findKey(byId("budget"), prefs.budget),
    climate: findKey(byId("climate"), prefs.climate),
    pace: findKey(byId("pace"), prefs.pace),
    activity: findKey(byId("activity"), prefs.activity),
  };
}

export function isAnswered(qIndex, answers) {
  const q = QUESTIONS[qIndex];
  switch (q.type) {
    case "text": return !!String(answers.departureCity || "").trim();
    case "days": return typeof answers.travelDays === "number";
    case "months": return !!answers.travelMonth;
    case "single": return !!answers[q.field];
    case "multi": return (answers.interests || []).length > 0;
    default: return false;
  }
}

// Build the prefs object the engine consumes. Maps display keys -> engine
// vocabulary values and fills the dropped optional fields with the same
// defaults the old blank form used.
export function buildPrefs(answers) {
  const byId = (id) => QUESTIONS.find((x) => x.id === id);
  const residenceCountry = inferCountry(answers.departureCity);
  return {
    residenceCountry,
    departureCity: String(answers.departureCity || "").trim(),
    citizenship: residenceCountry, // engine unused; kept for fingerprint parity
    travelScope: "both",
    travelMonth: answers.travelMonth || "",
    travelDays: answers.travelDays,
    travellerType: findValue(byId("traveller"), answers.travellerType),
    budget: findValue(byId("budget"), answers.budget),
    interests: (answers.interests || []).map((k) => findValue(byId("interests"), k)).filter(Boolean),
    climate: findValue(byId("climate"), answers.climate),
    pace: findValue(byId("pace"), answers.pace),
    activity: findValue(byId("activity"), answers.activity),
    dietary: "None",
    dietaryOther: "",
    visitedCountries: [],
    excludedDestinations: [],
  };
}

// One-line answer summary for the mobile review sheet + a11y.
export function answerSummary(qIndex, answers) {
  const q = QUESTIONS[qIndex];
  switch (q.type) {
    case "text": return String(answers.departureCity || "").trim() || "—";
    case "days": return `${answers.travelDays} days`;
    case "months":
      return !answers.travelMonth || answers.travelMonth === "flexible"
        ? "Flexible"
        : MONTHS[Number(answers.travelMonth) - 1];
    case "single": return findLabel(q, answers[q.field]) || "—";
    case "multi":
      return (answers.interests || []).map((k) => findLabel(QUESTIONS[4], k)).join(", ") || "—";
    default: return "—";
  }
}

export function completionHeadline(answers) {
  const city = String(answers.departureCity || "").trim();
  const days = answers.travelDays;
  if (city) return `${days} days from ${city}. We know where to send you.`;
  return `${days} days. We know where to send you.`;
}