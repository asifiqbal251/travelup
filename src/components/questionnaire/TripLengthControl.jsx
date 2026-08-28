import { Slider } from "@/components/ui/slider";

// Redesigned trip-length control. The selected duration is the dominant visual
// element (large display number), with a clean teal-active / neutral-inactive
// track and 3–14 day endpoints. Same 3–14 day data behaviour and the same
// accessible Radix Slider (arrow / Home / End keys, aria-valuenow, focus ring).
// No helper prose — the control explains itself.
export default function TripLengthControl({ value, onChange, error, ariaLabel = "Total trip length in days" }) {
  const days = Number(value) || 0;
  return (
    <div>
      <div className="flex items-end justify-between gap-3">
        <span className="text-base font-semibold text-on-dark/80">Trip length</span>
        <span className="font-display font-bold text-on-dark text-4xl sm:text-5xl leading-none tabular-nums">
          {days}
          <span className="text-lg sm:text-xl font-semibold text-on-dark/70 ml-1.5">days</span>
        </span>
      </div>
      <div className="mt-3">
        <Slider
          dark
          value={[days]}
          min={3}
          max={14}
          step={1}
          onValueChange={(v) => onChange(v[0])}
          aria-label={ariaLabel}
        />
      </div>
      <div className="flex justify-between text-sm text-on-dark/55 mt-1.5 font-medium">
        <span>3 days</span>
        <span>14 days</span>
      </div>
      {error && <p className="text-coral text-sm mt-2">{error}</p>}
    </div>
  );
}