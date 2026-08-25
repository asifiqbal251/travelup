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
// Timeline activity titles render the FULL authored text (no truncation); long
// titles wrap onto a second line rather than being clipped. Travel entries
// use sequence-based sections (no invented clock times); the estimated total
// journey duration is shown separately. The return-home day is always the
// LAST day of the itinerary — no day is ever generated after the traveller
// arrives home. Highlights (day tags) come only from the day's own interests
// (or return-specific tags on a return day). Dietary filtering is applied to
// the timeline text by diet.js.
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

// Timed activity entry. `name` is the FULL activity text (renders verbatim,
// wrapping if long); `note` is an optional separate description (e.g. a meal
// note). No source indirection — the text lives on the entry itself so dietary
// filtering can transform it directly.
const act = (slot, time, name, note) => ({
  slot,
  time,
  duration: durationFromRange(time),
  name,
  source: null,
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
    timeline.push(act("Lunch", "12:30–14:00", "Local bite", foodNote));
    timeline.push(act("Afternoon", "15:00–18:00", t.morning || "First outing"));
    timeline.push(act("Evening", "18:30–21:00", t.evening || "Settle in"));
  } else if (o.returnFold) {
    timeline.push(act("Morning", "08:00–11:00", t.morning || "Morning activity"));
    timeline.push(act("Late morning", "11:00–12:30", t.afternoon || "Sightseeing"));
    timeline.push(act("Lunch", "12:30–14:00", "Local bite", foodNote));
    timeline.push(seq("Return begins", "Head to airport or station", "Allow time for transfer and check-in; confirm your departure time."));
    timeline.push(seq("Arrive home", `Return to ${o.origin}`, `Travel home to ${o.origin}.`));
  } else if (o.returnFoldLong) {
    timeline.push(act("Morning", "08:00–11:00", t.morning || "Morning activity"));
    timeline.push(act("Lunch", "12:30–14:00", "Local bite", foodNote));
    timeline.push(seq("Return begins", "Final activity, then depart", "A partial local activity before heading to the airport or station."));
    timeline.push(seq("Departure", "Check-in and depart", "Begin the return journey; travel continues overnight."));
  } else if (o.partialOutbound) {
    timeline.push(seq("Departure", `Depart ${o.origin}`, "Check in and travel to your destination; confirm your transport."));
    timeline.push(seq("Arrival", `Arrive in ${o.dShort}`, "Clear arrivals and transfer to your stay."));
    timeline.push(act("Evening", "18:30–21:00", t.evening || "Settle in"));
  } else if (o.partialReturn) {
    timeline.push(act("Morning", "08:00–10:30", t.morning || "Morning activity"));
    timeline.push(seq("Return begins", "Head to airport or station", "Allow time for transfer and check-in; confirm your departure time."));
    timeline.push(seq("Arrive home", `Return to ${o.origin}`, `Travel home to ${o.origin}.`));
  } else {
    timeline.push(act("Morning", "08:00–11:00", t.morning || "Morning activity"));
    timeline.push(seq("Late morning", "Mid-morning break", "A short break or local transit between stops."));
    timeline.push(act("Lunch", "12:30–14:00", "Local bite", foodNote));
    timeline.push(act("Afternoon", "14:00–18:00", t.afternoon || "Afternoon activity"));
    timeline.push(act("Evening", "18:30–21:30", t.evening || "Evening"));
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
    timeline,
    journey,
    gettingAround: "Allow extra time for the transfer and check-in.",
    planAhead: "Reconfirm your departure time and documents.",
    optionalSwap: "Leave earlier to avoid rush.",
    overnight: `Arrive home in ${origin}.`
  };
}

