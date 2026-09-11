import { useEffect, useState } from "react";

// Tracks which of `ids` is the current "active" section based on scroll
// position, for a sticky jump-nav pill row. `offsetPx` is how much of the
// viewport top is covered by pinned headers -- the "active" section is
// whichever one currently spans the reference line just below that stack.
//
// Deliberately not IntersectionObserver-with-a-shrunk-rootMargin: cutting
// the bottom margin by a fixed percentage (the usual pattern) leaves a dead
// zone whenever a section is taller than that margin allows -- scrolled
// past its intersecting band, the callback stops firing new entries and the
// highlighted pill freezes on a section the user scrolled away from many
// screens ago. Recomputing the containing section directly against a fixed
// reference line has no such gap regardless of section height.
//
// Re-binds whenever the id list changes (different trip -> different day
// count / packing categories) or `active` flips (tab switches unmount/
// remount the target elements, so a stale binding would watch nothing).
export function useScrollSpy(ids, { active = true, offsetPx = 0 } = {}) {
  const idsKey = ids.join("|");
  const [activeId, setActiveId] = useState(ids[0] || null);

  useEffect(() => {
    if (!active || !ids.length) return undefined;
    setActiveId((cur) => (ids.includes(cur) ? cur : ids[0]));

    const referenceLine = offsetPx + 1;
    let ticking = false;

    const compute = () => {
      ticking = false;
      const elements = ids.map((id) => document.getElementById(id)).filter(Boolean);
      if (!elements.length) return;

      // Prefer the section whose box actually spans the reference line. If
      // the line falls in a gap between sections (margins/padding), fall
      // back to the nearest section above it, then the nearest below.
      let containing = null;
      let lastAbove = null;
      let lastAboveBottom = -Infinity;
      let firstBelow = null;
      let firstBelowTop = Infinity;

      for (const el of elements) {
        const rect = el.getBoundingClientRect();
        if (rect.top <= referenceLine && rect.bottom >= referenceLine) {
          containing = el;
          break;
        }
        if (rect.bottom < referenceLine && rect.bottom > lastAboveBottom) {
          lastAbove = el;
          lastAboveBottom = rect.bottom;
        }
        if (rect.top > referenceLine && rect.top < firstBelowTop) {
          firstBelow = el;
          firstBelowTop = rect.top;
        }
      }

      const winner = containing || lastAbove || firstBelow || elements[0];
      setActiveId(winner.id);
    };

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(compute);
    };

    compute();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [idsKey, active, offsetPx]);

  return [activeId, setActiveId];
}
