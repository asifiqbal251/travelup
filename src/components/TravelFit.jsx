import React from "react";

// One clean responsive Travel Fit summary strip with the locked labels.
// Replaces the previous three-box statistic layout. Only teal/coral/red are
// used for the level badge (no gold). Used by both Results and TripView so the
// active and saved trip pages present the same summary.
const BADGE = {
  Practical: { label: "Good fit", cls: "bg-teal text-cinema" },
  Manageable: { label: "Manageable", cls: "bg-ink text-on-dark" },
  Stretch: { label: "Travel-heavy", cls: "bg-ink/80 text-on-dark" },
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
    <section aria-label="Travel fit" className="rounded-2xl bg-card p-4 mb-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-display text-sm font-bold text-ink">Travel fit</h3>
        <span
          className={`text-xs font-semibold px-2.5 py-1 rounded-full ${badge.cls}`}
          role="status"
          aria-label={`Travel fit: ${badge.label}`}
        >
          {badge.label}
        </span>
      </div>
      <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-6 sm:divide-x sm:divide-border">
        <div className="min-w-0 sm:pr-4">
          <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">How you'll travel</dt>
          <dd className="text-sm font-medium text-ink mt-1 break-words">{mode}</dd>
        </div>
        <div className="sm:px-4">
          <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Travel time</dt>
          <dd className="text-sm font-medium text-ink mt-1">{eachWay}</dd>
        </div>
        <div className="sm:pl-4">
          <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Time at destination</dt>
          <dd className="text-sm font-medium text-ink mt-1">{timeThere}</dd>
        </div>
      </dl>
    </section>
  );
}