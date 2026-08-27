// Official WhereNova "Option 2" brand mark.
//
// IMPORTANT: The symbol artwork is a LOCKED, supplied asset. We render the
// approved image verbatim — no SVG reconstruction, redrawing, simplification,
// or reinterpretation of the monogram.
//
// The supplied PNG ships on a solid white background. Base44 has no lossless
// white-background removal tool, and using AI image generation to "remove" it
// would redraw the locked artwork (forbidden). As a production-safe interim we
// present the mark on a clean white rounded tile so the white reads as an
// intentional brand chip rather than an accidental white square over imagery.
// A transparent PNG/SVG of the official logo is required for the final
// seamless integration — swapping it in is a one-line URL change (LOGO_URL).
const LOGO_URL =
  "https://media.base44.com/images/public/6a7ce8f29cef18f569162dc7/7acb7048e_ChatGPTImageAug27202612_43_33PM1.png";

export default function WherenovaLogo({
  withWordmark = true,
  onDark = true,
  className = "",
  symbolSize = 34,
  wordSize = "1.05rem"
}) {
  const wordColor = onDark ? "rgb(248, 246, 241)" : "rgb(12, 42, 89)";
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <span
        className="inline-flex items-center justify-center rounded-lg bg-white shadow-sm shrink-0"
        style={{ width: symbolSize, height: symbolSize }}
      >
        {/* Official WN mark, rendered verbatim (white bg blends into the tile). */}
        <img
          src={LOGO_URL}
          alt=""
          aria-hidden="true"
          draggable="false"
          className="w-[82%] h-[82%] object-contain"
        />
      </span>
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