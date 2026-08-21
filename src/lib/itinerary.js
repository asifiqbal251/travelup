// Deterministic, travel-aware itinerary generation from curated destination
// day templates. The selected trip length is the complete vacation (home to
// home), so outbound and return travel are placed WITHIN the requested number
// of days — never on top of it.
//
// Two travel-time sources feed the allocation:
//   1. Regional-route overrides (driving, ferry, train, shuttle) — a curated
//      one-way journey time with mode-appropriate wording and arrival/return
//      rules keyed off the one-way time:
//        <=3h each way:  travel folded into day 1/N with one light activity
//        3–6h each way:  travel folded, arrival keeps only a light evening
//        6–8h each way:  dedicated arrival and return days (no activity)
//        >8h each way:  existing long-haul allocation (medium/long tiers)
//   2. Existing flight-distance estimate — unchanged for non-overridden
//      routes, including international connection_hours and internal-access.
//
// Travel entries use SEQUENCE-based sections (no invented clock times); the
// estimated total journey duration is shown separately. Destination days use
// a 5-entry timeline built ONLY from that day's own content. Highlights (day
// tags) come only from the day's own interests. "Free time" appears only on
// flexible templates or days with a real free-time period.
import { ACTIVITY_ORDER } from "@/lib/options";
import { applyDietToItinerary } from "@/lib/diet";
import { assessPracticality } from "@/lib/practicality";
import { modeWording, getLocalTransport } from "@/lib/regionalRoutes";

const INT_ORDER = ["Light", "Moderate", "High", "Highly active"];

function applyPaceShift(intensity, shift) {
  const i = INT_ORDER.indexOf(intensity);
  if (i < 0 || shift === 0) return intensity;
  return INT_ORDER[Math.max(0, Math.min(INT_ORDER.length - 1, i + shift))];
}

function shortName(text) {
  if (!text) return "";
  let s = String(text).replace(/\.\s*$/, "").trim();
  let clause = s.split(/[.,;]/)[0].trim();
  let words = clause.split(/\s+/);
  let truncated = false;
  if (words.length > 6) {
    words = words.slice(0, 6);
    truncated = true;
  }
  const stop = new Set(["to", "for", "at", "in", "on", "the", "a", "an", "and", "of", "with", "along", "via", "before", "after", "or", "by"]);
  while (words.length > 1 && stop.has(words[words.length - 1].toLowerCase())) words.pop();
  let label = words.join(" ");
  if (truncated && words.length) label += "…";
  return label;
}

function destShort(dest) {
  const n = dest.name || "";
  const i = n.indexOf(",");
  return i > 0 ? n.slice(0, i).trim() : n;
}

const TRAVELISH = /\b(arrival|arrive|depart|departure|return|onward|rest|recovery|free day)\b/i;
function isTravelish(t) {
  return TRAVELISH.test(t.title || "");
}

// Day tags come ONLY from the day's own authored interests. "Free time" is
// added only on flexible templates (a real free-time period), never as a
// default filler on a fixed-activity day.
function highlightLabels(t) {
  const out = (t.interests || []).slice(0, 3);
  if (t.flexible) {
    while (out.length < 3) out.push("Free time");
  }
  return out;
}

function gettingAroundText(mode) {
  const m = (mode || "").toLowerCase();
  if (/train/.test(m)) return "Local trains and walking; taxis for longer hops.";
  if (/ferry|boat/.test(m)) return "Ferries or boats plus local taxis and walking.";
  if (/rental car|driving/.test(m)) return "A rental car gives the most flexibility here.";
  if (/bus/.test(m)) return "Local buses and taxis.";
  return "Taxis, rideshares and local transit.";
}

// Local-transport guidance: use the curated description for the eight new
// short-trip destinations; otherwise derive a neutral line from travel_mode.
function gettingAround(dest) {
  return getLocalTransport(dest.name) || gettingAroundText(dest.travel_mode);
}

function isDinnerish(note) {
  return /\b(dinner|evening meal|supper)\b/i.test(note || "");
}

// A lunch-slot note must not describe a dinner/evening meal; if the template's
// food_note does, use a concise meal-neutral lunch suggestion instead.
function lunchNoteFor(t) {
  const fn = (t && t.food_note) || "";
  if (!fn || isDinnerish(fn)) return "A relaxed local lunch or café stop.";
  return fn;
}

