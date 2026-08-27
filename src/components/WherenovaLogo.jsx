// Official WhereNova brand lockup. Two independent transparent PNG assets are
// rendered verbatim (no SVG/CSS reconstruction, no recolor, no geometry change):
//   1. the "Option 2" WN symbol
//   2. the official WhereNova wordmark (white letters + gradient-orange N)
// The wordmark is light, so it is used ONLY on dark surfaces (onDark). On light
// surfaces a typeset "WhereNova" label is used instead — no dark wordmark
// variant is generated. Both assets are aria-hidden; the parent Link supplies
// the single accessible name so the brand is announced once to screen readers.
const SYMBOL_URL =
  "https://media.base44.com/images/public/6a7ce8f29cef18f569162dc7/fd7424991_wherenova-wn-option-2-transparent.png";
const WORDMARK_URL =
  "https://media.base44.com/images/public/6a7ce8f29cef18f569162dc7/45db18597_wherenova-wordmark-concept-2-transparent.png";

export default function WherenovaLogo({
  withWordmark = true,
  onDark = true,
  className = "",
  // Symbol sizing via Tailwind width classes (height is auto).
  widthClass = "w-[38px] sm:w-[42px]",
  // Wordmark sizing via height — intrinsic aspect ratio preserved, width auto.
  wordmarkClass = "h-[22px]",
  // Fallback typeset label size, used on light surfaces only.
  wordSize = "1.05rem"
}) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <img
        src={SYMBOL_URL}
        alt=""
        aria-hidden="true"
        draggable="false"
        className={`h-auto ${widthClass} object-contain wn-logo-contrast`}
      />
      {withWordmark &&
        (onDark ? (
          <img
            src={WORDMARK_URL}
            alt=""
            aria-hidden="true"
            draggable="false"
            className={`w-auto ${wordmarkClass} object-contain wn-logo-contrast`}
          />
        ) : (
          <span
            className="font-display font-bold tracking-tight leading-none"
            style={{ color: "rgb(12, 42, 89)", fontSize: wordSize }}
            aria-hidden="true"
          >
            WhereNova
          </span>
        ))}
    </span>
  );
}