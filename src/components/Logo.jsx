import markSrc from "@/assets/logo/wherenova-mark.png";
import wordmarkSrc from "@/assets/logo/wherenova-wordmark.png";

// Single shared brand lockup, rendered from the real logo assets checked
// into src/assets/logo/ -- no hand-drawn re-implementation anywhere else
// (that's how the questionnaire's inline text wordmark drifted from the
// mark in the first place). Used by the questionnaire, results and trip
// pages. See docs/wherenova-fixes brief, Build A #5.
//
// KNOWN TEMPORARY GAP: wherenova-wordmark.png is white lettering (only the
// orange "N" of "Nova" is visible on its own transparent background), so it
// is only legible on dark surfaces. On light surfaces (surface="light")
// this renders a styled text stand-in ("Where" in navy, "Nova" in orange)
// instead. Replace that branch with a navy-text wordmark PNG/SVG the day
// one is provided, and delete this note.
export default function Logo({ variant = "full", surface = "dark", size = 32, className = "" }) {
  const mark = (
    <img
      src={markSrc}
      alt=""
      aria-hidden="true"
      draggable="false"
      style={{ height: size, width: "auto" }}
      className="object-contain shrink-0"
    />
  );

  if (variant === "mark") {
    return <span className={`inline-flex items-center ${className}`}>{mark}</span>;
  }

  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      {mark}
      {surface === "dark" ? (
        <img
          src={wordmarkSrc}
          alt=""
          aria-hidden="true"
          draggable="false"
          style={{ height: size * 0.56, width: "auto" }}
          className="object-contain"
        />
      ) : (
        <span
          aria-hidden="true"
          className="font-display font-bold tracking-tight leading-none whitespace-nowrap"
          style={{ fontSize: size * 0.5, color: "rgb(11 27 51)" }}
        >
          Where<span style={{ color: "#F97316" }}>Nova</span>
        </span>
      )}
    </span>
  );
}