// Duration is derived from the time range so the two never disagree.
function durationFromRange(range) {
  const m = range && String(range).match(/(\d{1,2}):(\d{2})\s*[–-]\s*(\d{1,2}):(\d{2})/);
  if (!m) return "";
  let start = (+m[1]) * 60 + (+m[2]);
  let end = (+m[3]) * 60 + (+m[4]);
  if (end < start) end += 24 * 60;
  const hrs = (end - start) / 60;
  const r = Math.round(hrs * 2) / 2;
  if (!r) return "";
  return `~${r} hr`;
}

const act = (slot, time, _ignored, name, source, note) => ({
  slot,
  time,
  duration: durationFromRange(time),
  name,
  source,
  note: note || null
});
const seq = (slot, name, note, duration) => ({
  slot,
  time: null,
  duration: duration || "",
  name,
  source: null,
  note
});

// Activity label: prefer an authored concise `label`, else a word-boundary
// truncation of the source sentence (never mid-word). Used for the morning
// slot; afternoon/evening use shortName directly.
function morningName(t) {
  return t.label || shortName(t.morning) || "Morning activity";
}

// Template selection: short trips prioritise signature days by interest match;
// longer trips keep route order.
function selectTemplates(activityTemplates, templateBudget, dest, prefs) {
  if (templateBudget <= 0) return [];
  const prim = dest.primary_interests || [];
  const userI = prefs.interests || [];
  if (templateBudget <= 4) {
    const scored = activityTemplates
      .map((t, idx) => {
        let s = 0;
        (t.interests || []).forEach((i) => {
          if (prim.includes(i)) s += 2;
          if (userI.includes(i)) s += 1;
        });
        return { t, idx, s };
      })
      .sort((a, b) => b.s - a.s || a.idx - b.idx);
    return scored.slice(0, templateBudget).map((x) => x.t);
  }
  return activityTemplates.slice(0, templateBudget);
}

function buildTemplateDay(t, dest, shift, opts) {
  const o = opts || {};
  const intensity = applyPaceShift(t.intensity || "Moderate", shift);
  const highlights = highlightLabels(t);
  const location = dest.name;
  const timeline = [];
  const foodNote = lunchNoteFor(t);

  if (o.outbound) {
    timeline.push(seq("Departure", `Depart ${o.origin}`, "Check in and travel to your destination; confirm your transport."));
    timeline.push(seq("Arrival", `Arrive in ${o.dShort}`, "Clear arrivals and transfer to your stay."));
    timeline.push(act("Lunch", "12:30–14:00", "", "Local bite", "food_note"));
    timeline.push(act("Afternoon", "15:00–18:00", "", shortName(t.morning) || "First outing", "morning"));
    timeline.push(act("Evening", "18:30–21:00", "", shortName(t.evening) || "Settle in", "evening"));
  } else if (o.returnFold) {
    timeline.push(act("Morning", "08:00–11:00", "", morningName(t), "morning"));
    timeline.push(act("Late morning", "11:00–12:30", "", shortName(t.afternoon) || "Sightseeing", "afternoon"));
    timeline.push(act("Lunch", "12:30–14:00", "", "Local bite", "food_note"));
    timeline.push(seq("Return begins", "Head to airport or station", "Allow time for transfer and check-in; confirm your departure time."));
    timeline.push(seq("Arrive home", `Return to ${o.origin}`, `Travel home to ${o.origin}.`));
  } else if (o.returnFoldLong) {
    timeline.push(act("Morning", "08:00–11:00", "", morningName(t), "morning"));
    timeline.push(act("Lunch", "12:30–14:00", "", "Local bite", "food_note"));
    timeline.push(seq("Return begins", "Final activity, then depart", "A partial local activity before heading to the airport or station."));
    timeline.push(seq("Departure", "Check-in and depart", "Begin the return journey; travel continues overnight."));
  } else if (o.partialOutbound) {
    timeline.push(seq("Departure", `Depart ${o.origin}`, "Check in and travel to your destination; confirm your transport."));
    timeline.push(seq("Arrival", `Arrive in ${o.dShort}`, "Clear arrivals and transfer to your stay."));
    timeline.push(act("Evening", "18:30–21:00", "", shortName(t.evening) || "Settle in", "evening"));
  } else if (o.partialReturn) {
    timeline.push(act("Morning", "08:00–10:30", "", morningName(t), "morning"));
    timeline.push(seq("Return begins", "Head to airport or station", "Allow time for transfer and check-in; confirm your departure time."));
    timeline.push(seq("Arrive home", `Return to ${o.origin}`, `Travel home to ${o.origin}.`));
  } else {
    timeline.push(act("Morning", "08:00–11:00", "", morningName(t), "morning"));
    timeline.push(seq("Late morning", "Mid-morning break", "A short break or local transit between stops."));
    timeline.push(act("Lunch", "12:30–14:00", "", "Local bite", "food_note"));
    timeline.push(act("Afternoon", "14:00–18:00", "", shortName(t.afternoon) || "Afternoon activity", "afternoon"));
    timeline.push(act("Evening", "18:30–21:30", "", shortName(t.evening) || "Evening", "evening"));
  }

  const isReturnDay = o.returnFold || o.returnFoldLong || o.partialReturn;
  const hasJourney = o.outbound || o.returnFold || o.returnFoldLong || o.partialOutbound || o.partialReturn;

  return {
    title: t.title,
    location,
    intensity,
    isTravel: false,
    flexible: !!t.flexible,
    highlights,
    morning: t.morning || "",
    afternoon: t.afternoon || "",
    evening: t.evening || "",
    food_note: foodNote,
    timeline,
    journey: hasJourney ? `Estimated total journey: about ${o.oneWay} hours each way.` : null,
    gettingAround: gettingAround(dest),
    planAhead: "Confirm opening hours and book popular tickets before you travel.",
    optionalSwap: t.optional_swap || o.unusedSwap || null,
    overnight: isReturnDay ? "Home" : `Overnight in ${location}.`
  };
}

