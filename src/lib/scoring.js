// Deterministic, transparent scoring engine for TravelUp.
// Base preference score = 100 across six approved categories (season 25,
// interests 25, budget 15, trip length 15, climate 10, pace/activity/traveller 10).
// A continuous travel-practicality penalty (from the round-trip travel share)
// then produces the final score. No artificial score caps.
import { MONTHS, BUDGET_ORDER, PACE_ORDER, ACTIVITY_ORDER, CLIMATE_ORDER } from "@/lib/options";
import { assessPracticality } from "@/lib/practicality";

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

function travellerMatches(types, t) {
  if (!t || !types || !types.length) return false;
  const n = (x) => String(x || "").toLowerCase().trim();
  const tn = n(t);
  const plur = tn.endsWith("y") ? tn.slice(0, -1) + "ies" : tn + "s";
  return types.some((d) => {
    const dn = n(d);
    return dn === tn || dn === plur;
  });
}

export function scoreDestination(dest, prefs) {
  // 1. Season fit — 25 pts
  let season = 0;
  if (!prefs.travelMonth || prefs.travelMonth === "flexible") {
    season = 20;
  } else {
    const m = Number(prefs.travelMonth);
    if (dest.strong_months && dest.strong_months.includes(m)) season = 25;
    else if (dest.shoulder_months && dest.shoulder_months.includes(m)) season = 12;
    else season = 0;
  }

  // 2. Interest match — 25 pts (primary full, secondary 60%, proportional to user interests)
  const userInterests = prefs.interests || [];
  let interest = 0;
  if (userInterests.length) {
    const primary = dest.primary_interests || [];
    const all = dest.interest_tags || [];
    let sum = 0;
    userInterests.forEach((i) => {
      if (primary.includes(i)) sum += 1;
      else if (all.includes(i)) sum += 0.6;
    });
    interest = (25 * sum) / userInterests.length;
  }
  const matchedInterests = userInterests.filter((i) =>
    (dest.interest_tags || []).includes(i)
  );

  // 3. Budget fit — 15 pts
  let budget = 0;
  const bi = BUDGET_ORDER.indexOf(prefs.budget);
  if (bi >= 0) {
    if ((dest.budget_categories || []).includes(prefs.budget)) budget = 15;
    else {
      const adjacent = (dest.budget_categories || []).some(
        (c) => Math.abs(BUDGET_ORDER.indexOf(c) - bi) === 1
      );
      budget = adjacent ? 8 : 0;
    }
  }

  // 4. Trip length fit — 15 pts (selected duration is the TOTAL trip incl. travel)
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

  // 6. Pace (4) + physical activity (4) + traveller suitability (2) = 10
  let paceFit = 0;
  const paceTags = dest.pace_tags || [];
  if (prefs.pace && paceTags.length) {
    const dist = Math.min(
      ...paceTags.map((p) => levelDistance(PACE_ORDER, prefs.pace, p))
    );
    if (dist === 0) paceFit = 4;
    else if (dist === 1) paceFit = 2;
    else paceFit = 0;
  }
  let activityFit = 0;
  const activityLevels = dest.activity_levels || [];
  if (prefs.activity && activityLevels.length) {
    const dist = Math.min(
      ...activityLevels.map((a) => levelDistance(ACTIVITY_ORDER, prefs.activity, a))
    );
    if (dist === 0) activityFit = 4;
    else if (dist === 1) activityFit = 2;
    else activityFit = 0;
  }
  const travellerFit = travellerMatches(dest.traveller_types, prefs.travellerType)
    ? 2
    : 0;
  const pace = paceFit + activityFit + travellerFit;

  let baseFull = season + interest + budget + length + climate + pace;

  // Previously visited → lower priority (penalty), not excluded
  let visited = false;
  let visitedPenalty = 0;
  if (prefs.visitedCountries && prefs.visitedCountries.length) {
    const visitedList = (prefs.visitedCountries || [])
      .map((s) => s.toLowerCase().trim())
      .filter(Boolean);
    if (
      visitedList.includes((dest.country || "").toLowerCase()) ||
      visitedList.includes((dest.name || "").toLowerCase())
    ) {
      visited = true;
      visitedPenalty = VISITED_PENALTY;
      baseFull -= VISITED_PENALTY;
    }
  }
  baseFull = Math.max(0, baseFull);

  return {
    score: baseFull,
    breakdown: { season, interest, budget, length, climate, pace },
    matchedInterests,
    visited,
    visitedPenalty
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

// Base preference score + continuous travel-practicality penalty → final score.
export function scoreWithPracticality(dest, prefs, prac) {
  const result = scoreDestination(dest, prefs);
  const practicality = prac || assessPracticality(dest, prefs);

  const baseFull = result.score; // full precision
  const penaltyFull = practicality.travelPenalty; // full precision
  const finalRaw = baseFull - penaltyFull; // unrounded, for ranking

  const baseScore = Math.round(baseFull);
  const travelPenalty = Math.min(Math.round(penaltyFull), baseScore);
  const finalScore = Math.max(0, Math.min(100, baseScore - travelPenalty));

  const matchLabel =
    finalScore >= 70
      ? "Strong match"
      : finalScore >= 50
      ? "Fair match"
      : finalScore >= 30
      ? "Weak match"
      : "Poor practical match";

  return {
    ...result,
    practicality,
    baseScore,
    travelPenalty,
    finalScore,
    finalRaw,
    matchLabel
  };
}

export function minUsableDays(tripDays) {
  if (tripDays <= 4) return 1.5;
  if (tripDays <= 7) return 2;
  if (tripDays <= 10) return 2.5;
  return 3;
}

// Practicality ELIGIBILITY GATE, applied BEFORE normal Travel Fit scoring and
// ranking. A destination impractical for the selected trip duration does not
// enter the preference ranking at all — high preference scores can no longer
// override an unreasonable journey. The threshold scales with trip length so
// long-haul destinations remain eligible for longer vacations.
export function isPractical(prac, tripDays) {
  if (!prac) return false;
  return prac.usableDestinationDays >= minUsableDays(tripDays);
}

export function rankDestinations(destinations, prefs) {
  const tripDays = Number((prefs && prefs.travelDays) || 0);
  return destinations
    .filter((d) => !isExcluded(d, prefs))
    .map((d) => ({ dest: d, practicality: assessPracticality(d, prefs) }))
    .filter((r) => isPractical(r.practicality, tripDays))
    .map((r) => ({ dest: r.dest, result: scoreWithPracticality(r.dest, prefs, r.practicality) }))
    .sort((a, b) => {
      if (b.result.finalRaw !== a.result.finalRaw)
        return b.result.finalRaw - a.result.finalRaw;
      const ah = a.result.practicality.oneWayHours;
      const bh = b.result.practicality.oneWayHours;
      if (ah !== bh) return ah - bh;
      if (b.result.breakdown.length !== a.result.breakdown.length)
        return b.result.breakdown.length - a.result.breakdown.length;
      if (b.result.breakdown.interest !== a.result.breakdown.interest)
        return b.result.breakdown.interest - a.result.breakdown.interest;
      return String(a.dest.id || "").localeCompare(String(b.dest.id || ""));
    });
}

export function buildReasons(dest, prefs, result) {
  const reasons = [];
  const monthName =
    prefs.travelMonth && prefs.travelMonth !== "flexible"
      ? MONTHS[Number(prefs.travelMonth) - 1]
      : null;

  if (result.matchedInterests.length) {
    reasons.push(
      `Great for ${result.matchedInterests
        .slice(0, 3)
        .map((i) => i.toLowerCase())
        .join(", ")}`
    );
  }
  if (result.breakdown.season >= 25 && monthName) {
    reasons.push(`Peak season in ${monthName}`);
  } else if (result.breakdown.season >= 12) {
    reasons.push("Enjoyable in your chosen month");
  }
  if (result.breakdown.budget >= 15) {
    reasons.push("Fits your selected budget level");
  } else if (result.breakdown.budget >= 8) {
    reasons.push(`Close to your ${prefs.budget.toLowerCase()} budget`);
  }
  if (result.breakdown.length >= 15) {
    reasons.push(`Ideal for ${prefs.travelDays} total days`);
  }
  if (result.breakdown.climate >= 10 && prefs.climate && prefs.climate !== "No preference") {
    reasons.push(`${prefs.climate.toLowerCase()} climate as you prefer`);
  }
  if (result.breakdown.pace >= 7) {
    reasons.push("Pace, activity and group type suit you");
  }

  let i = 0;
  while (reasons.length < 3 && dest.top_experiences && i < dest.top_experiences.length) {
    reasons.push(dest.top_experiences[i]);
    i++;
  }
  while (reasons.length < 3) reasons.push("A memorable trip awaits");
  return reasons.slice(0, 3);
}

// Relevant revision suggestions when results are weak. Only suggests inputs
// that actually lost points and aren't already flexible.
export function buildSuggestions(ranked, prefs) {
  const top = ranked.slice(0, 3);
  if (!top.length || !top.some((r) => r.result.finalScore < 50)) return [];

  const anyPoor = top.some((r) => r.result.practicality.level === "Poor practical fit");
  const anyStretch = top.some((r) => r.result.practicality.level === "Stretch");
  const anyLen0 = top.some((r) => r.result.breakdown.length === 0);
  const anyBudget0 = top.some((r) => r.result.breakdown.budget === 0);
  const anySeason0 = top.some((r) => r.result.breakdown.season === 0);
  const anyClimate0 = top.some((r) => r.result.breakdown.climate === 0);
  const anyPace0 = top.some((r) => r.result.breakdown.pace === 0);
  const anyInterestLow = top.some((r) => r.result.breakdown.interest < 25);

  const out = [];
  if ((anyPoor || anyStretch || anyLen0) && Number(prefs.travelDays) < 7)
    out.push({ label: "Increase your trip to at least 7 days.", step: 1 });
  if (anyBudget0 && prefs.budget !== "Premium")
    out.push({ label: "Increase your budget category.", step: 2 });
  if (anyInterestLow && (prefs.interests || []).length < 3)
    out.push({ label: "Select more interests that appeal to you.", step: 3 });
  if (prefs.allowDomestic === false)
    out.push({ label: "Allow domestic destinations.", step: 1 });
  if (anySeason0 && prefs.travelMonth && prefs.travelMonth !== "flexible")
    out.push({ label: "Choose a flexible travel month.", step: 1 });
  if (anyPoor || anyStretch)
    out.push({ label: "Consider a closer region.", step: 0 });
  if (anyClimate0 && prefs.climate && prefs.climate !== "No preference")
    out.push({ label: "Select 'No preference' for climate.", step: 4 });
  if (anyPace0)
    out.push({ label: "Revise your pace or activity preference.", step: 4 });
  return out.slice(0, 3);
}