// Reusable Travel Fit score gauge: a circular progress ring with the score
// centered inside and a small "TRAVEL FIT" label beneath it. Two sizes only —
// "lg" (104px) for the single featured/top match, "md" (76px, "standard")
// for every other card, modal and rail badge -- exact dimensions from
// docs/wherenova-polish-pass-v3.md Part D.
//
// Backdrop, track and arc are all circles in ONE svg sharing the same
// cx/cy -- deliberately not a separate absolutely-positioned backdrop
// element (that was the previous implementation, via an external
// glass-badge wrapper span at every call site: its own padding/sizing
// wasn't guaranteed concentric with the ring's own circle geometry, which
// is exactly the "grey disc offset from the ring" bug Part D describes).
// The outer div is sized identically to the svg with no padding, so a
// backdrop-filter blur clipped to it via rounded-full+overflow-hidden stays
// perfectly concentric by construction.
const SIZES = {
  lg: { box: 104, cx: 52, cy: 52, backdropR: 49, r: 46, stroke: 6, fontSize: 32, labelSize: 9, gap: 3 },
  md: { box: 76, cx: 38, cy: 38, backdropR: 36, r: 33, stroke: 5, fontSize: 22, labelSize: 8, gap: 2 }
};

export default function TravelFitRing({ score, size = "md", className = "" }) {
  const cfg = SIZES[size] || SIZES.md;
  const circumference = 2 * Math.PI * cfg.r;
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const offset = circumference * (1 - clamped / 100);

  return (
    <div
      role="img"
      aria-label={`Travel Fit score ${clamped} out of 100`}
      className={`relative inline-flex items-center justify-center shrink-0 rounded-full overflow-hidden ${className}`}
      style={{
        width: cfg.box,
        height: cfg.box,
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)"
      }}
    >
      <svg width={cfg.box} height={cfg.box} viewBox={`0 0 ${cfg.box} ${cfg.box}`} className="-rotate-90">
        <circle cx={cfg.cx} cy={cfg.cy} r={cfg.backdropR} fill="rgba(6,16,32,.38)" />
        <circle
          cx={cfg.cx} cy={cfg.cy} r={cfg.r}
          fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth={cfg.stroke}
        />
        <circle
          cx={cfg.cx} cy={cfg.cy} r={cfg.r}
          fill="none" stroke="rgb(var(--wn-cyan))" strokeWidth={cfg.stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="motion-safe:transition-[stroke-dashoffset] motion-safe:duration-700 motion-safe:ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span
          className="font-display font-extrabold text-white tabular-nums"
          style={{ fontSize: cfg.fontSize, marginBottom: cfg.gap }}
        >
          {clamped}
        </span>
        <span
          className="font-semibold uppercase tracking-wide text-white/[.72]"
          style={{ fontSize: cfg.labelSize }}
        >
          Travel Fit
        </span>
      </div>
    </div>
  );
}
