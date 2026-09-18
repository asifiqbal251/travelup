import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { QUESTIONS, budgetPositionToDollar, budgetDollarToPosition } from "@/lib/questionnaireFlow";
import { cn } from "@/lib/utils";

const SELECTED_FILL = { background: "linear-gradient(180deg, rgba(63,216,224,.16), rgba(63,216,224,.07))" };

// Pace and interests questions from the main questionnaire
const PACE_Q = QUESTIONS.find((q) => q.id === "pace");
const INTERESTS_Q = QUESTIONS.find((q) => q.id === "interests");
const BUDGET_Q = QUESTIONS.find((q) => q.id === "budget");

export default function RefineSheet({ open, onOpenChange, answers, onApply }) {
  const [local, setLocal] = useState({ ...answers });

  // Sync when the sheet opens with fresh answer state
  useEffect(() => {
    if (open) setLocal({ ...answers });
  }, [open, answers]);

  const setField = (field, value) => setLocal((a) => ({ ...a, [field]: value }));

  const toggleInterest = (key) => {
    setLocal((a) => {
      const arr = a.interests || [];
      const next = arr.includes(key) ? arr.filter((k) => k !== key) : [...arr, key];
      return { ...a, interests: next };
    });
  };

  const onPace = (key) => setField("pace", local.pace === key ? "" : key);

  const apply = () => onApply(local);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="bg-wn-page-2 border-t border-wn-line-2 rounded-t-2xl max-h-[90dvh] overflow-y-auto p-0"
      >
        <SheetHeader className="px-5 pt-5 pb-1">
          <SheetTitle className="font-display font-bold text-[18px] text-wn-text">
            Customize your trip
          </SheetTitle>
          <p className="text-[13px] text-wn-text-3 mt-0.5">
            Optional — leave anything blank and we'll use balanced defaults.
          </p>
        </SheetHeader>

        <div className="px-5 pb-6 space-y-7">
          {/* Daily pace */}
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-wn-cyan mb-3">Daily pace</p>
            <div role="radiogroup" aria-label="Daily pace" className="flex flex-col gap-2">
              {PACE_Q.options.filter((o) => !o.noPref).map((o) => {
                const on = local.pace === o.key;
                return (
                  <button
                    key={o.key}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => onPace(o.key)}
                    style={on ? SELECTED_FILL : undefined}
                    className={cn(
                      "w-full text-left rounded-xl border px-4 py-3 motion-safe:transition focus:outline-none focus-visible:ring-2 focus-visible:ring-wn-cyan",
                      on ? "border-wn-cyan" : "border-wn-line hover:border-wn-line-2"
                    )}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className={cn("text-[14px] font-semibold", on ? "text-wn-cyan" : "text-wn-text")}>
                        {o.label}
                      </span>
                      {on && <Check className="w-4 h-4 text-wn-cyan shrink-0" aria-hidden="true" />}
                    </span>
                    <span className="mt-0.5 block text-[12px] leading-snug text-wn-text-2">
                      {o.description}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Daily budget */}
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-wn-cyan mb-3">Daily budget</p>
            <p className="text-[12px] text-wn-text-3 mb-4">
              USD/day on the ground — hotels, food, transport, activities. Excludes flights.
            </p>
            <BudgetControl
              answers={local}
              onBudget={(val) => setField("budget", val)}
            />
          </div>

          {/* Interests */}
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-wn-cyan mb-3">Interests</p>
            <div role="group" aria-label="Interests" className="flex flex-wrap gap-2">
              {INTERESTS_Q.options.map((o) => {
                const on = (local.interests || []).includes(o.key);
                return (
                  <button
                    key={o.key}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleInterest(o.key)}
                    style={on ? SELECTED_FILL : undefined}
                    className={cn(
                      "inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-[14px] font-medium motion-safe:transition focus:outline-none focus-visible:ring-2 focus-visible:ring-wn-cyan",
                      on
                        ? "border-2 border-wn-cyan text-wn-cyan"
                        : "border border-wn-line bg-wn-surface text-wn-text hover:border-wn-line-2"
                    )}
                  >
                    {o.label}
                    {on && <Check className="w-3.5 h-3.5 text-wn-cyan shrink-0" aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Deferred: save as defaults note */}
          <p className="text-[12px] text-wn-text-3 border-t border-wn-line pt-4">
            These preferences apply to this trip only. Saving them as defaults requires account
            profile support — coming soon.
          </p>

          <button
            type="button"
            onClick={apply}
            className="wn-cta-dark w-full inline-flex items-center justify-center h-12 rounded-xl font-semibold text-[15px] focus:outline-none focus-visible:ring-2 focus-visible:ring-wn-cyan"
          >
            Apply
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

const DEFAULT_BUDGET = 20;

function BudgetControl({ answers, onBudget }) {
  const stops = BUDGET_Q.budgetStops;
  const committed = typeof answers.budget === "number" ? answers.budget : null;
  const noPref = answers.budget === "no-pref";

  const [dollar, setDollar] = useState(() => (committed != null ? committed : DEFAULT_BUDGET));
  const [hasInteracted, setHasInteracted] = useState(committed != null);

  useEffect(() => {
    if (committed != null) {
      setDollar(committed);
      setHasInteracted(true);
    }
  }, [committed]);

  const position = budgetDollarToPosition(dollar);
  const isTop = dollar >= stops[stops.length - 1];

  const handleChange = (e) => {
    const next = budgetPositionToDollar(Number(e.target.value));
    setDollar(next);
    setHasInteracted(true);
    onBudget(next);
  };

  return (
    <div className={cn("mx-auto max-w-[420px] motion-safe:transition-opacity", noPref && "opacity-40")}>
      <div className="text-center">
        {hasInteracted ? (
          <>
            <span className="text-[36px] font-display font-extrabold tracking-[-0.02em] text-wn-text tabular-nums">
              ${dollar}{isTop && "+"}
            </span>
            <span className="ml-1 text-[14px] text-wn-text-2">USD/day</span>
          </>
        ) : (
          <span className="text-[22px] font-display font-semibold text-wn-text-3">
            Choose an amount
          </span>
        )}
      </div>
      <input
        type="range"
        min={0}
        max={1}
        step="any"
        value={position}
        onChange={handleChange}
        aria-label="Daily budget in US dollars, not counting flights"
        className="mt-3 w-full h-2 rounded-full bg-wn-surface-2 accent-wn-cyan cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-wn-cyan"
      />
      <div className="flex justify-between mt-1.5 text-[12px] text-wn-text-3 tabular-nums">
        <span>${stops[0]}</span>
        <span>${stops[stops.length - 1]}+</span>
      </div>
      <div className="text-center mt-3">
        <button
          type="button"
          onClick={() => onBudget("no-pref")}
          className={cn(
            "text-[14px] underline underline-offset-4 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-wn-cyan",
            noPref ? "text-wn-cyan" : "text-wn-text-2 hover:text-wn-text"
          )}
        >
          No preference
        </button>
      </div>
    </div>
  );
}
