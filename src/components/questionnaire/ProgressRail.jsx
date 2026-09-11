// Full-width progress rail beneath the questionnaire header row. Replaces
// the old nine floating dashes (Build A #5, docs/wherenova-fixes brief) --
// a single filled track with nine equal tick dividers overlaid so the
// discrete step count stays readable. The whole rail opens the answer
// review sheet on tap/click, preserving the old dashes' jump-to-question
// affordance (now via the sheet's per-question rows) instead of dropping it.
export default function ProgressRail({ step, total, onOpenSheet }) {
  const pct = total > 0 ? Math.max(0, Math.min(100, (step / total) * 100)) : 0;

  return (
    <button
      type="button"
      onClick={onOpenSheet}
      aria-label="Review your answers"
      role="progressbar"
      aria-valuenow={step}
      aria-valuemin={1}
      aria-valuemax={total}
      className="relative w-full h-1 rounded-full block focus:outline-none focus-visible:ring-2 focus-visible:ring-wn-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-wn-page"
      style={{ background: "#16283E" }}
    >
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-0 rounded-full motion-safe:transition-[width] motion-safe:duration-[450ms] motion-safe:ease-[cubic-bezier(.4,0,.2,1)]"
        style={{ width: `${pct}%`, background: "linear-gradient(90deg,#2C97A6,#5FC9D6)" }}
      />
      <span aria-hidden="true" className="absolute inset-0 flex">
        {Array.from({ length: total }).map((_, i) => (
          <span
            key={i}
            className="flex-1"
            style={i < total - 1 ? { borderRight: "1px solid rgba(10,22,40,.85)" } : undefined}
          />
        ))}
      </span>
    </button>
  );
}