function buildTravelDay(kind, o) {
  const { dest, origin, dShort, oneWay, long: isLong, hasConnection } = o;
  const journey = `Estimated total journey: about ${oneWay} hours each way.`;
  const conn = hasConnection ? [seq("Connection", "Change planes or services", "Allow time for your connection.")] : [];

  if (kind === "outbound") {
    const timeline = [
      seq("Departure", "Check-in and departure", "Allow time for check-in and security."),
      seq("In transit", `Travel to ${dest.name}`, journey),
      ...conn
    ];
    if (isLong) {
      timeline.push(seq("Continue transit", "Long-haul travel", "The journey continues; rest where you can."));
    } else {
      timeline.push(seq("Arrival", "Arrival and entry formalities", "Clear immigration and customs."));
      timeline.push(seq("Transfer", "Transfer to accommodation", "Head to your stay."));
      timeline.push(seq("Rest", "Rest or light orientation", "Take it easy after the journey."));
    }
    return {
      title: `Outbound: ${origin} → ${dest.name}`,
      location: "In transit",
      intensity: "Light",
      isTravel: true,
      flexible: false,
      highlights: ["Departure", "In transit", isLong ? "Continue transit" : "Arrival"],
      morning: `Depart ${origin} for ${dest.name}.`,
      afternoon: `Travel to ${dest.name}; about ${oneWay} hours each way.`,
      evening: isLong ? "Continue the long journey." : `Arrive in ${dShort} and settle in.`,
      food_note: "Pick up something light for the journey.",
      timeline,
      journey,
      gettingAround: gettingAround(dest),
      planAhead: "Keep travel documents and accommodation confirmations accessible.",
      optionalSwap: "Arrange a private transfer for a smoother arrival.",
      overnight: isLong ? "Overnight in transit." : `Overnight in the ${dShort} area.`
    };
  }
  if (kind === "arrival") {
    return {
      title: "Arrival & recovery",
      location: dest.name,
      intensity: "Light",
      isTravel: true,
      flexible: false,
      highlights: ["Arrival", "Transfer", "Recovery"],
      morning: "Arrive and clear entry formalities.",
      afternoon: "Transfer to your accommodation.",
      evening: "Rest and recover from the long journey.",
      food_note: "A simple, comforting local meal.",
      timeline: [
        seq("Arrival", "Arrival and entry formalities", "Clear immigration and customs after the long haul."),
        seq("Transfer", "Transfer to accommodation", "Head to your stay and freshen up."),
        seq("Recovery", "Rest and recover", "Take it easy; adjust to the new time zone.")
      ],
      journey,
      gettingAround: gettingAround(dest),
      planAhead: "Don't over-schedule the first day after a long haul.",
      optionalSwap: "Add a short walk if you feel energetic.",
      overnight: `Overnight in ${dest.name}.`
    };
  }
  if (kind === "returnBegins") {
    return {
      title: `Return begins: ${dest.name} → ${origin}`,
      location: "In transit",
      intensity: "Light",
      isTravel: true,
      flexible: false,
      highlights: ["Check-out", "Return begins", "In transit"],
      morning: "Check out and head to the airport or station.",
      afternoon: "Check in and begin the return journey.",
      evening: "Travel home; the journey continues overnight.",
      food_note: "A meal or snack before departure.",
      timeline: [
        seq("Check-out", "Check out and depart", "Leave your accommodation in good time."),
        seq("Return begins", "Head to airport or station", "Allow time for transfer and check-in."),
        seq("Departure", "Check-in and depart", "Begin the return journey; confirm your departure."),
        seq("In transit", "Travel home", journey)
      ],
      journey,
      gettingAround: "Allow extra time for the transfer and check-in.",
      planAhead: "Reconfirm your departure time and documents.",
      optionalSwap: "Leave earlier to avoid rush.",
      overnight: "Overnight in transit."
    };
  }
  const timeline = isLong
    ? [
        seq("In transit", "Continue return journey", journey),
        ...conn,
        seq("Arrive home", `Arrive home in ${origin}`, `Travel home to ${origin}.`)
      ]
    : [
        seq("Check-out", "Check out and depart", "Leave your accommodation in good time."),
        seq("Return begins", "Head to airport or station", "Allow time for transfer and check-in."),
        seq("In transit", "Travel home", journey),
        ...conn,
        seq("Arrive home", `Arrive home in ${origin}`, `Travel home to ${origin}.`)
      ];
  return {
    title: `Return: ${dest.name} → ${origin}`,
    location: "In transit",
    intensity: "Light",
    isTravel: true,
    flexible: false,
    highlights: ["Return", "In transit", "Arrive home"],
    morning: "Begin the final leg home.",
    afternoon: "Travel home.",
    evening: `Arrive home in ${origin}.`,
    food_note: "A final local coffee before you leave.",
    timeline,
    journey,
    gettingAround: "Allow extra time for the transfer and check-in.",
    planAhead: "Reconfirm your departure time and documents.",
    optionalSwap: "Leave earlier to avoid rush.",
    overnight: `Arrive home in ${origin}.`
  };
}

