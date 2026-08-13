// Deterministic itinerary generation from curated destination day templates.
// Each destination's day_templates are authored in a geographically sensible
// order. The generator takes the first N templates for the requested trip
// length — no cycling, no repetition, no "(continued)" days. Daily intensity
// reflects the actual authored activity, nudged by the user's pace/activity.
import { ACTIVITY_ORDER } from "@/lib/options";

const INT_ORDER = ["Light", "Moderate", "High"];

function applyPaceShift(intensity, shift) {
  const i = INT_ORDER.indexOf(intensity);
  if (i < 0 || shift === 0) return intensity;
  const ni = Math.max(0, Math.min(INT_ORDER.length - 1, i + shift));
  return INT_ORDER[ni];
}

export function generateItinerary(dest, prefs) {
  const totalDays = Math.min(Math.max(prefs.travelDays || 7, 1), 14);
  const templates = (dest.day_templates || []).slice();
  if (!templates.length) return [];

  // Combine pace and activity into a single clamped shift so each day keeps its
  // own authored intensity (actual activity) rather than one uniform label.
  let shift = 0;
  if (prefs.pace === "Relaxed") shift -= 1;
  else if (prefs.pace === "Fast-paced") shift += 1;
  const ai = ACTIVITY_ORDER.indexOf(prefs.activity);
  if (ai === 0) shift -= 1;          // Light activity
  else if (ai >= 2) shift += 1;      // Active / Highly active
  shift = Math.max(-1, Math.min(1, shift));

  const sequence = [];
  for (let i = 0; i < totalDays && i < templates.length; i++) {
    const t = templates[i];
    const intensity = applyPaceShift(t.intensity || "Moderate", shift);
    sequence.push({
      day: i + 1,
      title: t.title,
      morning: t.morning,
      afternoon: t.afternoon,
      evening: t.evening,
      food_note: t.food_note || "",
      intensity,
      flexible: !!t.flexible
    });
  }
  return sequence;
}