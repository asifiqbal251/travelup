// Pure, deterministic collection builders for the Discovery Home.
// No rendering here — these helpers are exported so they can be tested without
// a component. All ordering is deterministic (no Math.random); destination
// id/name is the final tie-breaker. Each destination rail is deduped by
// destination id, capped at 10, and omitted when it has fewer than 3 entries.
import { MONTHS } from "@/lib/options";
import { buildReasons } from "@/lib/scoring";

const MAX = 10;
const MIN = 3;

const NATURE_TAGS = ["Nature", "Relaxation", "Beaches", "Wildlife"];
const CITY_TAGS = ["Cities", "History and culture"];

export function isValidDestination(d) {
  return !!d && !!d.id && !!d.name && !!d.country && !!d.image_url;
}

export function filterValid(destinations) {
  return (destinations || []).filter(isValidDestination);
}

function idKey(d) {
  return String((d && (d.id || d.name)) || "");
}

function byIdName(a, b) {
  return idKey(a).localeCompare(idKey(b));
}

// Dedupe by key, cap at MAX, omit the rail entirely when fewer than MIN remain.
function finalize(items, keyFn) {
  const seen = new Set();
  const out = [];
  for (const it of items) {
    const k = keyFn(it);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(it);
    if (out.length >= MAX) break;
  }
  return out.length >= MIN ? out : [];
}

function currentMonthNum(prefs) {
  const m = prefs && prefs.travelMonth;
  if (m != null && m !== "flexible" && !Number.isNaN(Number(m))) return Number(m);
  return new Date().getMonth() + 1;
}

export function displayMonthName(prefs) {
  return MONTHS[currentMonthNum(prefs) - 1];
}

function firstInterest(d) {
  return (d.primary_interests || [])[0] || (d.interest_tags || [])[0] || null;
}

function tagsFor(d, wanted) {
  const out = [];
  for (const t of (d.primary_interests || []).concat(d.interest_tags || [])) {
    if (wanted && !wanted.includes(t)) continue;
    if (!out.includes(t)) out.push(t);
    if (out.length >= 2) break;
  }
  if (out.length === 0) {
    for (const t of (d.primary_interests || []).concat(d.interest_tags || [])) {
      if (!out.includes(t)) out.push(t);
      if (out.length >= 2) break;
    }
  }
  return out.slice(0, 2);
}

// ---- Returning-state detection ----
// Personalized rails run only on a fully completed preference object; a partial
// object never reaches rankDestinations.
export function isReturningPrefs(prefs) {
  if (!prefs) return false;
  const hasCity = !!prefs.departureCity && String(prefs.departureCity).trim() !== "";
  const hasDays = Number.isFinite(Number(prefs.travelDays));
  const hasInterests = Array.isArray(prefs.interests) && prefs.interests.length > 0;
  return !!prefs.residenceCountry && hasCity && hasDays && !!prefs.budget && hasInterests;
}

// Compact context line for the returning strip, e.g.
// "7-day trip from Vancouver · May · nature and food"
export function returningContext(prefs) {
  if (!prefs) return "";
  const days = prefs.travelDays;
  const city = prefs.departureCity;
  const month = prefs.travelMonth && prefs.travelMonth !== "flexible"
    ? MONTHS[Number(prefs.travelMonth) - 1]
    : "Flexible timing";
  const liked = (prefs.interests || []).slice(0, 2).map((i) => String(i).toLowerCase());
  const parts = [];
  parts.push(city ? `${days}-day trip from ${city}` : `${days}-day trip`);
  parts.push(month);
  if (liked.length) parts.push(liked.join(" and "));
  return parts.join(" · ");
}

export function bestMonthsSummary(dest) {
  if (!dest) return "Year-round";
  const s = (dest.strong_months || []).map((m) => MONTHS[m - 1]).filter(Boolean);
  const sh = (dest.shoulder_months || []).map((m) => MONTHS[m - 1]).filter(Boolean);
  const parts = [];
  if (s.length) parts.push(`Best: ${s.join(", ")}`);
  if (sh.length) parts.push(`Good: ${sh.join(", ")}`);
  return parts.join(" · ") || "Year-round";
}

// ---- First-time editorial rails (no scores, no travel estimates) ----

export function greatThisMonth(destinations) {
  const month = new Date().getMonth() + 1;
  const monthName = MONTHS[month - 1];
  const all = filterValid(destinations);
  const strong = all.filter((d) => (d.strong_months || []).includes(month));
  const shoulder = all.filter((d) => !strong.includes(d) && (d.shoulder_months || []).includes(month));
  const sortFn = (a, b) => (a.min_days - b.min_days) || byIdName(a, b);
  const toItems = (arr, peak) => arr.map((d) => ({
    dest: d,
    reason: peak ? `Peak season in ${monthName}` : `Good in ${monthName}`,
    tags: [monthName, firstInterest(d)].filter(Boolean).slice(0, 2)
  }));
  const items = [
    ...toItems(strong.slice().sort(sortFn), true),
    ...toItems(shoulder.slice().sort(sortFn), false)
  ];
  return finalize(items, (it) => idKey(it.dest));
}

export function shortTrips(destinations) {
  const items = filterValid(destinations)
    .filter((d) => d.min_days <= 4 && d.max_days >= 3)
    .sort((a, b) => (a.min_days - b.min_days) || (a.max_days - b.max_days) || byIdName(a, b))
    .map((d) => ({
      dest: d,
      reason: `Possible in ${d.min_days} day${d.min_days === 1 ? "" : "s"}`,
      tags: [`${d.min_days}–${d.max_days} days`, firstInterest(d)].filter(Boolean).slice(0, 2)
    }));
  return finalize(items, (it) => idKey(it.dest));
}

