import { useEffect, useRef, useState } from "react";
import { Calendar, Wallet, Camera, UtensilsCrossed, Scale, MapPin } from "lucide-react";

// Lightweight, modern "How WhereNova works" sequence — not a flowchart. Four
// stages (preferences → personalize → matches → itinerary) appear with a
// gentle staggered entrance the first time the section scrolls into view.
// All content is always present and readable; animation is presentation only.
// Under prefers-reduced-motion the sequence shows statically with no movement.

const PREF_CHIPS = [
  { icon: Calendar, label: "8 days" },
  { icon: Wallet, label: "Comfortable" },
  { icon: Camera, label: "Photography" },
  { icon: UtensilsCrossed, label: "Food" },
  { icon: Scale, label: "Balanced pace" }
];

const MATCHES = ["Amsterdam", "Kyoto", "Lisbon"];

function prefersReduced() {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export default function HowWhereNovaWorks() {
  const ref = useRef(null);
  const [visible, setVisible] = useState(prefersReduced);

  useEffect(() => {
    if (visible) return undefined;
    if (prefersReduced()) {
      setVisible(true);
      return undefined;
    }
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return undefined;
    }
    const el = ref.current;
    if (!el) return undefined;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          io.disconnect();
        }
      },
      { threshold: 0.2 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);

  const stage = (i) =>
    `motion-safe:transition-all motion-safe:duration-700 motion-safe:ease-out ${
      visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
    }`;
  const delay = (i) => ({ transitionDelay: visible ? `${i * 160}ms` : "0ms" });

  return (
    <section ref={ref} className="max-w-5xl mx-auto px-4 py-16 sm:py-20">
      <h2 className="font-display text-2xl sm:text-3xl font-bold text-center text-on-dark mb-2">
        How WhereNova works
      </h2>
      <p className="text-sm sm:text-base text-muted-dark text-center max-w-xl mx-auto mb-10">
        Tell us how you travel — we find destinations that fit, then turn your pick into a plan.
      </p>

      <div className="grid sm:grid-cols-4 gap-5 sm:gap-4">
        {/* Stage 1 — your preferences */}
        <div className={stage(0)} style={delay(0)}>
          <Eyebrow n="01" label="Your preferences" />
          <div className="flex flex-wrap gap-2">
            {PREF_CHIPS.map((c) => (
              <span
                key={c.label}
                className="inline-flex items-center gap-1.5 rounded-lg bg-on-dark/8 ring-1 ring-on-dark/10 px-2.5 py-1.5 text-xs font-medium text-on-dark"
              >
                <c.icon className="w-3.5 h-3.5 text-teal" aria-hidden="true" /> {c.label}
              </span>
            ))}
          </div>
        </div>

        {/* Stage 2 — WhereNova personalizes */}
        <div className={stage(1)} style={delay(1)}>
          <Eyebrow n="02" label="WhereNova personalizes" />
          <div className="rounded-2xl bg-gradient-to-br from-surface-dark to-cinema ring-1 ring-on-dark/10 p-4 flex items-center gap-3">
            <span className="inline-flex h-2.5 w-2.5 rounded-full bg-teal shrink-0" aria-hidden="true" />
            <span className="text-sm font-semibold text-on-dark">Finding your fit</span>
          </div>
        </div>

        {/* Stage 3 — destination matches */}
        <div className={stage(2)} style={delay(2)}>
          <Eyebrow n="03" label="Destination matches" />
          <div className="flex flex-col gap-2">
            {MATCHES.map((name) => (
              <span
                key={name}
                className="inline-flex items-center gap-2 rounded-xl bg-on-dark/6 ring-1 ring-on-dark/10 px-3 py-2 text-sm font-medium text-on-dark"
              >
                <MapPin className="w-3.5 h-3.5 text-teal" aria-hidden="true" /> {name}
              </span>
            ))}
          </div>
        </div>

        {/* Stage 4 — practical itinerary */}
        <div className={stage(3)} style={delay(3)}>
          <Eyebrow n="04" label="Practical itinerary" />
          <div className="flex flex-col gap-1.5">
            {["Day 1", "Day 2", "Day 3"].map((d) => (
              <div
                key={d}
                className="flex items-center gap-2.5 rounded-lg bg-on-dark/6 ring-1 ring-on-dark/10 px-3 py-2"
              >
                <span className="text-[11px] font-bold text-teal w-9 shrink-0">{d}</span>
                <span className="h-1.5 flex-1 rounded-full bg-on-dark/15" aria-hidden="true" />
                <span className="h-1.5 w-2/3 rounded-full bg-on-dark/10" aria-hidden="true" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function Eyebrow({ n, label }) {
  return (
    <div className="mb-3">
      <span className="text-[11px] font-bold text-teal tracking-wide">{n}</span>
      <span className="block font-display text-sm font-semibold text-on-dark mt-0.5">{label}</span>
    </div>
  );
}