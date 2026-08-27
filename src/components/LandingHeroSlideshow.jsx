import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Image } from "@/components/ui/image";
import { HERO_SLIDES } from "@/lib/heroSlides";
import { Sparkles, ChevronLeft, ChevronRight, Pause, Play, MapPin } from "lucide-react";

const AUTOPLAY_MS = 5000;
const FADE_MS = 800;

const ctrl =
  "h-11 w-11 rounded-full flex items-center justify-center text-on-dark glass hover:opacity-90 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-on-dark focus-visible:ring-offset-2 focus-visible:ring-offset-cinema";
const dot =
  "h-11 w-11 rounded-full flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-on-dark focus-visible:ring-offset-2 focus-visible:ring-offset-cinema hover:bg-white/10";

// One tuned multi-stop scrim: strong behind the left/bottom copy, transparent
// toward the upper-right so the photograph stays vivid. Tested against the four
// hero slides for WCAG-readable contrast on the copy side.
const SCRIM =
  "linear-gradient(100deg, rgba(7,24,39,0.82) 0%, rgba(7,24,39,0.55) 26%, rgba(7,24,39,0.16) 58%, rgba(7,24,39,0) 100%), linear-gradient(to top, rgba(7,24,39,0.46) 0%, rgba(7,24,39,0) 46%)";

export default function LandingHeroSlideshow() {
  const count = HERO_SLIDES.length;
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focusWithin, setFocusWithin] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const firstImgRef = useRef(null);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const onMq = (e) => setReducedMotion(e.matches);
    mq.addEventListener("change", onMq);
    return () => mq.removeEventListener("change", onMq);
  }, []);

  useEffect(() => {
    const onVis = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  useEffect(() => {
    if (firstImgRef.current) firstImgRef.current.fetchPriority = "high";
  }, []);

  const shouldAutoplay =
    !reducedMotion && !paused && !hovered && !focusWithin && !hidden;

  // One autoplay timer, recreated only when shouldAutoplay flips.
  useEffect(() => {
    if (!shouldAutoplay) return undefined;
    const id = setInterval(() => setIndex((i) => (i + 1) % count), AUTOPLAY_MS);
    return () => clearInterval(id);
  }, [shouldAutoplay, count]);

  const go = (i) => setIndex(((i % count) + count) % count);
  const prev = () => go(index - 1);
  const next = () => go(index + 1);
  const togglePause = () => setPaused((p) => !p);

  const fadeMs = reducedMotion ? 0 : FADE_MS;
  const activeLabel = HERO_SLIDES[index].label;

  return (
    <section
      className="relative"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocusWithin(true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setFocusWithin(false);
      }}
    >
      {/* Decorative background imagery */}
      <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
        {HERO_SLIDES.map((s, i) => (
          <div
            key={s.id}
            className="absolute inset-0 transition-opacity"
            style={{ opacity: i === index ? 1 : 0, transitionDuration: `${fadeMs}ms` }}
          >
            <Image
              ref={i === 0 ? firstImgRef : undefined}
              src={s.url}
              alt=""
              fittingType="fill"
              loading={i === 0 ? "eager" : "lazy"}
              className="w-full h-full"
            />
          </div>
        ))}
        {/* Single multi-stop scrim (replaces the stacked 65% uniform + side gradient) */}
        <div className="absolute inset-0" style={{ background: SCRIM }} />
      </div>

      {/* Static marketing copy (does not change with slides) */}
      <div className="relative max-w-5xl mx-auto px-4 py-24 sm:py-32 text-on-dark">
        <p className="inline-flex items-center gap-2 text-on-dark/85 text-sm font-semibold mb-4 uppercase tracking-wide">
          <Sparkles className="w-4 h-4" /> Find your Travel Fit
        </p>
        <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight leading-[1.05] max-w-2xl">
          Here&apos;s where we think you&apos;ll love going.
        </h1>
        <p className="mt-5 text-lg text-on-dark/90 max-w-xl">
          Tell us how you travel, and TravelUp will match you with destinations that fit your time,
          budget, interests and pace — then turn your choice into a practical itinerary you can save.
        </p>

        <div className="mt-8 flex flex-col sm:flex-row gap-3">
          <Button
          asChild
          size="lg"
          className="bg-coral hover:bg-coral/90 text-ink min-h-12 px-8 text-base focus-visible:!ring-on-dark focus-visible:ring-offset-cinema"
          >
          <Link to="/questionnaire">Find my Travel Fit</Link>
          </Button>
          <Button
          asChild
          variant="outline"
          size="lg"
          className="border-white/30 text-on-dark hover:bg-white/10 hover:text-on-dark hover:border-white/60 min-h-12 px-8 text-base focus-visible:!ring-on-dark focus-visible:ring-offset-cinema"
          >
          <Link to="/saved-trips">View saved trips</Link>
          </Button>
        </div>

        <p className="mt-4 text-xs text-on-dark/75 max-w-md">
          Your answers and saved trips stay on this browser — no account and no cross-device sync.
        </p>

        {/* Visible scene label (changes with slides; deliberately not a live region) */}
        <p className="mt-6 inline-flex items-center gap-1.5 text-sm text-on-dark/85">
          <MapPin className="w-4 h-4 text-on-dark/70" aria-hidden="true" /> {activeLabel}
        </p>

        {/* Slideshow controls */}
        <div
          className="mt-3 flex flex-wrap items-center justify-between gap-3"
          aria-roledescription="carousel"
          aria-label="Destination slideshow"
        >
          <div className="flex items-center gap-2">
            <button type="button" onClick={prev} aria-label="Previous slide" className={ctrl}>
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button type="button" onClick={next} aria-label="Next slide" className={ctrl}>
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          <div className="flex items-center gap-2">
            {!reducedMotion && (
              <button
                type="button"
                onClick={togglePause}
                aria-label={paused ? "Play slideshow" : "Pause slideshow"}
                aria-pressed={paused}
                className={ctrl}
              >
                {paused ? <Play className="w-5 h-5" /> : <Pause className="w-5 h-5" />}
              </button>
            )}
            <div className="flex items-center gap-1.5">
              {HERO_SLIDES.map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => go(i)}
                  aria-label={`Show scene: ${s.label}`}
                  aria-current={i === index ? "true" : undefined}
                  className={dot}
                >
                  <span
                    className={`rounded-full ${i === index ? "bg-on-dark w-2.5 h-2.5" : "bg-on-dark/50 w-2 h-2"}`}
                  />
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}