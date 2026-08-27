// Official, final WhereNova "Option 2" brand mark — transparent PNG.
// The asset is rendered verbatim: no SVG reconstruction, no tile/mask/border,
// no crop or zoom workarounds. Intrinsic aspect ratio preserved with
// object-contain and height: auto. Sizing is applied via width only.
const LOGO_URL =
  "https://media.base44.com/images/public/6a7ce8f29cef18f569162dc7/fd7424991_wherenova-wn-option-2-transparent.png";

export default function WherenovaLogo({
  withWordmark = true,
  onDark = true,
  className = "",
  // Width-only sizing, passed as Tailwind width classes (height is auto).
  // e.g. header: "w-[38px] sm:w-[42px]", footer: "w-[34px]".
  widthClass = "w-[38px] sm:w-[42px]",
  wordSize = "1.05rem"
}) {
  const wordColor = onDark ? "rgb(248, 246, 241)" : "rgb(12, 42, 89)";
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <img
        src={LOGO_URL}
        alt=""
        aria-hidden="true"
        draggable="false"
        className={`h-auto ${widthClass} object-contain wn-logo-contrast`}
      />
      {withWordmark && (
        <span
          className="font-display font-bold tracking-tight leading-none"
          style={{ color: wordColor, fontSize: wordSize }}
        >
          WhereNova
        </span>
      )}
    </span>
  );
}