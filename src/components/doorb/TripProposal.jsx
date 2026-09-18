import { AlertCircle, ChevronDown, ChevronUp, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  addDestination, removeDestination, suggestAdditions,
} from "@/lib/tripFit";

export default function TripProposal({
  legs,
  setLegs,
  droppedCount,
  setDroppedCount,
  freeDays,
  setFreeDays,
  orderedDests,
  // totalDays retained for future display use
}) {
  const suggestions = suggestAdditions(orderedDests, legs, freeDays);

  const handleRemove = (destId) => {
    const result = removeDestination(legs, destId, freeDays);
    setLegs(result.legs);
    setDroppedCount(result.droppedCount);
    setFreeDays(result.freeDays);
  };

  const handleAdd = (dest) => {
    const result = addDestination(legs, dest, orderedDests, freeDays);
    setLegs(result.legs);
    setDroppedCount(result.droppedCount);
    setFreeDays(result.freeDays);
  };

  const moveUp = (idx) => {
    if (idx === 0) return;
    const next = [...legs];
    [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
    setLegs(next);
  };

  const moveDown = (idx) => {
    if (idx === legs.length - 1) return;
    const next = [...legs];
    [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
    setLegs(next);
  };

  return (
    <div className="w-full">
      {droppedCount > 0 && (
        <div className="mb-5 rounded-xl bg-wn-amber/10 border border-wn-amber/30 px-4 py-3 flex items-start gap-2.5 text-[13px] text-wn-text-2">
          <AlertCircle className="w-4 h-4 text-wn-amber shrink-0 mt-px" aria-hidden="true" />
          <span>
            <span className="font-semibold text-wn-amber">
              {droppedCount} {droppedCount === 1 ? "destination" : "destinations"} dropped
            </span>
            {" "}— not enough time for them all.
            Add more days or go back and pick fewer destinations.
          </span>
        </div>
      )}

      <p className="text-[12px] text-wn-text-3 text-center mb-6 max-w-[420px] mx-auto leading-relaxed">
        WhereNova suggested this route based on geography.
        Remove stops or reorder before continuing.
      </p>

      <ol className="space-y-2 mb-6">
        {legs.map((leg, idx) => {
          const interests =
            leg.destination.primary_interests?.slice(0, 2).join(" & ") ||
            leg.destination.region ||
            "";
          return (
            <li
              key={leg.destination.id}
              className="flex items-center gap-3 rounded-xl bg-wn-surface ring-1 ring-wn-line px-4 py-3"
            >
              {/* Reorder arrows — ported from LegPlanner.jsx */}
              <div className="flex flex-col gap-0.5">
                <button
                  type="button"
                  onClick={() => moveUp(idx)}
                  disabled={idx === 0}
                  aria-label={`Move ${leg.destination.name} up`}
                  className="h-6 w-6 flex items-center justify-center rounded text-wn-text-3 hover:text-wn-text disabled:opacity-25 focus:outline-none focus-visible:ring-2 focus-visible:ring-wn-cyan"
                >
                  <ChevronUp className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => moveDown(idx)}
                  disabled={idx === legs.length - 1}
                  aria-label={`Move ${leg.destination.name} down`}
                  className="h-6 w-6 flex items-center justify-center rounded text-wn-text-3 hover:text-wn-text disabled:opacity-25 focus:outline-none focus-visible:ring-2 focus-visible:ring-wn-cyan"
                >
                  <ChevronDown className="w-4 h-4" />
                </button>
              </div>

              {/* Leg info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-wn-cyan shrink-0">
                    {idx + 1}.
                  </span>
                  <span className="text-wn-text text-[15px] font-medium truncate">
                    {leg.destination.name}
                  </span>
                </div>
                {interests && (
                  <p className="text-[11px] text-wn-text-3 mt-0.5 truncate">{interests}</p>
                )}
              </div>

              {/* Day count pill — read-only; counts are solver-derived */}
              <span className="shrink-0 px-2.5 py-1 rounded-full bg-wn-surface-2 ring-1 ring-wn-line text-[13px] font-semibold text-wn-text tabular-nums">
                {leg.days}d
              </span>

              {/* Remove button */}
              <button
                type="button"
                onClick={() => handleRemove(leg.destination.id)}
                aria-label={`Remove ${leg.destination.name}`}
                className="shrink-0 h-7 w-7 flex items-center justify-center rounded-lg text-wn-text-3 hover:text-wn-amber hover:bg-wn-amber/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-wn-amber motion-safe:transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </li>
          );
        })}
      </ol>

      {/* Freed-days banner — shown when every kept destination is already at
          its max_days and days remain unused */}
      {freeDays > 0 && (
        <div className="mb-6 rounded-xl bg-wn-surface ring-1 ring-wn-line px-4 py-4">
          <p className="text-[14px] text-wn-text mb-3">
            <span className="font-semibold text-wn-cyan">{freeDays} days freed up.</span>{" "}
            Add another stop, or give more time to the cities you kept.
          </p>
          {suggestions.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {suggestions.map(({ destination, fits }) => (
                <button
                  key={destination.id}
                  type="button"
                  disabled={!fits}
                  onClick={() => handleAdd(destination)}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-[13px] font-medium ring-1 motion-safe:transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-wn-cyan",
                    fits
                      ? "bg-wn-cyan/10 ring-wn-cyan/40 text-wn-cyan hover:bg-wn-cyan/20 cursor-pointer"
                      : "bg-wn-surface-2 ring-wn-line text-wn-text-3 opacity-60 cursor-not-allowed"
                  )}
                >
                  <Plus className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  {destination.name}
                  {!fits && (
                    <span className="text-[11px]">
                      (needs {destination.min_days || 1}d)
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
