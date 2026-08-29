// Reusable Travel Fit score gauge: a circular progress ring with the score
// centered inside and a small "TRAVEL FIT" label beneath it. Two sizes only —
// "lg" for the single featured/top match, "md" (standard) for every other
// card, modal and rail badge. Designed to sit over a photo/dark scrim (every
// current call site is a dark surface), so the number and label render light.
const SIZES = {
  lg: { box: 128, stroke: 8, fontSize: 40, labelSize: 11, gap: 2 },
  md: { box: 64, stroke: 5, fontSize: 20, labelSize: 8, gap: 1 }
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
          fill="none" stroke="var(--wn-cyan)" strokeWidth={cfg.stroke}
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
