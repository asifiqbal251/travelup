// Shared smooth-scroll-to-anchor helper for the trip page jump-nav pills.
// Offset is handled by the target element's own scroll-margin-top (set by
// the caller) rather than manual scrollY math, so it stays correct however
// tall the pinned header stack currently is.
export function scrollToId(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const reduceMotion =
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
}
