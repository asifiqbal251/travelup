import React from "react";

// Compact, structured travel-fit summary for result cards.
// Replaces the previous paragraph block. No "Likely/Estimated/Approximately"
// wording; durations use the "~" shorthand. Badge relabels the practicality
// level. Does not change any underlying calculation.
const BADGE = {
  Practical: { label: "Good fit", cls: "bg-[#2EC4B6] text-white" },
  Manageable: { label: "Manageable", cls: "bg-[#0B1F3A] text-white" },
  Stretch: { label: "Travel-heavy", cls: "bg-[#E8A33D] text-white" },
  "Poor practical fit": { label: "Poor fit", cls: "bg-[#FF6B5B] text-white" }
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
  const badge = BADGE[prac.level] || BADGE.Practical;
  const mode = normalizeMode(prac.travelMode);
  const eachWay = `About ${prac.oneWayHours} hour${prac.oneWayHours === 1 ? "" : "s"} each way`;
  const timeThere = `About ${prac.usableDestinationDays} day${prac.usableDestinationDays === 1 ? "" : "s"}`;

  return (
    <section
      aria-label="Travel fit"
      className="bg-[#FBFAF7] border border-[#E6E2D8] rounded-lg p-3 mb-4"
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-[#0B1F3A]">Travel fit</h3>
        <span
          className={`text-xs font-semibold px-2.5 py-1 rounded-full ${badge.cls}`}
          role="status"
          aria-label={`Travel fit: ${badge.label}`}
        >
          {badge.label}
        </span>
      </div>
      <dl className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <div className="col-span-2 sm:col-span-1 bg-white rounded-md border border-[#E6E2D8] px-3 py-2 min-w-0">
          <dt className="text-[10px] uppercase tracking-wide text-[#0B1F3A]/50">How you'll travel</dt>
          <dd className="text-sm font-medium text-[#0B1F3A] mt-0.5 break-words">{mode}</dd>
        </div>
        <div className="bg-white rounded-md border border-[#E6E2D8] px-3 py-2">
          <dt className="text-[10px] uppercase tracking-wide text-[#0B1F3A]/50">Travel time</dt>
          <dd className="text-sm font-medium text-[#0B1F3A] mt-0.5">{eachWay}</dd>
        </div>
        <div className="bg-white rounded-md border border-[#E6E2D8] px-3 py-2">
          <dt className="text-[10px] uppercase tracking-wide text-[#0B1F3A]/50">Time at destination</dt>
          <dd className="text-sm font-medium text-[#0B1F3A] mt-0.5">{timeThere}</dd>
        </div>
      </dl>
    </section>
  );
}