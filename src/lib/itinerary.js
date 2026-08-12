// Deterministic itinerary generation from curated destination day templates.
const INT_ORDER = ["Light", "Moderate", "High"];

function shiftToward(current, target) {
  const ci = INT_ORDER.indexOf(current);
  const ti = INT_ORDER.indexOf(target);
  if (ci < 0 || ti < 0 || ci === ti) return current;
  const ni = ci + Math.sign(ti - ci);
  return INT_ORDER[ni];
}
function downshift(c) {
  const i = INT_ORDER.indexOf(c);
  return i <= 0 ? INT_ORDER[0] : INT_ORDER[i - 1];
}
function upshift(c) {
  const i = INT_ORDER.indexOf(c);
  if (i < 0) return c;
  return i >= INT_ORDER.length - 1 ? INT_ORDER[INT_ORDER.length - 1] : INT_ORDER[i + 1];
}

const ACTIVITY_TO_INTENSITY = {
  Light: "Light",
  Moderate: "Moderate",
  Active: "High",
  "Highly active": "High"
};

function restDay(dayNum) {
  return {
    day: dayNum,
    title: "Rest & flexible day",
    morning: "Sleep in and enjoy a slow, unrushed morning at your accommodation.",
    afternoon: "Revisit a favourite spot, wander nearby, or simply relax.",
    evening: "An easy dinner close by and some quiet downtime.",
    food_note: "Try a relaxed local café or room service favourite.",
    intensity: "Light",
    flexible: true
  };
}

function buildDay(template, dayNum, desiredIntensity, recycled) {
  let intensity = template.intensity || "Moderate";
  intensity = shiftToward(intensity, desiredIntensity);
  return {
    day: dayNum,
    title: recycled ? `${template.title} (continued)` : template.title,
    morning: template.morning,
    afternoon: template.afternoon,
    evening: template.evening,
    food_note: template.food_note || "",
    intensity,
    flexible: !!template.flexible
  };
}

export function generateItinerary(dest, prefs) {
  const totalDays = prefs.travelDays || 7;
  const templates = (dest.day_templates || []).slice();
  if (!templates.length) return [];

  const userInterests = prefs.interests || [];
  let desired = ACTIVITY_TO_INTENSITY[prefs.activity] || "Moderate";
  if (prefs.pace === "Relaxed") desired = downshift(desired);
  if (prefs.pace === "Fast-paced") desired = upshift(desired);

  // Rank templates by interest overlap, then non-flexible first.
  const ranked = templates
    .map((t, i) => ({
      t,
      i,
      interestScore: (t.interests || []).filter((x) => userInterests.includes(x)).length,
      flex: !!t.flexible
    }))
    .sort((a, b) => b.interestScore - a.interestScore || (a.flex ? 1 : 0) - (b.flex ? 1 : 0));

  const sequence = [];
  let activeCount = 0;
  let pickIndex = 0;

  for (let day = 1; day <= totalDays; day++) {
    const wantRest =
      prefs.pace === "Relaxed" && activeCount > 0 && activeCount % 3 === 0;
    if (wantRest && !ranked[pickIndex % ranked.length].flex) {
      sequence.push(restDay(day));
      activeCount = 0;
      continue;
    }
    const pick = ranked[pickIndex % ranked.length];
    pickIndex++;
    const recycled = pickIndex > ranked.length;
    sequence.push(buildDay(pick.t, day, desired, recycled));
    if (!pick.flexible) activeCount++;
  }

  return sequence;
}