import SnapSlider from "@/components/SnapSlider";
import { Compass } from "lucide-react";

// One preference module for Screen 2's 2×2 grid (Budget / Weather / Pace /
// Activity). Heading + integrated "No preference" toggle sit on the same row;
// the selected value is prominent; the snap slider with endpoint labels sits
// below. When "No preference" is active the slider is dimmed and a short note
// explains that the dimension won't constrain recommendations. Stores the
// exact same controlled-vocabulary strings — no new backend values.
export default function PrefModule({
  label, value, onChange, error, points, ariaLabel,
  noPref = false, noPrefLabel = "No preference", noPrefNote
}) {
  const isNoPref = noPref && value === "No preference";
  const index = points.findIndex((p) => p.value === value);
  const current = index >= 0 ? points[index] : null;
  const display = isNoPref ? (noPrefLabel || "No preference") : current ? current.label : "—";
  const Icon = current && !isNoPref ? current.icon : null;

  return (
    <div className="rounded-2xl bg-white/[0.04] ring-1 ring-white/10 p-5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-base font-semibold text-on-dark/80">{label}</span>
        {noPref && (
          <button
            type="button"
            aria-pressed={isNoPref}
            onClick={() => onChange(isNoPref ? "" : "No preference")}
            className={`inline-flex items-center gap-1.5 min-h-9 px-3 rounded-full text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal ${
              isNoPref
                ? "bg-teal text-cinema"
                : "bg-white/5 text-on-dark/70 ring-1 ring-white/10 hover:bg-white/10"
            }`}
          >
            <Compass className="w-3.5 h-3.5" aria-hidden="true" />
            {noPrefLabel || "No preference"}
          </button>
        )}
      </div>

      <div className="mt-3 flex items-center gap-2">
        {Icon && <Icon className="w-5 h-5 text-teal" aria-hidden="true" />}
        <span
          className={`font-display font-bold leading-none ${
            isNoPref || !current ? "text-on-dark/55 text-2xl" : "text-on-dark text-3xl"
          }`}
        >
          {display}
        </span>
      </div>

      <div className="mt-3">
        <SnapSlider
          dark
          points={points}
          value={isNoPref ? "" : value}
          onChange={onChange}
          ariaLabel={ariaLabel || label}
          dimmed={isNoPref}
        />
      </div>

      {isNoPref && noPrefNote && (
        <p className="text-sm text-on-dark/55 mt-2">{noPrefNote}</p>
      )}
      {error && <p className="text-coral text-sm mt-2">{error}</p>}
    </div>
  );
}