function buildRecoveryDay(dest, pace, optional) {
  return {
    title: optional ? "Optional rest day" : "Flexible day",
    location: dest.name,
    intensity: "Light",
    isTravel: false,
    flexible: true,
    highlights: ["Slow start", "Café and laundry", "Easy stroll"],
    morning: "Sleep in or enjoy a relaxed breakfast.",
    afternoon: "Catch up on laundry and postcards.",
    evening: "Rest, or revisit a favourite spot.",
    food_note: "An unhurried lunch at a spot you missed.",
    timeline: [
      act("Morning", "09:00–11:00", "", "Slow start", "morning"),
      seq("Late morning", "Café and laundry", "Catch up on laundry and postcards."),
      act("Lunch", "12:30–14:00", "", "Local bite", "food_note"),
      act("Afternoon", "14:00–17:00", "", "Easy stroll", "afternoon"),
      act("Evening", "18:30–21:00", "", "Optional night out", "evening")
    ],
    journey: null,
    gettingAround: gettingAround(dest),
    planAhead: optional ? "Skip or swap for sightseeing if you prefer a packed pace." : "Use this day to recharge or revisit a favourite.",
    optionalSwap: "Add a short excursion if you feel rested.",
    overnight: `Overnight in ${dest.name}.`
  };
}

// --- Regional override itinerary (driving, ferry, train, shuttle) ----------

