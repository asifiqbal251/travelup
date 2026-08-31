import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const DAYS = Array.from({ length: 12 }, (_, i) => i + 3); // 3..14

function useReducedMotion() {
  const [r, setR] = useState(() =>
    typeof window !== "undefined" && window.matchMedia
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false
  );
  useEffect(() => {
    if (!window.matchMedia) return;
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setR(mql.matches);
    mql.addEventListener("change", onChange);
    setR(mql.matches);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  return r;
}

// Horizontal snap-scroller of day counts 3–14. Selecting a number scrolls it
// to the horizontal centre; a 420ms pause before advancing is scheduled by the
// parent. Arrow keys move the selection and keep focus on the scroller.
export default function DayScroller({ value, onSelect }) {
  const scrollRef = useRef(null);
  const itemRefs = useRef({});
  const reduced = useReducedMotion();
  // Component-local only — never persisted. While the value is still the
  // untouched BLANK_ANSWERS.travelDays default (7), the readout shows
  // "7 days — suggested"; the moment the user interacts (even landing back
  // on 7) the suffix drops. Resets on remount (e.g. navigating back to Q2),
  // which is acceptable per the spec — no schema change.
  const [touched, setTouched] = useState(false);

  const center = (n) => {
    const el = itemRefs.current[n];
    const c = scrollRef.current;
    if (!el || !c) return;
    const left = el.offsetLeft - c.clientWidth / 2 + el.clientWidth / 2;
    c.scrollTo({ left, behavior: reduced ? "auto" : "smooth" });
  };

  useEffect(() => {
    center(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const pick = (n) => {
    setTouched(true);
    onSelect(n);
    requestAnimationFrame(() => center(n));
  };

  const onKeyDown = (e) => {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      pick(Math.min(14, value + 1));
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      pick(Math.max(3, value - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      setTouched(true);
      onSelect(value);
    }
  };

  return (
    <div className="flex flex-col items-center w-full">
      <div
        ref={scrollRef}
        role="radiogroup"
        aria-label="Trip length in days"
        tabIndex={0}
        onKeyDown={onKeyDown}
        className="no-scrollbar flex items-center gap-1 overflow-x-auto py-3 w-full snap-x snap-mandatory rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-wn-cyan"
      >
        {DAYS.map((n) => {
          const on = value === n;
          return (
            <button
              key={n}
              ref={(el) => { itemRefs.current[n] = el; }}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={`${n} days`}
              onClick={() => pick(n)}
              className={cn(
                "snap-center shrink-0 w-[72px] h-[72px] rounded-full flex items-center justify-center motion-safe:transition-all",
                on
                  ? "text-[46px] text-wn-cyan opacity-100"
                  : "text-[22px] text-wn-text-3 opacity-50 hover:opacity-80"
              )}
            >
              {n}
            </button>
          );
        })}
      </div>
      <div className="mt-1 text-[15px] text-wn-text-2 tabular-nums">
        {value} days{touched ? "" : <span className="text-wn-text-3"> — suggested</span>}
      </div>
      <div className="flex justify-between w-full px-2 mt-2 text-sm text-wn-text-3">
        <span>3 days</span>
        <span>14 days</span>
      </div>
    </div>
  );
}