// Flexible / recovery day. Each time slot has its OWN distinct description
// (no two slots share the same text).
function buildRecoveryDay(dest, pace, optional) {
  return {
    title: optional ? "Optional rest day" : "Flexible day",
    location: dest.name,
    intensity: "Light",
    isTravel: false,
    flexible: true,
    highlights: ["Slow start", "Café and laundry", "Easy stroll"],
    timeline: [
      act("Morning", "09:00–11:00", "Slow start", "Sleep in or enjoy a relaxed breakfast."),
      seq("Late morning", "Café and laundry", "Catch up on laundry and postcards."),
      act("Lunch", "12:30–14:00", "Local bite", "An unhurried lunch at a spot you missed."),
      act("Afternoon", "14:00–17:00", "Easy stroll", "A gentle walk to stretch your legs."),
      act("Evening", "18:30–21:00", "Optional night out", "Rest, or revisit a favourite spot.")
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
    timeline.push(act("Afternoon", "14:00–17:00", t.afternoon || "First outing"));
    timeline.push(act("Evening", "18:30–20:30", "Dinner and rest", "A relaxed dinner near your stay after the day's travel."));
  } else {
    timeline.push(act("Evening", "18:30–21:00", t.evening || "Evening"));
  }
  return {
    title: t.title,
    location,
    intensity,
    isTravel: false,
    flexible: !!t.flexible,
    highlights: highlightLabels(t),
    timeline,
    journey: `Estimated total journey: about ${o.oneWay} hours each way.`,
    gettingAround: gettingAround(dest),
    planAhead: "Confirm opening hours and book popular tickets before you travel.",
    optionalSwap: t.optional_swap || o.unusedSwap || null,
    overnight: `Overnight in ${location}.`
  };
}

// Folded return: travel folded into the last template day.
//   <=3h (light): a real morning activity, then the return journey — the
//     activity title is kept because the morning activity is genuine.
//   3–6h (evening): no scheduled activity, just breakfast and the return
//     journey — the day uses a return-specific title and tags so the heading
//     matches the body.
function buildOverrideReturnFoldDay(t, dest, shift, o) {
  const intensity = applyPaceShift(t.intensity || "Moderate", shift);
  const location = dest.name;
  const timeline = [];
  let title;
  let highlights;
  if (o.profile === "light") {
    timeline.push(act("Morning", "08:00–11:00", t.morning || "Morning activity"));
    title = t.title;
    highlights = highlightLabels(t);
  } else {
    timeline.push(seq("Morning", "Breakfast or a short walk", "A relaxed start before heading home."));
    title = `Return: ${dest.name} → ${o.origin}`;
    highlights = ["Breakfast", "Return", "Arrive home"];
  }
  o.wording.return.forEach(([slot, name, note]) => timeline.push(seq(slot, name, note)));
  timeline.push(seq("Arrive home", "Arrive home", `Travel home to ${o.origin}.`));
  return {
    title,
    location,
    intensity,
    isTravel: false,
    flexible: o.profile === "light" ? !!t.flexible : false,
    highlights,
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
    timeline,
    journey: `Estimated total journey: about ${o.oneWay} hours each way.`,
    gettingAround: gettingAround(dest),
    planAhead: "Confirm your departure time.",
    optionalSwap: null,
    overnight: "Home"
  };
}

// Build the middle block of an itinerary: real template days plus an optional
// pace-driven recovery day, then filler recovery days so the block reaches
// `targetMiddle`. The block is never longer than `targetMiddle`, and filler is
// always inserted in the MIDDLE (never after the return day).
function buildMiddleBlock(middleTemplates, targetMiddle, buildDay, buildFiller, paceWantsRecovery) {
  let days = middleTemplates.map(buildDay);
  if (paceWantsRecovery && days.length >= 1 && days.length < targetMiddle) {
    const at = Math.floor(days.length / 2);
    days = days.slice(0, at).concat([buildFiller()], days.slice(at));
  }
  if (days.length > targetMiddle) days = days.slice(0, targetMiddle);
  while (days.length < targetMiddle) days.push(buildFiller());
  return days;
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

  const arrivalOpts = { profile, oneWay, mode, wording, origin, dShort, unusedSwap };
  const returnOpts = { profile, oneWay, mode, wording, origin, dShort };
  const dedicatedArrivalOpts = { oneWay, mode, wording, origin, dShort };
  const dedicatedReturnOpts = { oneWay, mode, wording, origin, dShort };
  const filler = () => buildRecoveryDay(dest, pace, false);
  const templateDay = (t) => buildTemplateDay(t, dest, shift, { unusedSwap });

  const days = [];
  if (folded) {
    const first = selected[0];
    const last = selected.length > 1 ? selected[selected.length - 1] : null;
    const middleTemplates = selected.length > 2 ? selected.slice(1, selected.length - 1) : [];
    const arrivalDay = first
      ? buildOverrideArrivalFoldDay(first, dest, shift, arrivalOpts)
      : buildOverrideDedicatedArrivalDay(dest, dedicatedArrivalOpts);
    const returnDay = last
      ? buildOverrideReturnFoldDay(last, dest, shift, returnOpts)
      : buildOverrideDedicatedReturnDay(dest, dedicatedReturnOpts);
    const targetMiddle = Math.max(0, totalDays - 2);
    const middleDays = buildMiddleBlock(middleTemplates, targetMiddle, templateDay, filler, paceWantsRecovery);
    days.push(arrivalDay, ...middleDays, returnDay);
  } else {
    // dedicated (6–8h)
    const targetMiddle = Math.max(0, totalDays - 2);
    const middleDays = buildMiddleBlock(selected, targetMiddle, templateDay, filler, paceWantsRecovery);
    days.push(
      buildOverrideDedicatedArrivalDay(dest, dedicatedArrivalOpts),
      ...middleDays,
      buildOverrideDedicatedReturnDay(dest, dedicatedReturnOpts)
    );
  }

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

  const filler = () => buildRecoveryDay(dest, pace, fastPace);
  const templateDay = (t) => buildTemplateDay(t, dest, shift, { unusedSwap });

  const days = [];
  if (tier === "fold" || tier === "partialFold") {
    const first = selected[0];
    const last = selected.length > 1 ? selected[selected.length - 1] : null;
    const middleTemplates = selected.length > 2 ? selected.slice(1, selected.length - 1) : [];
    const outOpt = tier === "partialFold"
      ? { partialOutbound: true, origin, dShort, oneWay, unusedSwap }
      : { outbound: true, origin, dShort, oneWay, unusedSwap };
    const retOpt = tier === "partialFold"
      ? { partialReturn: true, origin, dShort, oneWay, unusedSwap }
      : { returnFold: true, origin, dShort, oneWay, unusedSwap };
    const arrivalDay = first
      ? buildTemplateDay(first, dest, shift, outOpt)
      : buildTravelDay("outbound", { dest, origin, dShort, oneWay, long: false, hasConnection });
    const returnDay = last
      ? buildTemplateDay(last, dest, shift, retOpt)
      : buildTravelDay("return", { dest, origin, dShort, oneWay, long: false, hasConnection });
    const targetMiddle = Math.max(0, totalDays - 2);
    const middleDays = buildMiddleBlock(middleTemplates, targetMiddle, templateDay, filler, paceWantsRecovery);
    days.push(arrivalDay, ...middleDays, returnDay);
  } else if (tier === "medium") {
    const targetMiddle = Math.max(0, totalDays - 2);
    const middleDays = buildMiddleBlock(selected, targetMiddle, templateDay, filler, paceWantsRecovery);
    days.push(
      buildTravelDay("outbound", { dest, origin, dShort, oneWay, long: false, hasConnection }),
      ...middleDays,
      buildTravelDay("return", { dest, origin, dShort, oneWay, long: false, hasConnection })
    );
  } else {
    const targetMiddle = Math.max(0, totalDays - 4);
    const middleDays = buildMiddleBlock(selected, targetMiddle, templateDay, filler, paceWantsRecovery);
    days.push(
      buildTravelDay("outbound", { dest, origin, dShort, oneWay, long: true, hasConnection }),
      buildTravelDay("arrival", { dest, origin, dShort, oneWay, long: true, hasConnection }),
      ...middleDays,
      buildTravelDay("returnBegins", { dest, origin, dShort, oneWay, long: true, hasConnection }),
      buildTravelDay("return", { dest, origin, dShort, oneWay, long: true, hasConnection })
    );
  }

  const seqDays = days.slice(0, totalDays).map((d, i) => ({ ...d, day: i + 1 }));
  return applyDietToItinerary(seqDays, prefs.dietary);
}