// Folded arrival: travel folded into the first template day with one light
// activity (<=3h: a light afternoon + dinner; 3–6h: a light evening only).
function buildOverrideArrivalFoldDay(t, dest, shift, o) {
  const intensity = applyPaceShift(t.intensity || "Moderate", shift);
  const location = dest.name;
  const timeline = [];
  o.wording.outbound.forEach(([slot, name, note]) => timeline.push(seq(slot, name, note)));
  timeline.push(seq("Arrival", "Arrive and check in", "Reach your destination and settle into your stay."));
  if (o.profile === "light") {
    timeline.push(act("Afternoon", "14:00–17:00", "", shortName(t.afternoon) || "First outing", "afternoon"));
    timeline.push(act("Evening", "18:30–20:30", "", "Dinner and rest", null, "A relaxed dinner near your stay after the day's travel."));
  } else {
    timeline.push(act("Evening", "18:30–21:00", "", shortName(t.evening) || "Evening", "evening"));
  }
  return {
    title: t.title,
    location,
    intensity,
    isTravel: false,
    flexible: !!t.flexible,
    highlights: highlightLabels(t),
    morning: "",
    afternoon: t.afternoon || "",
    evening: t.evening || "",
    food_note: "",
    timeline,
    journey: `Estimated total journey: about ${o.oneWay} hours each way.`,
    gettingAround: gettingAround(dest),
    planAhead: "Confirm opening hours and book popular tickets before you travel.",
    optionalSwap: t.optional_swap || o.unusedSwap || null,
    overnight: `Overnight in ${location}.`
  };
}

// Folded return: travel folded into the last template day (<=3h: one concise
// morning activity; 3–6h: breakfast or a short walk) then the return journey.
function buildOverrideReturnFoldDay(t, dest, shift, o) {
  const intensity = applyPaceShift(t.intensity || "Moderate", shift);
  const location = dest.name;
  const timeline = [];
  if (o.profile === "light") {
    timeline.push(act("Morning", "08:00–11:00", "", morningName(t), "morning"));
  } else {
    timeline.push(seq("Morning", "Breakfast or a short walk", "A relaxed start before heading home."));
  }
  o.wording.return.forEach(([slot, name, note]) => timeline.push(seq(slot, name, note)));
  timeline.push(seq("Arrive home", "Arrive home", `Travel home to ${o.origin}.`));
  return {
    title: t.title,
    location,
    intensity,
    isTravel: false,
    flexible: !!t.flexible,
    highlights: highlightLabels(t),
    morning: t.morning || "",
    afternoon: "",
    evening: "",
    food_note: "",
    timeline,
    journey: `Estimated total journey: about ${o.oneWay} hours each way.`,
    gettingAround: gettingAround(dest),
    planAhead: "Confirm your departure time and any bookings.",
    optionalSwap: null,
    overnight: "Home"
  };
}

// Dedicated arrival day for 6–8h journeys: travel, arrival, check-in, dinner
// and rest only — no scheduled activity.
function buildOverrideDedicatedArrivalDay(dest, o) {
  const location = dest.name;
  const timeline = [];
  o.wording.outbound.forEach(([slot, name, note]) => timeline.push(seq(slot, name, note)));
  timeline.push(seq("Arrival", "Arrive and check in", "Reach your destination and settle into your stay."));
  timeline.push(seq("Evening", "Dinner and rest", "A simple dinner and a quiet evening to recover from travel."));
  return {
    title: `Outbound: ${o.origin} → ${dest.name}`,
    location: "In transit",
    intensity: "Light",
    isTravel: true,
    flexible: false,
    highlights: ["Departure", "Arrival", "Dinner and rest"],
    morning: `Depart ${o.origin} for ${dest.name}.`,
    afternoon: `Travel to ${dest.name}; about ${o.oneWay} hours each way.`,
    evening: "Arrive, check in and rest.",
    food_note: "A simple dinner near your stay.",
    timeline,
    journey: `Estimated total journey: about ${o.oneWay} hours each way.`,
    gettingAround: gettingAround(dest),
    planAhead: "Confirm your travel and accommodation details.",
    optionalSwap: null,
    overnight: `Overnight in ${location}.`
  };
}

// Dedicated return day for 6–8h journeys: primarily return travel.
function buildOverrideDedicatedReturnDay(dest, o) {
  const timeline = [];
  timeline.push(seq("Check-out", "Check out and depart", "Leave your accommodation in good time."));
  o.wording.return.forEach(([slot, name, note]) => timeline.push(seq(slot, name, note)));
  timeline.push(seq("Arrive home", "Arrive home", `Travel home to ${o.origin}.`));
  return {
    title: `Return: ${dest.name} → ${o.origin}`,
    location: "In transit",
    intensity: "Light",
    isTravel: true,
    flexible: false,
    highlights: ["Check-out", "Return", "Arrive home"],
    morning: "Check out and begin the return journey.",
    afternoon: `Travel home; about ${o.oneWay} hours each way.`,
    evening: `Arrive home in ${o.origin}.`,
    food_note: "A snack before you leave.",
    timeline,
    journey: `Estimated total journey: about ${o.oneWay} hours each way.`,
    gettingAround: gettingAround(dest),
    planAhead: "Confirm your departure time.",
    optionalSwap: null,
    overnight: "Home"
  };
}

