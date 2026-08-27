import { useId } from "react";

// WhereNova brand mark: a clean WN monogram using the brand gradient —
// turquoise W, orange→coral N leg + diagonal, dark-navy N right leg.
// Transparent everywhere (no white box over photography), crisp at any size.
// Pair with the "WhereNova" wordmark (Manrope) where space allows.
export default function WherenovaLogo({
  withWordmark = true,
  onDark = true,
  className = "",
  symbolSize = 26,
  wordSize = "1.05rem"
}) {
  const id = useId().replace(/:/g, "");
  const turq = `wn-turq-${id}`;
  const coral = `wn-coral-${id}`;
  const wordColor = onDark ? "rgb(248, 246, 241)" : "rgb(12, 42, 89)";
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <svg
        width={symbolSize}
        height={symbolSize * (40 / 56)}
        viewBox="0 0 56 40"
        fill="none"
        aria-hidden="true"
        role="presentation"
      >
        <defs>
          <linearGradient id={turq} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#02DAE3" />
            <stop offset="1" stopColor="#00BFD0" />
          </linearGradient>
          <linearGradient id={coral} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#FF9F2E" />
            <stop offset="1" stopColor="#FE6D32" />
          </linearGradient>
        </defs>
        <path
          d="M4 8 L12 32 L20 8 L28 32 L36 8"
          stroke={`url(#${turq})`}
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M42 8 L42 32 L54 8"
          stroke={`url(#${coral})`}
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M54 8 L54 32" stroke="#0C2A59" strokeWidth="5" strokeLinecap="round" />
      </svg>
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