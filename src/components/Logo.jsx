import markSrc from "@/assets/logo/wherenova-mark.png";
import wordmarkSrc from "@/assets/logo/wherenova-wordmark.png";
import wordmarkLightSrc from "@/assets/wherenova-wordmark-concept-2-transparent-dark.png";

// Single shared brand lockup, rendered from the real logo assets checked
// into src/assets/logo/ -- no hand-drawn re-implementation anywhere else
// (that's how the questionnaire's inline text wordmark drifted from the
// mark in the first place). Used by the questionnaire, results and trip
// pages. See docs/wherenova-fixes brief, Build A #5.
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
      <img
        src={surface === "dark" ? wordmarkSrc : wordmarkLightSrc}
        alt=""
        aria-hidden="true"
        draggable="false"
        style={{ width: size * 3.35, height: "auto" }}
        className="object-contain"
      />
    </span>
  );
}