export function citiesWithStory(destinations) {
  const all = filterValid(destinations);
  const primary = all.filter((d) => (d.primary_interests || []).some((x) => CITY_TAGS.includes(x)));
  const tagOnly = all.filter(
    (d) => !primary.includes(d) && (d.interest_tags || []).some((x) => CITY_TAGS.includes(x))
  );
  const toItems = (arr) => arr.map((d) => ({
    dest: d,
    reason: "Cities & culture",
    tags: tagsFor(d, CITY_TAGS)
  }));
  const items = [
    ...toItems(primary.slice().sort(byIdName)),
    ...toItems(tagOnly.slice().sort(byIdName))
  ];
  return finalize(items, (it) => idKey(it.dest));
}

export function natureAndReset(destinations) {
  const items = filterValid(destinations)
    .map((d) => {
      const pOverlap = (d.primary_interests || []).filter((x) => NATURE_TAGS.includes(x)).length;
      const tOverlap = (d.interest_tags || []).filter((x) => NATURE_TAGS.includes(x)).length;
      return { d, pOverlap, tOverlap, matched: tagsFor(d, NATURE_TAGS) };
    })
    .filter((x) => x.pOverlap > 0 || x.tOverlap > 0)
    .sort((a, b) => (b.pOverlap - a.pOverlap) || (b.tOverlap - a.tOverlap) || byIdName(a.d, b.d))
    .map((x) => ({
      dest: x.d,
      reason: x.matched[0] ? `For ${x.matched[0].toLowerCase()}` : "Nature & reset",
      tags: x.matched
    }));
  return finalize(items, (it) => idKey(it.dest));
}

// ---- Returning personalized rails (derived from rankDestinations output) ----
// `ranked` is the eligible array returned by the existing rankDestinations();
// we never recreate scoring or practicality logic here.

function personalizedReason(dest, prefs, result) {
  const reasons = buildReasons(dest, prefs, result);
  return (reasons && reasons[0]) || "A strong practical match";
}

function resultTags(result) {
  const tags = [];
  if (result && Array.isArray(result.matchedInterests)) {
    for (const t of result.matchedInterests) {
      if (!tags.includes(t)) tags.push(t);
      if (tags.length >= 2) break;
    }
  }
  return tags.slice(0, 2);
}

function toPersonalizedItem({ dest, result }, prefs) {
  return {
    dest,
    result,
    reason: personalizedReason(dest, prefs, result),
    tags: resultTags(result)
  };
}

export function topTravelFits(ranked, prefs) {
  const items = ranked.slice(0, MAX).map((r) => toPersonalizedItem(r, prefs));
  return finalize(items, (it) => idKey(it.dest));
}

export function easyEscapes(ranked, prefs) {
  const items = ranked
    .slice()
    .sort(
      (a, b) =>
        (a.result.practicality.oneWayHours - b.result.practicality.oneWayHours) ||
        (b.result.finalRaw - a.result.finalRaw) ||
        byIdName(a.dest, b.dest)
    )
    .map((r) => toPersonalizedItem(r, prefs));
  return finalize(items, (it) => idKey(it.dest));
}

export function becauseYouLike(ranked, prefs) {
  const liked = (prefs && prefs.interests) || [];
  const items = ranked
    .map((r) => {
      const primary = r.dest.primary_interests || [];
      const tags = r.dest.interest_tags || [];
      const totalOverlap = [...primary, ...tags].filter((x) => liked.includes(x)).length;
      const primaryOverlap = primary.filter((x) => liked.includes(x)).length;
      return { r, totalOverlap, primaryOverlap };
    })
    .filter((x) => x.totalOverlap > 0)
    .sort(
      (a, b) =>
        (b.totalOverlap - a.totalOverlap) ||
        (b.primaryOverlap - a.primaryOverlap) ||
        (b.r.result.finalRaw - a.r.result.finalRaw) ||
        byIdName(a.r.dest, b.r.dest)
    )
    .map((x) => toPersonalizedItem(x.r, prefs));
  return finalize(items, (it) => idKey(it.dest));
}

export function strongInMonth(ranked, prefs) {
  const month = currentMonthNum(prefs);
  const monthName = MONTHS[month - 1];
  const strong = ranked.filter((r) => (r.dest.strong_months || []).includes(month));
  const shoulder = ranked.filter(
    (r) => !strong.includes(r) && (r.dest.shoulder_months || []).includes(month)
  );
  const sortFn = (a, b) => (b.result.finalRaw - a.result.finalRaw) || byIdName(a.dest, b.dest);
  const toItems = (arr, peak) =>
    arr.slice().sort(sortFn).map((r) => ({
      ...toPersonalizedItem(r, prefs),
      reason: peak ? `Peak season in ${monthName}` : `Good in ${monthName}`,
      tags: [monthName, ...resultTags(r.result)].slice(0, 2)
    }));
  const items = [...toItems(strong, true), ...toItems(shoulder, false)];
  return finalize(items, (it) => idKey(it.dest));
}

// ---- Saved-trip continuation rail ----
// getSavedTrips() already returns valid snapshots newest-first by updatedAt.
// Show whenever non-empty (explicit per-rail rule); cap at 10.
export function savedTripsRail(savedTrips) {
  return (savedTrips || []).slice(0, MAX).map((t) => ({ trip: t }));
}