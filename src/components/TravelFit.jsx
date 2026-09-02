import React from "react";
import { normalizeMode, roundedTravelHours } from "@/lib/travelMode";

// One clean responsive Travel Fit summary strip with the locked labels.
// Replaces the previous three-box statistic layout. Used on the (light) Trip
// page, below the dark hero, so it reads from the light wn-*-l tokens.
const BADGE = {
  Practical: { label: "Good fit", cls: "bg-wn-cyan/15 text-wn-cyan-2" },
  Manageable: { label: "Manageable", cls: "bg-wn-text-l text-white" },
  Stretch: { label: "Travel-heavy", cls: "bg-wn-text-l/80 text-white" },
  "Poor practical fit": { label: "Poor fit", cls: "bg-destructive text-destructive-foreground" }
};

export default function TravelFit({ prac, prefs, notes }) {
  if (!prac) return null;
  const badge = BADGE[prac.level] || BADGE.Practical;
  const rounded = roundedTravelHours(prac.oneWayHours);
  const mode = normalizeMode(prac.travelMode);
  const eachWay = `About ${rounded} hour${rounded === 1 ? "" : "s"} each way`;
  const timeThere = `About ${prac.usableDestinationDays} day${prac.usableDestinationDays === 1 ? "" : "s"}`;

  // Transportation guidance rows, integrated into the same "getting there"
  // card rather than as a separate isolated section. Each hides independently
  // when its field is empty (intercityNote is empty for island/single-city
  // destinations by design).
  const transportRows = [
    notes && notes.airportTransferNote && ["From the airport", notes.airportTransferNote],
    notes && notes.localTransportNote && ["Getting around", notes.localTransportNote],
    notes && notes.intercityNote && ["Between cities", notes.intercityNote]
  ].filter(Boolean);

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
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-6">
        <div className="min-w-0 sm:col-span-2">
          <dt className="text-[11px] uppercase tracking-wide text-wn-text-2-l">How you'll travel</dt>
          <dd className="text-[15px] font-medium text-wn-text-l mt-1">{mode}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-[11px] uppercase tracking-wide text-wn-text-2-l">Travel time</dt>
          <dd className="text-[15px] font-medium text-wn-text-l mt-1">{eachWay}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-[11px] uppercase tracking-wide text-wn-text-2-l">Time at destination</dt>
          <dd className="text-[15px] font-medium text-wn-text-l mt-1">{timeThere}</dd>
        </div>
      </dl>

      {transportRows.length > 0 && (
        <div className="mt-4 pt-4 border-t border-wn-line-l space-y-2.5">
          {transportRows.map(([label, text]) => (
            <p key={label} className="text-sm leading-relaxed text-wn-text-l/80">
              <span className="font-medium text-wn-text-l">{label}: </span>
              {text}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}
