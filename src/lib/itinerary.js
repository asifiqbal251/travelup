// Deterministic, travel-aware itinerary generation from curated destination
// day templates. The selected trip length is the complete vacation (home to
// home), so outbound and return travel are placed WITHIN the requested number
// of days — never on top of it. Travel allocation is driven by the existing
// deterministic one-way travel estimate:
//   <=8h each way:  travel folded into the first and last template days
//   >8–16h each way: a dedicated outbound day and a dedicated return day
//   >16h each way:  outbound day + arrival/recovery day + return day
// Day cards carry a structured 5-entry timeline and compact planning sections,
// derived deterministically from the curated morning/afternoon/evening,
// local-bite, top-experience, interest, pace, activity and transport data.
// No cycling, no repetition, no "(continued)" labels, no live schedules.
import { ACTIVITY_ORDER } from "@/lib/options";
import { applyDietToItinerary } from "@/lib/diet";
import { assessPracticality } from "@/lib/practicality";

const INT_ORDER = ["Light", "Moderate", "High", "Highly active"];

function applyPaceShift(intensity, shift) {
  const i = INT_ORDER.indexOf(intensity);
  if (i < 0 || shift === 0) return intensity;
  const ni = Math.max(0, Math.min(INT_ORDER.length - 1, i + shift));
  return INT_ORDER[ni];
}

// Short, clean activity label from a template sentence.
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

function highlightLabels(t, dest) {
  const out = [];
  (t.interests || []).forEach((i) => { if (out.length < 3) out.push(i); });
  (dest.top_experiences || []).forEach((e) => { if (out.length < 3 && !out.includes(e)) out.push(e); });
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

function pickExperience(t, dest, skip) {
  const used = `${t.title || ""} ${t.morning || ""} ${t.afternoon || ""} ${t.evening || ""}`.toLowerCase();
  const exps = dest.top_experiences || [];
  const cand = exps.filter((e) => !used.includes(e.toLowerCase()) && e !== skip);
  return cand[0] || exps.find((e) => e !== skip) || exps[0] || null;
}

function lateMorning(t, dest) {
  const te = pickExperience(t, dest, null);
  if (!te) return { name: "Sightseeing", note: "Take the morning at your own pace." };
  return { name: te, note: "A signature experience; confirm opening hours before you go." };
}

function buildTemplateDay(t, dest, shift, opts) {
  const intensity = applyPaceShift(t.intensity || "Moderate", shift);
  const highlights = highlightLabels(t, dest);
  const location = dest.name;
  const lm = lateMorning(t, dest);
  const timeline = [];

  if (opts.outbound) {
    timeline.push({ slot: "Morning", time: "06:00–13:00", duration: `~${opts.oneWay} hr`, name: `Depart ${opts.origin}`, source: null, note: `Travel to ${dest.name}; arrive and transfer to your stay. Confirm transport before travel.` });
    timeline.push({ slot: "Late morning", time: "13:00–14:30", duration: "~1 hr", name: `Arrive in ${opts.dShort}`, source: null, note: "Settle in and freshen up after the journey." });
    timeline.push({ slot: "Lunch", time: "12:30–14:00", duration: "~1.5 hr", name: "Local bite", source: "food_note" });
    timeline.push({ slot: "Afternoon", time: "15:00–18:00", duration: "~3 hr", name: shortName(t.morning) || "First outing", source: "morning" });
    timeline.push({ slot: "Evening", time: "18:30–21:00", duration: "~2 hr", name: shortName(t.evening) || "Settle in", source: "evening" });
  } else if (opts.returnFold) {
    timeline.push({ slot: "Morning", time: "08:00–11:00", duration: "~3 hr", name: shortName(t.morning) || "Last outing", source: "morning" });
    timeline.push({ slot: "Late morning", time: "11:00–12:30", duration: "~1.5 hr", name: shortName(t.afternoon) || "Sightseeing", source: "afternoon" });
    timeline.push({ slot: "Lunch", time: "12:30–14:00", duration: "~1.5 hr", name: "Local bite", source: "food_note" });
    timeline.push({ slot: "Afternoon", time: "14:00–16:30", duration: "~2.5 hr", name: `Travel to ${opts.origin}`, source: null, note: "Head to the airport or station for your return; confirm your departure time." });
    timeline.push({ slot: "Evening", time: "17:00–21:00", duration: `~${opts.oneWay} hr`, name: `Return to ${opts.origin}`, source: null, note: "Travel home; arrive in the evening." });
  } else {
    timeline.push({ slot: "Morning", time: "08:00–11:00", duration: "~3 hr", name: shortName(t.morning) || "Morning activity", source: "morning" });
    timeline.push({ slot: "Late morning", time: "11:00–12:30", duration: "~1.5 hr", name: lm.name, source: null, note: lm.note });
    timeline.push({ slot: "Lunch", time: "12:30–14:00", duration: "~1.5 hr", name: "Local bite", source: "food_note" });
    timeline.push({ slot: "Afternoon", time: "14:00–18:00", duration: "~4 hr", name: shortName(t.afternoon) || "Afternoon activity", source: "afternoon" });
    timeline.push({ slot: "Evening", time: "18:30–21:30", duration: "~3 hr", name: shortName(t.evening) || "Evening", source: "evening" });
  }

  const swap = pickExperience(t, dest, lm.name);
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
    gettingAround: gettingAroundText(dest.travel_mode),
    planAhead: "Confirm opening hours and book popular tickets before you travel.",
    optionalSwap: swap ? `Swap for: ${swap}.` : "Swap for a slower pace or an extra rest stop.",
    overnight: `Overnight in ${location}.`
  };
}

