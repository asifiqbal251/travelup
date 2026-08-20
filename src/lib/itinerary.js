// Deterministic, travel-aware itinerary generation from curated destination
// day templates. The selected trip length is the complete vacation (home to
// home), so outbound and return travel are placed WITHIN the requested number
// of days — never on top of it. Travel allocation uses the one-way estimate across four tiers:
//   under 5h each way: travel folded into the first and last template days (full days)
//   5–8h each way:     travel folded, but the arrival/departure days keep only a light option
//   8–15h each way:    a dedicated outbound day (with same-day arrival) + a dedicated return day
//   >15h each way:     outbound spans Day 1 (transit) + Day 2 (arrival/recovery);
//                      return begins on the penultimate day and concludes on the final day
// Travel entries use SEQUENCE-based sections (no invented clock times); the
// estimated total journey duration is shown separately. Destination days use
// a 5-entry timeline built ONLY from that day's own morning/afternoon/
// evening/local-bite content plus local breaks/transit — never attractions
// borrowed from another day. Highlights (day tags) come only from the day's own
// interests. No cycling, repetition or "(continued)" labels.
import { ACTIVITY_ORDER } from "@/lib/options";
import { applyDietToItinerary } from "@/lib/diet";
import { assessPracticality } from "@/lib/practicality";

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
  if (words.length > 6) words = words.slice(0, 6);
  const stop = new Set(["to", "for", "at", "in", "on", "the", "a", "an", "and", "of", "with", "along", "via", "before", "after"]);
  while (words.length > 1 && stop.has(words[words.length - 1].toLowerCase())) words.pop();
  return words.join(" ");
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

// Day tags come ONLY from the day's own authored interests (never attractions
// from elsewhere). Pad with generic free-time tags.
function highlightLabels(t) {
  const out = [];
  (t.interests || []).forEach((i) => { if (out.length < 3) out.push(i); });
  while (out.length < 3) out.push("Free time");
  return out.slice(0, 3);
}

function gettingAroundText(mode) {
  const m = (mode || "").toLowerCase();
  if (/train/.test(m)) return "Local trains and walking; taxis for longer hops.";
  if (/ferry|boat/.test(m)) return "Ferries or boats plus local taxis and walking.";
  if (/rental car|driving/.test(m)) return "A rental car gives the most flexibility here.";
  if (/bus/.test(m)) return "Local buses and taxis.";
  return "Taxis, rideshares and local transit.";
}

// Activity timeline entry (has an indicative clock range for a destination slot).
const act = (slot, time, duration, name, source) => ({ slot, time, duration, name, source, note: null });
// Sequence timeline entry (travel sections — NO invented clock times).
const seq = (slot, name, note, duration) => ({ slot, time: null, duration: duration || "", name, source: null, note });

function buildTemplateDay(t, dest, shift, opts) {
  const intensity = applyPaceShift(t.intensity || "Moderate", shift);
  const highlights = highlightLabels(t);
  const location = dest.name;
  const o = opts || {};
  const timeline = [];

  if (o.outbound) {
    timeline.push(seq("Departure", `Depart ${o.origin}`, "Check in and travel to your destination; confirm your transport."));
    timeline.push(seq("Arrival", `Arrive in ${o.dShort}`, "Clear arrivals and transfer to your stay."));
    timeline.push(act("Lunch", "12:30–14:00", "~1.5 hr", "Local bite", "food_note"));
    timeline.push(act("Afternoon", "15:00–18:00", "~3 hr", shortName(t.morning) || "First outing", "morning"));
    timeline.push(act("Evening", "18:30–21:00", "~2 hr", shortName(t.evening) || "Settle in", "evening"));
  } else if (o.returnFold) {
    timeline.push(act("Morning", "08:00–11:00", "~3 hr", shortName(t.morning) || "Last outing", "morning"));
    timeline.push(act("Late morning", "11:00–12:30", "~1.5 hr", shortName(t.afternoon) || "Sightseeing", "afternoon"));
    timeline.push(act("Lunch", "12:30–14:00", "~1.5 hr", "Local bite", "food_note"));
    timeline.push(seq("Return begins", "Head to airport or station", "Allow time for transfer and check-in; confirm your departure time."));
    timeline.push(seq("Arrive home", `Return to ${o.origin}`, `Travel home to ${o.origin}.`));
  } else if (o.returnFoldLong) {
    timeline.push(act("Morning", "08:00–11:00", "~3 hr", shortName(t.morning) || "Final activity", "morning"));
    timeline.push(act("Lunch", "12:30–14:00", "~1.5 hr", "Local bite", "food_note"));
    timeline.push(seq("Return begins", "Final activity, then depart", "A partial local activity before heading to the airport or station."));
    timeline.push(seq("Departure", "Check-in and depart", "Begin the return journey; travel continues overnight."));
  } else if (o.partialOutbound) {
    timeline.push(seq("Departure", `Depart ${o.origin}`, "Check in and travel to your destination; confirm your transport."));
    timeline.push(seq("Arrival", `Arrive in ${o.dShort}`, "Clear arrivals and transfer to your stay."));
    timeline.push(act("Evening", "18:30–21:00", "~1.5 hr", "Settle in and a casual dinner nearby", "evening"));
  } else if (o.partialReturn) {
    timeline.push(act("Morning", "08:00–10:30", "~2 hr", "Casual breakfast or a brief walk near your stay", "morning"));
    timeline.push(seq("Return begins", "Head to airport or station", "Allow time for transfer and check-in; confirm your departure time."));
    timeline.push(seq("Arrive home", `Return to ${o.origin}`, `Travel home to ${o.origin}.`));
  } else {
    timeline.push(act("Morning", "08:00–11:00", "~3 hr", shortName(t.morning) || "Morning activity", "morning"));
    timeline.push(seq("Late morning", "Mid-morning break", "A short break or local transit between stops."));
    timeline.push(act("Lunch", "12:30–14:00", "~1.5 hr", "Local bite", "food_note"));
    timeline.push(act("Afternoon", "14:00–18:00", "~4 hr", shortName(t.afternoon) || "Afternoon activity", "afternoon"));
    timeline.push(act("Evening", "18:30–21:30", "~3 hr", shortName(t.evening) || "Evening", "evening"));
  }

  const journey = (o.outbound || o.returnFold || o.returnFoldLong || o.partialOutbound || o.partialReturn)
    ? `Estimated total journey: about ${o.oneWay} hours each way.`
    : null;

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
    food_note: t.food_note || "",
    timeline,
    journey,
    gettingAround: gettingAroundText(dest.travel_mode),
    planAhead: "Confirm opening hours and book popular tickets before you travel.",
    optionalSwap: "Swap for a slower pace or an extra rest stop.",
    overnight: `Overnight in ${location}.`
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
      gettingAround: "Airport or station transfers; book in advance where possible.",
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
      gettingAround: gettingAroundText(dest.travel_mode),
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
  // return final day
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
      act("Morning", "09:00–11:00", "~2 hr", "Slow start", "morning"),
      seq("Late morning", "Café and laundry", "Catch up on laundry and postcards."),
      act("Lunch", "12:30–14:00", "~1.5 hr", "Local bite", "food_note"),
      act("Afternoon", "14:00–17:00", "~3 hr", "Easy stroll", "afternoon"),
      act("Evening", "18:30–21:00", "~2.5 hr", "Optional night out", "evening")
    ],
    journey: null,
    gettingAround: gettingAroundText(dest.travel_mode),
    planAhead: optional ? "Skip or swap for sightseeing if you prefer a packed pace." : "Use this day to recharge or revisit a favourite.",
    optionalSwap: "Add a short excursion if you feel rested.",
    overnight: `Overnight in ${dest.name}.`
  };
}

