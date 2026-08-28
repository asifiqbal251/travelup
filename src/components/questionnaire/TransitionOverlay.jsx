import { Compass } from "lucide-react";

// Short cinematic bridge from the reveal CTA into /results (~0.8s). On-brand
// full-screen cinema moment with a soft teal ring and a single display line —
// no generic spinner, no long fake loading. Reduced-motion collapses the
// transition to ~200ms via the global guard.
export default function TransitionOverlay() {
  return (
    <div
      className="fixed inset-0 z-50 bg-cinema flex flex-col items-center justify-center motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300"
      role="status"
      aria-live="polite"
    >
      <div className="text-center px-6">
        <div className="relative w-16 h-16 mx-auto mb-6">
          <span
            className="absolute inset-0 rounded-full bg-teal/20 motion-safe:animate-ping opacity-60"
            aria-hidden="true"
          />
          <span className="relative inline-flex w-16 h-16 rounded-full bg-teal items-center justify-center">
            <Compass className="w-7 h-7 text-cinema" aria-hidden="true" />
          </span>
        </div>
        <p className="font-display text-2xl font-semibold text-on-dark">Revealing your matches…</p>
      </div>
    </div>
  );
}