function buildOverrideItinerary(dest, prefs, prac, totalDays, templates) {
  const oneWay = prac.oneWayHours;
  const mode = prac.travelMode;
  const origin = (prefs.departureCity || "home").trim();
  const dShort = destShort(dest);
  const wording = modeWording(mode);
  const activityTemplates = templates.filter((t) => !isTravelish(t));

  let shift = 0;
  if (prefs.pace === "Relaxed") shift -= 1;
  else if (prefs.pace === "Fast-paced") shift += 1;
  const ai = ACTIVITY_ORDER.indexOf(prefs.activity);
  if (ai === 0) shift -= 1;
  else if (ai >= 2) shift += 1;
  shift = Math.max(-1, Math.min(1, shift));

  const pace = prefs.pace || "Balanced";
  const fastPace = pace === "Fast-paced";
  const paceWantsRecovery = totalDays >= 10 && (pace === "Relaxed" || pace === "Balanced");

  // >8h falls back to the existing long-haul allocation (no override currently
  // exceeds 6h, but keep the guard for completeness).
  if (oneWay > 8) {
    return null;
  }

  const folded = oneWay <= 3 || (oneWay > 3 && oneWay < 6); // light | evening
  const profile = oneWay <= 3 ? "light" : "evening";
  const templateBudget = folded ? totalDays : totalDays - 2;
  const budget = Math.max(0, templateBudget);

  const selected = selectTemplates(activityTemplates, budget, dest, prefs);
  const unused = activityTemplates.filter((t) => !selected.includes(t));
  const unusedSwap = unused.length ? `Swap for “${unused[0].title}” if it suits your pace.` : null;

  const insertRecovery = (arr) => {
    if (!paceWantsRecovery || arr.length < 1) return arr;
    const at = Math.floor(arr.length / 2);
    return arr.slice(0, at).concat([null], arr.slice(at));
  };

  const days = [];
  if (folded) {
    const first = selected[0];
    const last = selected.length > 1 ? selected[selected.length - 1] : null;
    const middle = selected.length > 2 ? selected.slice(1, selected.length - 1) : [];
    if (first) {
      days.push(buildOverrideArrivalFoldDay(first, dest, shift, { profile, oneWay, mode, wording, origin, dShort, unusedSwap }));
    }
    insertRecovery(middle).forEach((t) => {
      if (t) days.push(buildTemplateDay(t, dest, shift, { unusedSwap }));
      else days.push(buildRecoveryDay(dest, pace, false));
    });
    if (last) {
      days.push(buildOverrideReturnFoldDay(last, dest, shift, { profile, oneWay, mode, wording, origin, dShort }));
    } else {
      days.push(buildOverrideDedicatedReturnDay(dest, { oneWay, mode, wording, origin, dShort }));
    }
  } else {
    // dedicated (6–8h)
    days.push(buildOverrideDedicatedArrivalDay(dest, { oneWay, mode, wording, origin, dShort }));
    insertRecovery(selected).forEach((t) => {
      if (t) days.push(buildTemplateDay(t, dest, shift, { unusedSwap }));
      else days.push(buildRecoveryDay(dest, pace, false));
    });
    days.push(buildOverrideDedicatedReturnDay(dest, { oneWay, mode, wording, origin, dShort }));
  }

  while (days.length < totalDays) days.push(buildRecoveryDay(dest, pace, fastPace));
  const seqDays = days.slice(0, totalDays).map((d, i) => ({ ...d, day: i + 1 }));
  return applyDietToItinerary(seqDays, prefs.dietary);
}

