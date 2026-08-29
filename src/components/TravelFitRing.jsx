// Reusable Travel Fit score gauge: a circular progress ring with the score
// centered inside and a small "TRAVEL FIT" label beneath it. Two sizes only —
// "lg" (104px) for the single featured/top match, "md" (76px, "standard")
// for every other card, modal and rail badge -- exact dimensions from
// docs/wherenova-polish-pass-v3.md Part D / the results prototype. Designed
// to sit over a photo/dark scrim (every current call site is a dark
// surface), so the number and label render light.
const SIZES = {
  lg: { box: 104, stroke: 6, fontSize: 32, labelSize: 9, gap: 3 },
  md: { box: 76, stroke: 5, fontSize: 22, labelSize: 8, gap: 2 }
};

export default function TravelFitRing({ score, size = "md", className = "" }) {
  const cfg = SIZES[size] || SIZES.md;
  const r = (cfg.box - cfg.stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const offset = circumference * (1 - clamped / 100);
  const center = cfg.box / 2;

  return (
    <div
      role="img"
      aria-label={`Travel Fit score ${clamped} out of 100`}
      className={`relative inline-flex items-center justify-center shrink-0 ${className}`}
      style={{ width: cfg.box, height: cfg.box }}
    >
      <svg width={cfg.box} height={cfg.box} viewBox={`0 0 ${cfg.box} ${cfg.box}`} className="-rotate-90">
        <circle
          cx={center} cy={center} r={r}
          fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth={cfg.stroke}
        />
        <circle
          cx={center} cy={center} r={r}
          fill="none" stroke="rgb(var(--wn-cyan))" strokeWidth={cfg.stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="motion-safe:transition-[stroke-dashoffset] motion-safe:duration-700 motion-safe:ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span
          className="font-display font-extrabold text-wn-text tabular-nums"
          style={{ fontSize: cfg.fontSize, marginBottom: cfg.gap }}
        >
          {clamped}
        </span>
        <span
          className="font-semibold uppercase tracking-wide text-wn-text-2"
          style={{ fontSize: cfg.labelSize }}
        >
          Travel Fit
        </span>
      </div>
    </div>
  );
}
