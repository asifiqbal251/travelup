import { ArrowRight } from "lucide-react";

const CHIP_CLASS =
  "inline-flex items-center gap-1.5 text-[15px] font-medium bg-wn-surface-2 ring-1 ring-wn-line-2 hover:ring-wn-cyan rounded-lg px-3 py-2.5 min-h-11 text-wn-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wn-cyan";

// Honesty banner for climate mismatch with cross-month / cross-climate nudge
// chips. Trigger and suggestions are computed in scoring.js (climateMismatch +
// suggestAlternatives). Chips apply their single-field change in place via
// onNudge — no full questionnaire re-run.
export default function ClimateMismatchBanner({ mismatch, nudges, onNudge }) {
  if (!mismatch) return null;
  const months = (nudges && nudges.months) || [];
  const climates = (nudges && nudges.climates) || [];
  return (
    <div className="rounded-2xl bg-wn-surface ring-1 ring-wn-line p-4 mb-6">
      <p className="text-[15px] font-medium text-wn-text">
        No destinations matched your &lsquo;{mismatch.preference}&rsquo; preference for {mismatch.monthName} —
        showing best overall matches instead.
      </p>
      {(months.length > 0 || climates.length > 0) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {months.map((m) => (
            <button
              key={`month-${m.month}`}
              type="button"
              className={CHIP_CLASS}
              onClick={() => onNudge({ travelMonth: String(m.month) })}
            >
              Try {m.monthName} instead{" "}
              <span className="text-wn-text-3 text-[13px]">({m.count})</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          ))}
          {climates.map((c) => (
            <button
              key={`climate-${c.climate}`}
              type="button"
              className={CHIP_CLASS}
              onClick={() => onNudge({ climate: [c.climate] })}
            >
              For {mismatch.monthName}, try &lsquo;{c.climate}&rsquo;{" "}
              <span className="text-wn-text-3 text-[13px]">({c.count})</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
