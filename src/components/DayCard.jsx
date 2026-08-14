import React from "react";

// A single itinerary day card. Collapsed by default; expands to show a
// structured timeline plus compact planning sections. Travel/flexible days
// are visually identified with a left accent but stay consistent in layout.
function Section({ label, value }) {
  if (!value) return null;
  return (
    <div className="flex gap-2">
      <span className="text-xs font-semibold text-[#0B1F3A]/55 w-24 flex-shrink-0">{label}</span>
      <span className="text-sm text-[#0B1F3A]/80 flex-1 min-w-0">{value}</span>
    </div>
  );
}

export default function DayCard({ day, isOpen, badge, onToggle }) {
  const tag = day.isTravel ? " · Travel" : day.flexible ? " · Flexible" : "";
  return (
    <div
      className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${
        day.isTravel
          ? "border-[#2EC4B6]/40 border-l-4 border-l-[#2EC4B6]"
          : day.flexible
          ? "border-[#E8A33D]/40 border-l-4 border-l-[#E8A33D]"
          : "border-[#E6E2D8]"
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-controls={`day-${day.day}-details`}
        className="w-full text-left p-5"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-semibold text-[#2EC4B6] uppercase tracking-wide">
              Day {day.day}{tag}
            </div>
            <h3 className="font-semibold break-words">{day.title}</h3>
            <div className="text-xs text-[#0B1F3A]/60 mt-0.5">{day.location}</div>
          </div>
          <span className={`text-xs font-medium px-2.5 py-1 rounded-full flex-shrink-0 ${badge}`}>
            {day.intensity} intensity
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5 mt-3">
          {(day.highlights || []).map((h, i) => (
            <span
              key={i}
              className="text-xs bg-[#FBFAF7] border border-[#E6E2D8] rounded-full px-2 py-0.5"
            >
              {h}
            </span>
          ))}
        </div>
        <span className="text-sm font-medium text-[#0B1F3A] underline mt-3 inline-block hover:no-underline">
          {isOpen ? "Hide details" : "View details"}
        </span>
      </button>

      {isOpen && (
        <div id={`day-${day.day}-details`} className="px-5 pb-5 border-t border-[#E6E2D8]">
          <ol className="mt-4 space-y-3">
            {(day.timeline || []).map((e, i) => {
              const note = e.source ? day[e.source] : e.note;
              return (
                <li key={i} className="flex gap-3">
                  <div className="w-24 flex-shrink-0">
                    {e.time ? (
                      <>
                        <div className="text-xs font-medium text-[#0B1F3A]">{e.time}</div>
                        <div className="text-[10px] text-[#0B1F3A]/50">{e.duration}</div>
                        <div className="text-[10px] font-semibold text-[#2EC4B6] uppercase mt-0.5">{e.slot}</div>
                      </>
                    ) : (
                      <>
                        <div className="text-xs font-semibold text-[#0B1F3A] leading-tight">{e.slot}</div>
                        {e.duration && <div className="text-[10px] text-[#0B1F3A]/50 mt-0.5">{e.duration}</div>}
                      </>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-[#0B1F3A]">{e.name}</div>
                    <p className="text-sm text-[#0B1F3A]/80 mt-0.5">{note}</p>
                  </div>
                </li>
              );
            })}
          </ol>
          {day.journey && (
            <p className="text-xs text-[#0B1F3A]/60 mt-3 italic">{day.journey}</p>
          )}
          <div className="mt-4 space-y-1.5">
            <Section label="Getting around" value={day.gettingAround} />
            <Section label="Plan ahead" value={day.planAhead} />
            <Section label="Optional swap" value={day.optionalSwap} />
            <Section label="Overnight" value={day.overnight} />
          </div>
        </div>
      )}
    </div>
  );
}