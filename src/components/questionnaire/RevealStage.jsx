import { HERO_SLIDES } from "@/lib/heroSlides";
import { Image } from "@/components/ui/image";
import { ArrowRight, Sparkles } from "lucide-react";

// Premium match-reveal payoff (Questionnaire stage 2). A small WhereNova
// personalization cue, large display headline, and a substantial CTA. Three
// destination-photo cards softly rise / fade into view around the central
// content, teasing the recommendations without revealing them (matching has
// not happened yet — it runs on /results). Motion is restrained (fade + slight
// rise + stagger) and collapses instantly under prefers-reduced-motion via the
// global guard + motion-safe variants.
const PRIMARY_CTA =
  "inline-flex items-center justify-center gap-2 h-14 px-10 rounded-full bg-ink text-on-dark font-semibold text-lg ring-1 ring-teal/40 shadow-[0_18px_50px_-16px_rgba(2,218,227,0.6)] hover:bg-surface-dark hover:ring-teal/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-on-dark motion-safe:transition";

const TEASE = [
  { slide: HERO_SLIDES[0], rotate: "-rotate-6", offset: "sm:-translate-x-52", delay: "0ms" },
  { slide: HERO_SLIDES[2], rotate: "rotate-0", offset: "", delay: "120ms" },
  { slide: HERO_SLIDES[3], rotate: "rotate-6", offset: "sm:translate-x-52", delay: "240ms" }
];

export default function RevealStage({ onReveal }) {
  return (
    <div className="relative min-h-[72vh] flex items-center justify-center overflow-hidden">
      {/* Teasing destination cards — sit behind the central content */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none" aria-hidden="true">
        <div className="relative flex items-center justify-center w-full max-w-3xl">
          {TEASE.map(({ slide, rotate, offset, delay }, i) => (
            <div
              key={i}
              className={`absolute ${offset} ${rotate} w-40 sm:w-48 aspect-[3/4] rounded-2xl overflow-hidden ring-1 ring-white/15 opacity-40 blur-[1px] motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-8 motion-safe:duration-700 motion-safe:fill-mode-both`}
              style={{ animationDelay: delay, zIndex: i === 1 ? 1 : 2 }}
            >
              <Image
                src={slide.url}
                alt=""
                fittingType="fill"
                loading="lazy"
                className="w-full h-full"
              />
              <span
                className="absolute inset-0"
                style={{ background: "linear-gradient(to top, rgba(7,24,39,0.5), rgba(7,24,39,0))" }}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Radial vignette keeps the central copy readable over the cards */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: "radial-gradient(ellipse at center, rgba(7,24,39,0.82) 0%, rgba(7,24,39,0.4) 55%, rgba(7,24,39,0) 80%)" }}
        aria-hidden="true"
      />

      {/* Central content */}
      <div className="relative z-10 text-center px-6 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-700">
        <div className="inline-flex items-center gap-2 text-teal text-sm font-semibold uppercase tracking-wide mb-5">
          <Sparkles className="w-4 h-4" aria-hidden="true" />
          Your Travel Fit is ready
        </div>
        <h1 className="font-display text-4xl sm:text-6xl font-bold text-on-dark leading-[1.05] max-w-2xl">
          We've learned your travel style.
        </h1>
        <p className="text-on-dark/75 text-lg sm:text-xl mt-5 max-w-xl mx-auto">
          Now here are the places that fit you.
        </p>
        <button type="button" onClick={onReveal} className={`${PRIMARY_CTA} mt-10`}>
          Reveal my matches <ArrowRight className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}