export function generateItinerary(dest, prefs) {
  const totalDays = Math.min(Math.max(prefs.travelDays || 7, 1), 14);
  const templates = (dest.day_templates || []).slice();
  if (!templates.length) return [];

  const prac = assessPracticality(dest, prefs);
  if (prac.isOverride) {
    const overridePlan = buildOverrideItinerary(dest, prefs, prac, totalDays, templates);
    if (overridePlan) return overridePlan;
    // >8h override: fall through to the existing long-haul allocation below.
  }

  const oneWay = prac.oneWayHours;
  const tier = prac.tier;
  const origin = (prefs.departureCity || "home").trim();
  const dShort = destShort(dest);
  const hasConnection = Number(dest.connection_hours || 0) > 0;

  let shift = 0;
  if (prefs.pace === "Relaxed") shift -= 1;
  else if (prefs.pace === "Fast-paced") shift += 1;
  const ai = ACTIVITY_ORDER.indexOf(prefs.activity);
  if (ai === 0) shift -= 1;
  else if (ai >= 2) shift += 1;
  shift = Math.max(-1, Math.min(1, shift));

  const pace = prefs.pace || "Balanced";
  const activityTemplates = templates.filter((t) => !isTravelish(t));

  let startTravel = 0, arrival = 0, tailTravel = 0;
  if (tier === "medium") { startTravel = 1; tailTravel = 1; }
  else if (tier === "long") { startTravel = 1; arrival = 1; tailTravel = 2; }
  const travelDays = startTravel + arrival + tailTravel;

  const paceWantsRecovery = totalDays >= 10 && (pace === "Relaxed" || pace === "Balanced");
  const fastPace = pace === "Fast-paced";

  let templateBudget = totalDays - travelDays - (paceWantsRecovery ? 1 : 0);
  if (templateBudget < 0) templateBudget = 0;

  const selected = selectTemplates(activityTemplates, templateBudget, dest, prefs);
  const unused = activityTemplates.filter((t) => !selected.includes(t));
  const unusedSwap = unused.length ? `Swap for “${unused[0].title}” if it suits your pace.` : null;

  const insertRecovery = (arr) => {
    if (!paceWantsRecovery || arr.length < 1) return arr;
    const at = Math.floor(arr.length / 2);
    return arr.slice(0, at).concat([null], arr.slice(at));
  };

  const days = [];
  if (tier === "fold" || tier === "partialFold") {
    const first = selected[0];
    const last = selected.length > 1 ? selected[selected.length - 1] : null;
    const middle = selected.length > 2 ? selected.slice(1, selected.length - 1) : [];
    const outOpt = tier === "partialFold"
      ? { partialOutbound: true, origin, dShort, oneWay, unusedSwap }
      : { outbound: true, origin, dShort, oneWay, unusedSwap };
    const retOpt = tier === "partialFold"
      ? { partialReturn: true, origin, dShort, oneWay, unusedSwap }
      : { returnFold: true, origin, dShort, oneWay, unusedSwap };
    if (first) days.push(buildTemplateDay(first, dest, shift, outOpt));
    insertRecovery(middle).forEach((t) => {
      if (t) days.push(buildTemplateDay(t, dest, shift, { unusedSwap }));
      else days.push(buildRecoveryDay(dest, pace, false));
    });
    if (last) days.push(buildTemplateDay(last, dest, shift, retOpt));
    else days.push(buildTravelDay("return", { dest, origin, dShort, oneWay, long: false, hasConnection }));
  } else if (tier === "medium") {
    days.push(buildTravelDay("outbound", { dest, origin, dShort, oneWay, long: false, hasConnection }));
    insertRecovery(selected).forEach((t) => {
      if (t) days.push(buildTemplateDay(t, dest, shift, { unusedSwap }));
      else days.push(buildRecoveryDay(dest, pace, false));
    });
    days.push(buildTravelDay("return", { dest, origin, dShort, oneWay, long: false, hasConnection }));
  } else {
    days.push(buildTravelDay("outbound", { dest, origin, dShort, oneWay, long: true, hasConnection }));
    days.push(buildTravelDay("arrival", { dest, origin, dShort, oneWay, long: true, hasConnection }));
    insertRecovery(selected).forEach((t) => {
      if (t) days.push(buildTemplateDay(t, dest, shift, { unusedSwap }));
      else days.push(buildRecoveryDay(dest, pace, false));
    });
    days.push(buildTravelDay("returnBegins", { dest, origin, dShort, oneWay, long: true, hasConnection }));
    days.push(buildTravelDay("return", { dest, origin, dShort, oneWay, long: true, hasConnection }));
  }

  while (days.length < totalDays) days.push(buildRecoveryDay(dest, pace, fastPace));
  const seqDays = days.slice(0, totalDays).map((d, i) => ({ ...d, day: i + 1 }));
  return applyDietToItinerary(seqDays, prefs.dietary);
}