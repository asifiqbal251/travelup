// Packing-progress ring: a circular percentage gauge whose stroke color and
// caption both shift through five states as the trip's packing list fills
// up. Same one-svg-three-concentric-circles construction as TravelFitRing
// (see that file for why), sized larger since this is the single hero
// element of the Packing tab rather than a corner badge.
const BOX = 168;
const CENTER = BOX / 2;
const RADIUS = 72;
const STROKE = 10;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function ringState(percent) {
  if (percent <= 0) {
    return { color: "rgb(var(--wn-text-3-l))", label: "Nothing packed yet" };
  }
  if (percent < 25) {
    return { color: "rgb(var(--wn-coral))", label: "Just getting started" };
  }
  if (percent < 50) {
    return { color: "rgb(var(--wn-coral))", label: "Making progress" };
  }
  if (percent < 75) {
    return { color: "rgb(var(--wn-amber))", label: "Over halfway" };
  }
  if (percent < 100) {
    return { color: "rgb(var(--wn-cyan))", label: "Almost there" };
  }
  return { color: "rgb(var(--wn-green))", label: "All packed. Have a great trip." };
}

export default function PackingRing({ percent }) {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  const { color, label } = ringState(clamped);
  const offset = CIRCUMFERENCE * (1 - clamped / 100);

  return (
    <div className="flex flex-col items-center text-center">
      <div
        role="img"
        aria-label={`${clamped}% packed. ${label}`}
        className="relative inline-flex items-center justify-center shrink-0"
        style={{ width: BOX, height: BOX }}
      >
        <svg width={BOX} height={BOX} viewBox={`0 0 ${BOX} ${BOX}`} className="-rotate-90">
          <circle
            cx={CENTER} cy={CENTER} r={RADIUS}
            fill="none" stroke="rgb(var(--wn-line-2-l))" strokeWidth={STROKE}
          />
          <circle
            cx={CENTER} cy={CENTER} r={RADIUS}
            fill="none" stroke={color} strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={offset}
            className="transition-[stroke,stroke-dashoffset] duration-700 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
          <span
            className="font-display font-extrabold tabular-nums text-4xl transition-colors duration-500"
            style={{ color }}
          >
            {clamped}%
          </span>
          <span className="mt-1.5 text-[11px] font-semibold uppercase tracking-wide text-wn-text-2-l">
            Packed
          </span>
        </div>
      </div>
      <p
        className="mt-4 font-display font-bold text-lg transition-colors duration-500"
        style={{ color }}
      >
        {label}
      </p>
    </div>
  );
}
