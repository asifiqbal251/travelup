import React from "react";
import {
  PlaneTakeoff, PlaneLanding, Plane, Home as HomeIcon, CornerUpLeft,
  LogOut, Car, Bed, UtensilsCrossed, Footprints, ChevronDown
} from "lucide-react";

// Resolve a recognisable Lucide icon for a timeline event from its slot/name
// text, with a neutral walking/activity fallback. Decoration stays neutral
// navy/slate — no teal or coral.
function eventIcon(e) {
  const t = `${e.slot || ""} ${e.name || ""}`.toLowerCase();
  if (/\bdepart/.test(t)) return PlaneTakeoff;
  if (/\barrive home|\breturn home/.test(t)) return HomeIcon;
  if (/\breturn begins/.test(t)) return CornerUpLeft;
  if (/\bcheck-out|\bcheck out/.test(t)) return LogOut;
  if (/\barrival|\barrive\b/.test(t)) return PlaneLanding;
  if (/\bcontinue transit|long-haul|overnight in transit/.test(t)) return Plane;
  if (/\bin transit|connection|change planes/.test(t)) return Plane;
  if (/\btransfer|onward|head to/.test(t)) return Car;
  if (/\brest|recovery|recover|settle|sleep|adjust|orientation/.test(t)) return Bed;
  if (/\blunch|bite|dinner|breakfast|meal|café|cafe|eat|food/.test(t)) return UtensilsCrossed;
  return Footprints;
}

// Typographic divider (not a boxed table row) for the day's supplementary info.
function DetailLine({ label, value }) {
  if (!value) return null;
  return (
    <div className="flex gap-3">
      <span className="text-xs font-semibold text-wn-text-2-l w-28 flex-shrink-0 uppercase tracking-wide">{label}</span>
      <span className="text-sm text-wn-text-l/80 flex-1 min-w-0">{value}</span>
    </div>
  );
}

// One itinerary day as part of a connected editorial timeline. Collapsed days
// are flat (no card); the open day gets a brighter, slightly elevated surface.
// Travel/flexible status is conveyed by the label text, not a coloured border.
// Exact day order, labels, travel-day content and activity-level logic are
// preserved; aria-expanded/aria-controls/keyboard activation are retained.
export default function DayCard({ day, isOpen, badge, onToggle }) {
  const tag = day.isTravel ? " · Travel" : day.flexible ? " · Flexible" : "";
  return (
    <div
      className={`rounded-2xl motion-safe:transition-colors motion-safe:duration-200 ${
        isOpen ? "bg-wn-surface-l shadow-sm ring-1 ring-wn-line-l" : "bg-transparent"
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-controls={`day-${day.day}-details`}
        className="w-full text-left p-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wn-cyan rounded-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-semibold text-wn-text-2-l uppercase tracking-wide">
              Day {day.day}{tag}
            </div>
            <h3 className="font-display font-semibold text-wn-text-l break-words">{day.title}</h3>
            <div className="text-xs text-wn-text-2-l mt-0.5">{day.location}</div>
          </div>
          <span className={`text-xs font-medium px-2.5 py-1 rounded-full flex-shrink-0 ${badge}`}>
            {day.intensity} intensity
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5 mt-3">
          {(day.highlights || []).map((h, i) => (
            <span
              key={i}
              className="text-xs bg-wn-surface-2-l text-wn-text-2-l rounded-full px-2 py-0.5"
            >
              {h}
            </span>
          ))}
        </div>
        <span className="inline-flex items-center gap-1 text-sm font-medium text-wn-text-l mt-3">
          {isOpen ? "Hide details" : "View details"}
          <ChevronDown className={`w-4 h-4 motion-safe:transition-transform motion-safe:duration-200 ${isOpen ? "rotate-180" : ""}`} />
        </span>
      </button>

      {isOpen && (
        <div id={`day-${day.day}-details`} className="px-5 pb-5">
          <ol className="relative mt-3">
            <span className="absolute left-3 top-1 bottom-1 w-px bg-wn-line-l" aria-hidden="true" />
            {(day.timeline || []).map((e, i) => {
              const Icon = eventIcon(e);
              const note = e.source ? day[e.source] : e.note;
              return (
                <li key={i} className="relative flex gap-3 pb-5 last:pb-0">
                  <span
                    className="relative z-10 flex-shrink-0 w-6 h-6 rounded-full bg-wn-surface-l ring-1 ring-wn-line-l flex items-center justify-center text-wn-text-l"
                    aria-hidden="true"
                  >
                    <Icon className="w-3 h-3" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex gap-3">
                      <div className="w-24 flex-shrink-0">
                        {e.time ? (
                          <>
                            <div className="text-xs font-medium text-wn-text-l">{e.time}</div>
                            <div className="text-[10px] text-wn-text-2-l">{e.duration}</div>
                            <div className="text-[10px] font-semibold text-wn-text-2-l uppercase mt-0.5">{e.slot}</div>
                          </>
                        ) : (
                          <>
                            <div className="text-xs font-semibold text-wn-text-l leading-tight">{e.slot}</div>
                            {e.duration && <div className="text-[10px] text-wn-text-2-l mt-0.5">{e.duration}</div>}
                          </>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-wn-text-l">{e.name}</div>
                        {note && <p className="text-sm text-wn-text-l/75 mt-0.5">{note}</p>}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
          {day.journey && (
            <p className="text-xs text-wn-text-2-l mt-3 italic">{day.journey}</p>
          )}
          <div className="mt-5 space-y-3">
            <DetailLine label="Getting around" value={day.gettingAround} />
            <DetailLine label="Plan ahead" value={day.planAhead} />
            <DetailLine label="Optional swap" value={day.optionalSwap} />
            <DetailLine label="Overnight" value={day.overnight} />
          </div>
        </div>
      )}
    </div>
  );
}