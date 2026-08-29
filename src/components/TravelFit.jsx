import React from "react";

// One clean responsive Travel Fit summary strip with the locked labels.
// Replaces the previous three-box statistic layout. Used on the (light) Trip
// page, below the dark hero, so it reads from the light wn-*-l tokens.
const BADGE = {
  Practical: { label: "Good fit", cls: "bg-wn-cyan/15 text-wn-cyan-2" },
  Manageable: { label: "Manageable", cls: "bg-wn-text-l text-white" },
  Stretch: { label: "Travel-heavy", cls: "bg-wn-text-l/80 text-white" },
  "Poor practical fit": { label: "Poor fit", cls: "bg-destructive text-destructive-foreground" }
};

function normalizeMode(mode) {
  if (!mode) return "Local transport";
  let m = String(mode)
    .replace(/local ground transportation/gi, "local transport")
    .replace(/ground transportation/gi, "local transport")
    .replace(/ground transfer/gi, "transfer");
  return m;
}

export default function TravelFit({ prac, prefs }) {
  if (!prac) return null;
  const badge = BADGE[prac.level] || BADGE.Practical;
  const mode = prac.isOverride ? prac.travelMode : normalizeMode(prac.travelMode);
  const eachWay = `About ${prac.oneWayHours} hour${prac.oneWayHours === 1 ? "" : "s"} each way`;
  const timeThere = `About ${prac.usableDestinationDays} day${prac.usableDestinationDays === 1 ? "" : "s"}`;

  return (
    <section aria-label="Travel fit" className="rounded-2xl bg-wn-surface-l p-4 mb-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-display text-sm font-bold text-wn-text-l">Travel fit</h3>
        <span
          className={`text-xs font-semibold px-2.5 py-1 rounded-full ${badge.cls}`}
          role="status"
          aria-label={`Travel fit: ${badge.label}`}
        >
          {badge.label}
        </span>
      </div>
      <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-6 sm:divide-x sm:divide-wn-line-l">
        <div className="min-w-0 sm:pr-4">
          <dt className="text-[11px] uppercase tracking-wide text-wn-text-2-l">How you'll travel</dt>
          <dd className="text-[15px] font-medium text-wn-text-l mt-1 break-words">{mode}</dd>
        </div>
        <div className="sm:px-4">
          <dt className="text-[11px] uppercase tracking-wide text-wn-text-2-l">Travel time</dt>
          <dd className="text-[15px] font-medium text-wn-text-l mt-1">{eachWay}</dd>
        </div>
        <div className="sm:pl-4">
          <dt className="text-[11px] uppercase tracking-wide text-wn-text-2-l">Time at destination</dt>
          <dd className="text-[15px] font-medium text-wn-text-l mt-1">{timeThere}</dd>
        </div>
      </dl>
    </section>
  );
}
