import React from "react";

// A single itinerary day rendered as a clear visual timeline when expanded.
// Collapsed summary shows day number, title, location and intensity. Travel days
// use a teal left accent; flexible days use an ink accent (no gold). Exact day
// order, labels, travel-day content and activity-level logic are preserved.
function Section({ label, value }) {
  if (!value) return null;
  return (
    <div className="flex gap-2 py-2 border-t border-border">
      <span className="text-xs font-semibold text-muted-foreground w-24 flex-shrink-0">{label}</span>
      <span className="text-sm text-ink/80 flex-1 min-w-0">{value}</span>
    </div>
  );
}

export default function DayCard({ day, isOpen, badge, onToggle }) {
  const tag = day.isTravel ? " · Travel" : day.flexible ? " · Flexible" : "";
  return (
    <div
      className={`rounded-2xl bg-card overflow-hidden shadow-sm border-l-4 ${
        day.isTravel ? "border-l-teal" : day.flexible ? "border-l-ink" : "border-l-transparent"
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-controls={`day-${day.day}-details`}
        className="w-full text-left p-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal rounded-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-semibold text-teal uppercase tracking-wide">
              Day {day.day}{tag}
            </div>
            <h3 className="font-display font-semibold text-ink break-words">{day.title}</h3>
            <div className="text-xs text-muted-foreground mt-0.5">{day.location}</div>
          </div>
          <span className={`text-xs font-medium px-2.5 py-1 rounded-full flex-shrink-0 ${badge}`}>
            {day.intensity} intensity
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5 mt-3">
          {(day.highlights || []).map((h, i) => (
            <span
              key={i}
              className="text-xs bg-muted text-muted-foreground rounded-full px-2 py-0.5"
            >
              {h}
            </span>
          ))}
        </div>
        <span className="text-sm font-medium text-ink mt-3 inline-block">
          {isOpen ? "Hide details" : "View details"}
        </span>
      </button>

      {isOpen && (
        <div id={`day-${day.day}-details`} className="px-5 pb-5">
          <ol className="relative mt-2 pl-6">
            <span className="absolute left-[5px] top-1.5 bottom-1.5 w-px bg-border" aria-hidden="true" />
            {(day.timeline || []).map((e, i) => {
              const note = e.source ? day[e.source] : e.note;
              return (
                <li key={i} className="relative pb-4 last:pb-0">
                  <span className="absolute -left-[22px] top-1 w-3 h-3 rounded-full bg-teal ring-4 ring-card" aria-hidden="true" />
                  <div className="flex gap-3">
                    <div className="w-24 flex-shrink-0">
                      {e.time ? (
                        <>
                          <div className="text-xs font-medium text-ink">{e.time}</div>
                          <div className="text-[10px] text-muted-foreground">{e.duration}</div>
                          <div className="text-[10px] font-semibold text-teal uppercase mt-0.5">{e.slot}</div>
                        </>
                      ) : (
                        <>
                          <div className="text-xs font-semibold text-ink leading-tight">{e.slot}</div>
                          {e.duration && <div className="text-[10px] text-muted-foreground mt-0.5">{e.duration}</div>}
                        </>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-ink">{e.name}</div>
                      <p className="text-sm text-ink/80 mt-0.5">{note}</p>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
          {day.journey && (
            <p className="text-xs text-muted-foreground mt-3 italic">{day.journey}</p>
          )}
          <div className="mt-4">
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