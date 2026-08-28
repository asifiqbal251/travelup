import { cn } from "@/lib/utils";

// 9 thin dashes — one per question. On desktop each answered dash is a button
// that jumps to that question; the current dash carries a soft glow. On mobile
// the dashes are too small to tap, so the whole rail opens a review sheet.
export default function ProgressRail({ currentSet, answered, desktop, onJump, onOpenSheet }) {
  const dashes = Array.from({ length: 9 });
  const dash = (i) => {
    const cur = currentSet.includes(i);
    const on = answered[i];
    return cn(
      "h-[3px] w-[22px] rounded-full",
      cur
        ? "bg-wn-cyan shadow-[0_0_10px_0_rgba(63,216,224,0.7)]"
        : on
        ? "bg-wn-cyan"
        : "bg-wn-line"
    );
  };

  if (desktop) {
    return (
      <div
        className="mx-auto flex w-full max-w-3xl items-center gap-2"
        role="group"
        aria-label="Question progress"
      >
        {dashes.map((_, i) => {
          const on = answered[i];
          const cur = currentSet.includes(i);
          return (
            <button
              key={i}
              type="button"
              disabled={!on}
              aria-label={`Question ${i + 1}${on ? ", answered" : ""}${cur ? ", current" : ""}`}
              onClick={() => on && onJump(i)}
              className={cn(
                "h-[3px] w-[22px] rounded-full motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wn-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-wn-page",
                cur
                  ? "bg-wn-cyan shadow-[0_0_10px_0_rgba(63,216,224,0.7)]"
                  : on
                  ? "bg-wn-cyan"
                  : "bg-wn-line cursor-default"
              )}
            />
          );
        })}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpenSheet}
      aria-label="Review your answers"
      className="mx-auto flex w-full max-w-3xl items-center gap-2 py-1 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wn-cyan"
    >
      {dashes.map((_, i) => (
        <span key={i} className={dash(i)} />
      ))}
    </button>
  );
}