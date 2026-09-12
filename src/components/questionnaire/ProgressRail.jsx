// Build B #6: Nine discrete segment bars instead of one filled track with
// invisible 1px tick dividers. Segments before the current step are filled
// with the cyan gradient (completed), the current step is solid cyan with a
// soft halo, and upcoming steps are #17293F. The global prefers-reduced-
// motion guard in index.css collapses transitions to near-instant.
export default function ProgressRail({ step, total, onOpenSheet }) {
  return (
    <button
      type="button"
      onClick={onOpenSheet}
      aria-label="Review your answers"
      role="progressbar"
      aria-valuenow={step}
      aria-valuemin={1}
      aria-valuemax={total}
      className="w-full flex gap-[5px] focus:outline-none focus-visible:ring-2 focus-visible:ring-wn-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-wn-page"
    >
      {Array.from({ length: total }).map((_, i) => {
        const segStep = i + 1;
        const isComplete = segStep < step;
        const isCurrent = segStep === step;
        return (
          <span
            key={i}
            aria-hidden="true"
            className="flex-1 rounded-full motion-safe:transition-[background] motion-safe:duration-[300ms]"
            style={{
              height: 4,
              background: isComplete
                ? "linear-gradient(90deg, #2C97A6, #5FC9D6)"
                : isCurrent
                ? "rgb(var(--wn-cyan))"
                : "#17293F",
              boxShadow: isCurrent ? "0 0 0 2px rgba(63,216,224,.18)" : undefined
            }}
          />
        );
      })}
    </button>
  );
}
