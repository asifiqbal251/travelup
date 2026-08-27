import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

// Generic horizontal rail: labelled section, CSS scroll-snap scroller, desktop
// Previous/Next arrows that scroll ~one card, native touch swipe on mobile.
// The first item is passed as `featured` to renderItem so the rail can give it a
// slightly larger card for editorial hierarchy. Arrows are disabled (not
// hidden) when no further scroll is possible. Reduced motion disables smooth
// scrolling. Horizontal overflow is contained inside the scroller only.
export default function DestinationRail({ title, id, items, renderItem, getKey }) {
  const scrollerRef = useRef(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onMq = (e) => setReduced(e.matches);
    mq.addEventListener("change", onMq);
    return () => mq.removeEventListener("change", onMq);
  }, []);

  const update = () => {
    const el = scrollerRef.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 4);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  };

  useEffect(() => {
    update();
  }, [items]);

  const scrollByCard = (dir) => {
    const el = scrollerRef.current;
    if (!el) return;
    const first = el.querySelector("[data-card]");
    const cardW = first ? first.offsetWidth + 16 : Math.round(el.clientWidth * 0.8);
    el.scrollBy({ left: dir * cardW, behavior: reduced ? "auto" : "smooth" });
  };

  const keyFn = getKey || ((item, i) => i);

  return (
    <section aria-labelledby={id} className="mb-12">
      <div className="max-w-5xl mx-auto px-4 mb-4">
        <h2 id={id} className="font-display text-xl sm:text-2xl font-bold tracking-tight text-on-dark">
          {title}
        </h2>
      </div>
      <div className="max-w-5xl mx-auto px-4 mb-3 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => scrollByCard(-1)}
          disabled={!canLeft}
          aria-label={`Previous: ${title}`}
          className="h-11 w-11 rounded-full bg-cinema/70 border border-white/15 text-on-dark disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-on-dark"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <button
          type="button"
          onClick={() => scrollByCard(1)}
          disabled={!canRight}
          aria-label={`Next: ${title}`}
          className="h-11 w-11 rounded-full bg-cinema/70 border border-white/15 text-on-dark disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-on-dark"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>
      <div
        ref={scrollerRef}
        onScroll={update}
        className="flex items-start gap-4 overflow-x-auto snap-x snap-mandatory max-w-5xl mx-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {items.map((item, i) => (
          <div key={keyFn(item, i)} data-card className="snap-start shrink-0 flex">
            {renderItem(item, i)}
          </div>
        ))}
      </div>
    </section>
  );
}