export function generateItinerary(dest, prefs) {
  const totalDays = Math.min(Math.max(prefs.travelDays || 7, 1), 14);
  const templates = (dest.day_templates || []).slice();
  if (!templates.length) return [];

  const prac = assessPracticality(dest, prefs);
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

  let selected;
  const pool = activityTemplates;
  if (templateBudget > 0 && templateBudget <= 4) {
    // Short trips: prioritise signature days over route order.
    const prim = dest.primary_interests || [];
    const userI = prefs.interests || [];
    const scored = pool.map((t, idx) => {
      let s = 0;
      (t.interests || []).forEach((i) => { if (prim.includes(i)) s += 2; if (userI.includes(i)) s += 1; });
      return { t, idx, s };
    }).sort((a, b) => b.s - a.s || a.idx - b.idx);
    selected = scored.slice(0, templateBudget).map((x) => x.t);
  } else {
    selected = pool.slice(0, templateBudget);
  }

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
      ? { partialOutbound: true, origin, dShort, oneWay }
      : { outbound: true, origin, dShort, oneWay };
    const retOpt = tier === "partialFold"
      ? { partialReturn: true, origin, dShort, oneWay }
      : { returnFold: true, origin, dShort, oneWay };
    if (first) days.push(buildTemplateDay(first, dest, shift, outOpt));
    insertRecovery(middle).forEach((t) => {
      if (t) days.push(buildTemplateDay(t, dest, shift, {}));
      else days.push(buildRecoveryDay(dest, pace, false));
    });
    if (last) days.push(buildTemplateDay(last, dest, shift, retOpt));
    else days.push(buildTravelDay("return", { dest, origin, dShort, oneWay, long: false, hasConnection }));
  } else if (tier === "medium") {
    days.push(buildTravelDay("outbound", { dest, origin, dShort, oneWay, long: false, hasConnection }));
    insertRecovery(selected).forEach((t) => {
      if (t) days.push(buildTemplateDay(t, dest, shift, {}));
      else days.push(buildRecoveryDay(dest, pace, false));
    });
    days.push(buildTravelDay("return", { dest, origin, dShort, oneWay, long: false, hasConnection }));
  } else {
    // long
    days.push(buildTravelDay("outbound", { dest, origin, dShort, oneWay, long: true, hasConnection }));
    days.push(buildTravelDay("arrival", { dest, origin, dShort, oneWay, long: true, hasConnection }));
    insertRecovery(selected).forEach((t) => {
      if (t) days.push(buildTemplateDay(t, dest, shift, {}));
      else days.push(buildRecoveryDay(dest, pace, false));
    });
    days.push(buildTravelDay("returnBegins", { dest, origin, dShort, oneWay, long: true, hasConnection }));
    days.push(buildTravelDay("return", { dest, origin, dShort, oneWay, long: true, hasConnection }));
  }

  while (days.length < totalDays) days.push(buildRecoveryDay(dest, pace, fastPace));
  const seqDays = days.slice(0, totalDays).map((d, i) => ({ ...d, day: i + 1 }));

  return applyDietToItinerary(seqDays, prefs.dietary);
}