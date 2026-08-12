// Deterministic, transparent scoring engine for TravelUp.
// Total score = 100. Adjust the weights here to tune recommendations.
import { MONTHS, BUDGET_ORDER, PACE_ORDER, ACTIVITY_ORDER, CLIMATE_ORDER } from "@/lib/options";

const VISITED_PENALTY = 12; // lower priority, not exclusion

function climateDistance(a, b) {
  const ia = CLIMATE_ORDER.indexOf(a);
  const ib = CLIMATE_ORDER.indexOf(b);
  if (ia < 0 || ib < 0) return 99;
  return Math.abs(ia - ib);
}

function levelDistance(order, a, b) {
  const ia = order.indexOf(a);
  const ib = order.indexOf(b);
  if (ia < 0 || ib < 0) return 99;
  return Math.abs(ia - ib);
}

export function scoreDestination(dest, prefs) {
  // 1. Season fit — 25 pts
  let season = 0;
  let seasonNote = "";
  if (!prefs.travelMonth || prefs.travelMonth === "flexible") {
    season = 20;
    seasonNote = "Generally suitable across the year for most travellers";
  } else {
    const m = Number(prefs.travelMonth);
    if (dest.strong_months && dest.strong_months.includes(m)) {
      season = 25;
      seasonNote = "Peak season for your travel month";
    } else if (dest.shoulder_months && dest.shoulder_months.includes(m)) {
      season = 12;
      seasonNote = "Shoulder season — still enjoyable with fewer crowds";
    } else {
      season = 0;
      seasonNote = "Off-season for your chosen month";
    }
  }

  // 2. Interest match — 25 pts (proportional, full at 3 matching tags)
  const userInterests = prefs.interests || [];
  const matchedInterests = (dest.interest_tags || []).filter((t) => userInterests.includes(t));
  const interest = Math.round((25 * Math.min(matchedInterests.length, 3)) / 3);

  // 3. Budget fit — 15 pts
  let budget = 0;
  const bi = BUDGET_ORDER.indexOf(prefs.budget);
  if (bi >= 0) {
    if ((dest.budget_categories || []).includes(prefs.budget)) {
      budget = 15;
    } else {
      const adjacent = (dest.budget_categories || []).some((c) => Math.abs(BUDGET_ORDER.indexOf(c) - bi) === 1);
      budget = adjacent ? 8 : 0;
    }
  }

  // 4. Trip length fit — 15 pts
  let length = 0;
  const d = prefs.travelDays;
  if (typeof d === "number") {
    const mn = dest.min_days;
    const mx = dest.max_days;
    if (d >= mn && d <= mx) length = 15;
    else if (d >= mn - 2 && d <= mx + 2) length = 8;
    else length = 0;
  }

  // 5. Climate preference — 10 pts
  let climate = 0;
  if (!prefs.climate || prefs.climate === "No preference") {
    climate = 10;
  } else {
    let best = 0;
    (dest.climate_tags || []).forEach((c) => {
      if (c === prefs.climate) best = Math.max(best, 10);
      else if (climateDistance(prefs.climate, c) === 1) best = Math.max(best, 5);
    });
    climate = best;
  }

  // 6. Pace + physical activity — 10 pts
  let pace = 0;
  const paceTags = dest.pace_tags || [];
  const activityLevels = dest.activity_levels || [];
  const pd = paceTags.length ? Math.min(...paceTags.map((p) => levelDistance(PACE_ORDER, prefs.pace, p))) : 99;
  const ad = activityLevels.length ? Math.min(...activityLevels.map((a) => levelDistance(ACTIVITY_ORDER, prefs.activity, a))) : 99;
  const totalDist = (pd === 99 ? 0 : pd) + (ad === 99 ? 0 : ad);
  if (totalDist === 0) pace = 10;
  else if (totalDist === 1) pace = 7;
  else if (totalDist === 2) pace = 5;
  else pace = 0;

  let score = season + interest + budget + length + climate + pace;

  // Previously visited → lower priority (penalty), not excluded
  let visited = false;
  if (prefs.visitedCountries && prefs.visitedCountries.length) {
    const visitedList = (prefs.visitedCountries || [])
      .map((s) => s.toLowerCase().trim())
      .filter(Boolean);
    if (
      visitedList.includes((dest.country || "").toLowerCase()) ||
      visitedList.includes((dest.name || "").toLowerCase())
    ) {
      visited = true;
      score -= VISITED_PENALTY;
    }
  }

  return {
    score: Math.max(0, score),
    breakdown: { season, interest, budget, length, climate, pace },
    seasonNote,
    matchedInterests,
    visited
  };
}

export function isExcluded(dest, prefs) {
  const excl = (prefs.excludedDestinations || [])
    .map((s) => s.toLowerCase().trim())
    .filter(Boolean);
  if (
    excl.some(
      (e) =>
        (dest.country || "").toLowerCase().includes(e) ||
        (dest.name || "").toLowerCase().includes(e)
    )
  ) {
    return true;
  }
  if (prefs.allowDomestic === false) {
    if (
      (prefs.residenceCountry || "").toLowerCase().trim() ===
      (dest.country || "").toLowerCase().trim()
    ) {
      return true;
    }
  }
  return false;
}

export function rankDestinations(destinations, prefs) {
  return destinations
    .filter((d) => !isExcluded(d, prefs))
    .map((d) => ({ dest: d, result: scoreDestination(d, prefs) }))
    .sort((a, b) => b.result.score - a.result.score);
}

export function buildReasons(dest, prefs, result) {
  const reasons = [];
  const monthName =
    prefs.travelMonth && prefs.travelMonth !== "flexible"
      ? MONTHS[Number(prefs.travelMonth) - 1]
      : null;

  if (result.matchedInterests.length) {
    reasons.push(`Great for ${result.matchedInterests.slice(0, 3).map((i) => i.toLowerCase()).join(", ")}`);
  }
  if (result.breakdown.season >= 25 && monthName) {
    reasons.push(`Peak season in ${monthName}`);
  } else if (result.breakdown.season >= 12) {
    reasons.push("Enjoyable in your chosen month");
  }
  if (result.breakdown.budget >= 15) {
    reasons.push(`Matches your ${prefs.budget.toLowerCase()} budget`);
  } else if (result.breakdown.budget >= 8) {
    reasons.push(`Close to your ${prefs.budget.toLowerCase()} budget`);
  }
  if (result.breakdown.length >= 15) {
    reasons.push(`Ideal for ${prefs.travelDays} days`);
  }
  if (result.breakdown.climate >= 10 && prefs.climate && prefs.climate !== "No preference") {
    reasons.push(`${prefs.climate.toLowerCase()} climate as you prefer`);
  }
  if (result.breakdown.pace >= 7) {
    reasons.push("Pace and activity level suit you");
  }

  let i = 0;
  while (reasons.length < 3 && dest.top_experiences && i < dest.top_experiences.length) {
    reasons.push(dest.top_experiences[i]);
    i++;
  }
  while (reasons.length < 3) reasons.push("A memorable trip awaits");
  return reasons.slice(0, 3);
}