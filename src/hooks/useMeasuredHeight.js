import { useEffect, useRef, useState } from "react";

// Measures an element's rendered height and keeps it in sync via
// ResizeObserver. Used to size scroll-margin-top / sticky offsets against
// the actual pinned header stack instead of a guessed pixel constant.
export function useMeasuredHeight() {
  const ref = useRef(null);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const update = () => setHeight(el.offsetHeight);
    const ro = new ResizeObserver(update);
    ro.observe(el);
    update();
    return () => ro.disconnect();
  }, []);

  return [ref, height];
}
