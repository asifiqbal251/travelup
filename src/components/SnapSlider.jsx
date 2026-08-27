import { useRef } from "react";

// Accessible discrete snap slider for ordered preference scales (budget,
// climate, pace, activity). Renders the official controlled vocabulary exactly
// as passed — no new values. Stores the selected value string, not an index.
//
// Accessibility: role="slider", full keyboard (arrows / Home / End), aria-valuemin
// /max/now and a human-readable aria-valuetext, visible focus ring. Selection is
// communicated by position, thumb, teal range and a bold label (not color alone).
export default function SnapSlider({
  points,
  value,
  onChange,
  ariaLabel,
  dimmed = false,
  id
}) {
  const count = points.length;
  const index = points.findIndex((p) => p.value === value);
  const hasSel = index >= 0;
  const trackRef = useRef(null);
  const draggingRef = useRef(false);

  const pct = hasSel && count > 1 ? (index / (count - 1)) * 100 : 0;
  const current = hasSel ? points[index] : null;

  const setIndex = (i) => {
    const clamped = Math.max(0, Math.min(count - 1, i));
    onChange(points[clamped].value);
  };

  const onKeyDown = (e) => {
    if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      e.preventDefault();
      setIndex((hasSel ? index : -1) + 1);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      e.preventDefault();
      setIndex((hasSel ? index : 0) - 1);
    } else if (e.key === "Home") {
      e.preventDefault();
      setIndex(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setIndex(count - 1);
    }
  };

  const pickFromClientX = (clientX) => {
    const el = trackRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const ratio = count > 1 ? (clientX - rect.left) / rect.width : 0;
    setIndex(Math.round(Math.max(0, Math.min(1, ratio)) * (count - 1)));
  };

  const onPointerDown = (e) => {
    draggingRef.current = true;
    try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch { /* noop */ }
    pickFromClientX(e.clientX);
  };
  const onPointerMove = (e) => {
    if (draggingRef.current) pickFromClientX(e.clientX);
  };
  const onPointerUp = (e) => {
    draggingRef.current = false;
    try { e.currentTarget.releasePointerCapture?.(e.pointerId); } catch { /* noop */ }
  };

  return (
    <div className={dimmed ? "opacity-50" : ""}>
      {/* Track + thumb (44px touch target) */}
      <div
        ref={trackRef}
        id={id}
        role="slider"
        tabIndex={0}
        aria-label={ariaLabel}
        aria-valuemin={0}
        aria-valuemax={count - 1}
        aria-valuenow={hasSel ? index : undefined}
        aria-valuetext={current ? current.label : "No selection"}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        className="relative h-11 flex items-center cursor-pointer touch-none select-none rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-workflow"
      >
        <div className="absolute left-0 right-0 h-2 rounded-full bg-muted" />
        <div
          className="absolute left-0 h-2 rounded-full bg-teal motion-safe:transition-[width] motion-safe:duration-200"
          style={{ width: `${pct}%` }}
        />
        {hasSel && (
          <div
            className="absolute h-6 w-6 -ml-3 rounded-full bg-ink shadow-md ring-2 ring-on-dark motion-safe:transition-[left] motion-safe:duration-200"
            style={{ left: `${pct}%` }}
          />
        )}
      </div>

      {/* Point labels (clickable, text always visible) */}
      <div className="mt-1 flex justify-between gap-1">
        {points.map((p, i) => {
          const on = hasSel && i === index;
          const IIcon = p.icon;
          return (
            <button
              key={p.value}
              type="button"
              onClick={() => setIndex(i)}
              aria-pressed={on}
              className="flex-1 min-h-11 px-1 py-1 rounded-lg flex flex-col items-center gap-1 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
            >
              {IIcon && (
                <IIcon
                  className={`w-4 h-4 ${on ? "text-teal" : "text-muted-foreground"}`}
                  aria-hidden="true"
                />
              )}
              <span
                className={`text-[11px] sm:text-xs leading-tight ${on ? "font-semibold text-ink" : "font-medium text-muted-foreground"}`}
              >
                {p.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}