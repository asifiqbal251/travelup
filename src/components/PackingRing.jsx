// Packing-progress strip: a compact inline row (ring + label + reset) that
// sits directly above the packing list, replacing the old tall white card.
// The ring's colour is a continuous HSL interpolation across five stops
// (slate -> coral -> amber -> lime -> green -> deep teal) so every single
// item ticked visibly nudges the hue, instead of jumping only every fifth
// item the way five fixed colour bands did. See docs/wherenova-fixes brief,
// Build A #1.
const BOX = 54;
const CENTER = BOX / 2;
const RADIUS = (BOX - 5) / 2;
const STROKE = 5;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

// [percent, h, s, l] stops. 0 -> 1 is a deliberate hard jump (slate to
// coral): untouched should read as visually inert, not "already started".
const STOPS = [
  [0, 214, 14, 62],
  [1, 14, 82, 55],
  [25, 38, 90, 50],
  [50, 78, 58, 42],
  [75, 145, 58, 38],
  [100, 172, 66, 36]
];

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function colorForPercent(percent) {
  for (let i = 1; i < STOPS.length; i++) {
    const [pPrev, hPrev, sPrev, lPrev] = STOPS[i - 1];
    const [pNext, hNext, sNext, lNext] = STOPS[i];
    if (percent <= pNext) {
      const t = pNext === pPrev ? 1 : (percent - pPrev) / (pNext - pPrev);
      const h = lerp(hPrev, hNext, t);
      const s = lerp(sPrev, sNext, t);
      const l = lerp(lPrev, lNext, t);
      return `hsl(${h.toFixed(1)} ${s.toFixed(1)}% ${l.toFixed(1)}%)`;
    }
  }
  const [, h, s, l] = STOPS[STOPS.length - 1];
  return `hsl(${h} ${s}% ${l}%)`;
}

function labelForPercent(percent) {
  if (percent <= 0) return "Nothing packed yet";
  if (percent < 25) return "Just getting started";
  if (percent < 50) return "Making progress";
  if (percent < 75) return "Over halfway";
  if (percent < 100) return "Almost there";
  return "All packed";
}

export default function PackingRing({ percent, done, total, onReset }) {
  const clamped = Math.max(0, Math.min(100, percent));
  const color = colorForPercent(clamped);
  const label = labelForPercent(clamped);
  const offset = CIRCUMFERENCE * (1 - clamped / 100);

  return (
    <div className="flex items-center gap-3 py-3 border-b border-wn-line-l">
      <div
        role="img"
        aria-label={`${Math.round(clamped)}% packed. ${label}`}
        className="relative inline-flex items-center justify-center shrink-0"
        style={{ flex: "0 0 54px", width: BOX, height: BOX }}
      >
        <svg width={BOX} height={BOX} viewBox={`0 0 ${BOX} ${BOX}`} style={{ transform: "rotate(-90deg)" }}>
          <circle
            cx={CENTER} cy={CENTER} r={RADIUS}
            fill="none" stroke="#DFE5EB" strokeWidth={STROKE}
          />
          <circle
            cx={CENTER} cy={CENTER} r={RADIUS}
            fill="none" stroke={color} strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={offset}
            className="motion-safe:transition-[stroke-dashoffset] motion-safe:duration-[400ms] motion-safe:ease-[cubic-bezier(.4,0,.2,1)] motion-safe:[transition-property:stroke,stroke-dashoffset]"
          />
        </svg>
        <span
          className="absolute inset-0 flex items-center justify-center font-display font-bold text-sm tabular-nums motion-safe:transition-colors motion-safe:duration-[400ms] motion-safe:ease-linear"
          style={{ color, fontSize: 14 }}
        >
          {Math.round(clamped)}%
        </span>
      </div>

      <div className="min-w-0 flex-1">
        <p
          className="font-semibold text-[15px] leading-tight truncate motion-safe:transition-colors motion-safe:duration-[400ms] motion-safe:ease-linear"
          style={{ color }}
        >
          {label}
        </p>
        <p className="text-[12.5px] text-wn-text-2-l mt-0.5">
          {done} of {total} packed
        </p>
      </div>

      <button
        type="button"
        onClick={onReset}
        className="ml-auto shrink-0 text-xs font-semibold text-wn-text-2-l hover:text-wn-text-l underline decoration-wn-line-2-l underline-offset-2 min-h-9 px-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wn-cyan rounded"
      >
        Reset
      </button>
    </div>
  );
}
