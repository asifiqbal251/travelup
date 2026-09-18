import { useState, useCallback } from "react";
import { ChevronUp, ChevronDown, Plus, Minus, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

// Redistribute `newTotal` days proportionally across legs, floored at each
// leg's min_days. Returns { legs, canFit } — canFit is false when newTotal
// is less than the sum of all min_days floors.
function redistributeDays(legs, newTotal) {
  const minDays = legs.map((l) => l.destination.min_days || 1);
  const sumMin = minDays.reduce((s, m) => s + m, 0);

  if (newTotal < sumMin) {
    return { legs, canFit: false };
  }

  const totalWeight = sumMin || legs.length; // fallback if all min_days are 0
  let assigned = minDays.map((m) =>
    Math.max(m, Math.floor(newTotal * m / totalWeight))
  );

  // Fix rounding drift
  let diff = newTotal - assigned.reduce((s, d) => s + d, 0);
  let pass = 0;
  while (diff > 0 && pass < assigned.length * 2) {
    assigned[pass % assigned.length]++;
    diff--;
    pass++;
  }
  while (diff < 0 && pass < assigned.length * 4) {
    const i = pass % assigned.length;
    if (assigned[i] > minDays[i]) { assigned[i]--; diff++; }
    pass++;
  }

  return {
    legs: legs.map((l, i) => ({ ...l, days: assigned[i] })),
    canFit: true,
  };
}

export default function LegPlanner({ legs, setLegs }) {
  const [totalInput, setTotalInput] = useState(
    () => String(legs.reduce((s, l) => s + l.days, 0))
  );
  const [cantFit, setCantFit] = useState(false);

  const currentTotal = legs.reduce((s, l) => s + l.days, 0);
  const sumMin = legs.reduce((s, l) => s + (l.destination.min_days || 1), 0);

  const applyTotal = useCallback((raw) => {
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n) || n < 1) return;
    const { legs: newLegs, canFit } = redistributeDays(legs, n);
    setCantFit(!canFit);
    if (canFit) setLegs(newLegs);
  }, [legs, setLegs]);

  const adjustLegDays = (idx, delta) => {
    const next = [...legs];
    const newDays = Math.max(next[idx].destination.min_days || 1, next[idx].days + delta);
    next[idx] = { ...next[idx], days: newDays };
    setLegs(next);
    setTotalInput(String(next.reduce((s, l) => s + l.days, 0)));
    setCantFit(false);
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
      <p className="text-[12px] text-wn-text-3 text-center mb-6 max-w-[420px] mx-auto leading-relaxed">
        WhereNova suggested this order and day split based on geography.
        Reorder or adjust days before building.
      </p>

      {/* Leg list */}
      <ol className="space-y-2 mb-6">
        {legs.map((leg, idx) => (
          <li
            key={leg.destination.id}
            className="flex items-center gap-3 rounded-xl bg-wn-surface ring-1 ring-wn-line px-4 py-3"
          >
            {/* Reorder arrows */}
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

            {/* Leg number + name */}
            <div className="flex-1 min-w-0">
              <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-wn-cyan mr-1.5">
                {idx + 1}.
              </span>
              <span className="text-wn-text text-[15px] font-medium">{leg.destination.name}</span>
              {leg.destination.country && (
                <span className="ml-1.5 text-wn-text-3 text-[12px]">{leg.destination.country}</span>
              )}
              {leg.destination.min_days && (
                <p className="text-[11px] text-wn-text-3 mt-0.5">
                  min. {leg.destination.min_days}d recommended
                </p>
              )}
            </div>

            {/* Day-count stepper */}
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => adjustLegDays(idx, -1)}
                disabled={leg.days <= (leg.destination.min_days || 1)}
                aria-label={`Fewer days for ${leg.destination.name}`}
                className="h-8 w-8 rounded-lg bg-wn-surface-2 ring-1 ring-wn-line flex items-center justify-center text-wn-text-2 hover:text-wn-text hover:ring-wn-line-2 disabled:opacity-30 focus:outline-none focus-visible:ring-2 focus-visible:ring-wn-cyan"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <span className="w-10 text-center text-[15px] font-semibold text-wn-text tabular-nums">
                {leg.days}d
              </span>
              <button
                type="button"
                onClick={() => adjustLegDays(idx, +1)}
                aria-label={`More days for ${leg.destination.name}`}
                className="h-8 w-8 rounded-lg bg-wn-surface-2 ring-1 ring-wn-line flex items-center justify-center text-wn-text-2 hover:text-wn-text hover:ring-wn-line-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-wn-cyan"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </li>
        ))}
      </ol>

      {/* Running total + total-days input */}
      <div className="rounded-xl bg-wn-surface/60 ring-1 ring-wn-line-2 px-4 py-3 flex items-center gap-4">
        <div className="flex-1 min-w-0">
          <p className="text-[12px] text-wn-text-3 mb-0.5">Total trip length</p>
          <p className="text-[22px] font-bold text-wn-text tabular-nums leading-none">
            {currentTotal} days
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[11px] text-wn-text-3 mb-1">Change total:</p>
          <input
            type="number"
            min={sumMin}
            value={totalInput}
            onChange={(e) => setTotalInput(e.target.value)}
            onBlur={() => applyTotal(totalInput)}
            onKeyDown={(e) => { if (e.key === "Enter") applyTotal(totalInput); }}
            aria-label="Total trip days"
            className={cn(
              "w-20 h-9 px-3 rounded-lg text-center text-[15px] font-semibold bg-wn-surface border focus:outline-none focus:ring-2 focus:ring-wn-cyan text-wn-text",
              cantFit ? "border-wn-amber" : "border-wn-line"
            )}
          />
        </div>
      </div>

      {cantFit && (
        <div className="mt-3 flex items-center gap-2 rounded-xl bg-wn-amber/10 border border-wn-amber/30 px-4 py-3 text-[13px] text-wn-text-2">
          <AlertCircle className="w-4 h-4 text-wn-amber shrink-0" aria-hidden="true" />
          That's fewer days than all legs need (minimum {sumMin}d). Adjust individual legs or increase the total.
        </div>
      )}
    </div>
  );
}