function buildTravelDay(kind, o) {
  const { dest, origin, dShort, oneWay } = o;
  if (kind === "outbound") {
    return {
      title: `Outbound: ${origin} → ${dest.name}`,
      location: "In transit",
      intensity: "Light",
      isTravel: true,
      flexible: false,
      highlights: ["Airport or station", "Transfer", "Arrive and settle"],
      morning: `Depart ${origin} for ${dest.name}.`,
      afternoon: `Travel to ${dest.name}; about ${oneWay} hours each way.`,
      evening: `Arrive in ${dShort}; transfer to your accommodation.`,
      food_note: "Pick up something light for the journey.",
      timeline: [
        { slot: "Morning", time: "06:00–13:00", duration: `~${oneWay} hr`, name: `Depart ${origin}`, source: null, note: "Travel to your destination; keep documents and confirmations to hand." },
        { slot: "Late morning", time: "13:00–14:30", duration: "~1 hr", name: "In transit", source: null, note: "Use the time to plan your first full day." },
        { slot: "Lunch", time: "12:30–14:00", duration: "~1.5 hr", name: "Local bite", source: "food_note" },
        { slot: "Afternoon", time: "14:00–17:00", duration: "~3 hr", name: `Arrive in ${dShort}`, source: null, note: "Clear arrivals and transfer to your stay." },
        { slot: "Evening", time: "18:30–21:00", duration: "~2 hr", name: "Settle in", source: "evening" }
      ],
      gettingAround: "Airport or station transfers; book in advance where possible.",
      planAhead: "Keep travel documents and accommodation confirmations accessible.",
      optionalSwap: "Arrange a private transfer for a smoother arrival.",
      overnight: `Overnight in the ${dShort} area.`
    };
  }
  if (kind === "arrival") {
    return {
      title: "Arrival & recovery",
      location: dest.name,
      intensity: "Light",
      isTravel: true,
      flexible: false,
      highlights: ["Recover from travel", "Easy orientation", "Relaxed dinner"],
      morning: "Sleep in and recover from the long journey.",
      afternoon: "Easy orientation walk near your stay.",
      evening: "Relaxed dinner close to your accommodation.",
      food_note: "A simple, comforting local meal.",
      timeline: [
        { slot: "Morning", time: "09:00–11:00", duration: "~2 hr", name: "Slow start", source: null, note: "Rest and adjust after the long flight." },
        { slot: "Late morning", time: "11:00–12:30", duration: "~1.5 hr", name: "Easy orientation", source: null, note: "A short walk to get your bearings." },
        { slot: "Lunch", time: "12:30–14:00", duration: "~1.5 hr", name: "Local bite", source: "food_note" },
        { slot: "Afternoon", time: "14:00–17:00", duration: "~3 hr", name: "Settle in", source: "afternoon" },
        { slot: "Evening", time: "18:30–21:00", duration: "~2.5 hr", name: "Relaxed dinner", source: "evening" }
      ],
      gettingAround: gettingAroundText(dest.travel_mode),
      planAhead: "Don't over-schedule the first day after a long haul.",
      optionalSwap: "Add a short visit if you feel energetic.",
      overnight: `Overnight in ${dest.name}.`
    };
  }
  // return
  return {
    title: `Return: ${dest.name} → ${origin}`,
    location: "In transit",
    intensity: "Light",
    isTravel: true,
    flexible: false,
    highlights: ["Last packing", "Transfer", "Travel home"],
    morning: "Last-minute packing and a short walk.",
    afternoon: "Transfer to the airport or station.",
    evening: `Travel home to ${origin}.`,
    food_note: "A final local coffee before you leave.",
    timeline: [
      { slot: "Morning", time: "08:00–11:00", duration: "~3 hr", name: "Last morning", source: "morning" },
      { slot: "Late morning", time: "11:00–12:30", duration: "~1.5 hr", name: "Final sights", source: null, note: "A short stop if time allows." },
      { slot: "Lunch", time: "12:30–14:00", duration: "~1.5 hr", name: "Local bite", source: "food_note" },
      { slot: "Afternoon", time: "14:00–16:30", duration: "~2.5 hr", name: "Transfer", source: "afternoon" },
      { slot: "Evening", time: "17:00–21:00", duration: `~${oneWay} hr`, name: `Return to ${origin}`, source: "evening" }
    ],
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
      { slot: "Morning", time: "09:00–11:00", duration: "~2 hr", name: "Slow start", source: "morning" },
      { slot: "Late morning", time: "11:00–12:30", duration: "~1.5 hr", name: "Café and laundry", source: null, note: "Catch up on laundry and postcards." },
      { slot: "Lunch", time: "12:30–14:00", duration: "~1.5 hr", name: "Local bite", source: "food_note" },
      { slot: "Afternoon", time: "14:00–17:00", duration: "~3 hr", name: "Easy stroll", source: "afternoon" },
      { slot: "Evening", time: "18:30–21:00", duration: "~2.5 hr", name: "Optional night out", source: "evening" }
    ],
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
  const tier = oneWay <= 8 ? "short" : oneWay <= 16 ? "medium" : "long";
  const origin = (prefs.departureCity || "home").trim();
  const dShort = destShort(dest);

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
  else if (tier === "long") { startTravel = 1; arrival = 1; tailTravel = 1; }
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
  if (tier === "short") {
    const first = selected[0];
    const last = selected.length > 1 ? selected[selected.length - 1] : null;
    const middle = selected.length > 2 ? selected.slice(1, selected.length - 1) : [];
    if (first) days.push(buildTemplateDay(first, dest, shift, { outbound: true, origin, dShort, oneWay }));
    insertRecovery(middle).forEach((t) => {
      if (t) days.push(buildTemplateDay(t, dest, shift, {}));
      else days.push(buildRecoveryDay(dest, pace, false));
    });
    if (last) days.push(buildTemplateDay(last, dest, shift, { returnFold: true, origin, dShort, oneWay }));
    else days.push(buildTravelDay("return", { origin, dShort, dest, oneWay }));
  } else {
    days.push(buildTravelDay("outbound", { origin, dShort, dest, oneWay }));
    if (arrival) days.push(buildTravelDay("arrival", { origin, dShort, dest, oneWay }));
    insertRecovery(selected).forEach((t) => {
      if (t) days.push(buildTemplateDay(t, dest, shift, {}));
      else days.push(buildRecoveryDay(dest, pace, false));
    });
    days.push(buildTravelDay("return", { origin, dShort, dest, oneWay }));
  }

  while (days.length < totalDays) days.push(buildRecoveryDay(dest, pace, fastPace));
  const seq = days.slice(0, totalDays).map((d, i) => ({ ...d, day: i + 1 }));

  return applyDietToItinerary(seq, prefs.dietary);
}