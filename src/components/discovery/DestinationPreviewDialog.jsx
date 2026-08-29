import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Image } from "@/components/ui/image";
import { setSelectedDestinationId } from "@/lib/storage";
import { TRAVEL_FALLBACK_IMAGE } from "@/lib/fallbackImage";
import { bestMonthsSummary } from "@/lib/discoveryCollections";
import { nameWithCountry } from "@/lib/destinationLabel";
import { flagForCountry } from "@/lib/countryFlag";
import TravelFitRing from "@/components/TravelFitRing";
import {
  X, ChevronLeft, ChevronRight, MapPin, Clock, Gauge, ArrowRight, Compass
} from "lucide-react";

// One shared cinematic preview dialog. It receives the full collection items
// plus the active index so the user can browse prev/next within the SAME
// collection/heading without closing the modal (wrap-around at the ends).
// Radix still handles Escape, focus containment and outside-click close.
//
// Prev/next arrows live OUTSIDE the visible panel (vertically centered beside
// it on desktop) and never cover the image, title, description or metadata.
// They are DOM children of the transparent Content so clicks on them do not
// register as "outside" and therefore do not close the dialog. On mobile the
// side arrows are hidden and a compact prev/next row sits BELOW the content
// (never over the image).
//
// The panel uses FIXED desktop dimensions (fixed height, fixed/consistent
// image area, line-clamped body) so switching destinations never reflows or
// resizes the dialog.
function normalizeMode(mode) {
  if (!mode) return "Local transport";
  return String(mode)
    .replace(/local ground transportation/gi, "local transport")
    .replace(/ground transportation/gi, "local transport")
    .replace(/ground transfer/gi, "transfer");
}

export default function DestinationPreviewDialog({
  items,
  index,
  open,
  onOpenChange,
  onIndexChange,
  returning
}) {
  const navigate = useNavigate();
  const list = Array.isArray(items) ? items : [];
  const safeIndex = Math.max(0, Math.min(list.length - 1, Number(index) || 0));
  const item = list.length ? list[safeIndex] : null;

  if (!item) return null;
  const dest = item.dest;
  const result = item.result || null;
  const prac = result && result.practicality;
  const d = dest;
  const tags = Array.from(
    new Set([...(d.primary_interests || []), ...(d.interest_tags || [])])
  ).slice(0, 4);

  const labeled = nameWithCountry(d.name, d.country);
  const showsCountry = labeled !== d.name;
  const flag = flagForCountry(d.country);
  const locLine = showsCountry
    ? [flag ? `${flag} ${d.country}` : d.country, d.region].filter(Boolean).join(" · ")
    : (d.region || "");

  const viewTrip = () => {
    setSelectedDestinationId(d.id);
    onOpenChange(false);
    navigate("/trip");
  };

  const go = (dir) => {
    if (list.length < 2) return;
    const n = ((safeIndex + dir) % list.length + list.length) % list.length;
    onIndexChange && onIndexChange(n);
  };

  const onKeyDown = (e) => {
    if (e.key === "ArrowLeft") { e.preventDefault(); go(-1); }
    else if (e.key === "ArrowRight") { e.preventDefault(); go(1); }
  };

  const SideArrow = ({ dir, label }) => (
    <button
      type="button"
      onClick={() => go(dir)}
      aria-label={label}
      className="hidden md:flex shrink-0 h-12 w-12 rounded-full glass-badge items-center justify-center hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-on-dark motion-safe:transition"
    >
      {dir < 0 ? <ChevronLeft className="w-6 h-6" /> : <ChevronRight className="w-6 h-6" />}
    </button>
  );

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0" />
        <DialogPrimitive.Content
          onKeyDown={onKeyDown}
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 flex items-center gap-4 max-w-[100vw] focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95"
        >
          {/* Left arrow — outside the panel, vertically centered */}
          {list.length > 1 && <SideArrow dir={-1} label="Previous destination" />}

          {/* Fixed-dimension panel */}
          <div className="relative w-[94vw] sm:max-w-[600px] lg:max-w-[1100px] sm:h-[560px] lg:h-[680px] sm:max-h-[88vh] overflow-hidden rounded-3xl bg-cinema/90 backdrop-blur-xl border border-white/10 text-on-dark flex flex-col sm:grid sm:grid-cols-[60%_40%]">
            <DialogPrimitive.Close
              aria-label="Close"
              className="glass-badge absolute right-3 top-3 z-20 grid h-9 w-9 place-items-center rounded-full text-on-dark opacity-90 transition-opacity hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-on-dark focus-visible:ring-offset-2 focus-visible:ring-offset-cinema"
            >
              <X className="h-4 w-4" />
            </DialogPrimitive.Close>

            {/* Image side */}
            <div className="relative h-44 sm:h-full overflow-hidden">
              <Image
                src={d.image_url}
                alt=""
                fittingType="fill"
                fallbackSrc={TRAVEL_FALLBACK_IMAGE}
                loading="lazy"
                className="absolute inset-0 w-full h-full"
              />
              <div
                className="absolute inset-0"
                style={{
                  background:
                    "linear-gradient(to top, rgba(7,24,39,0.78) 0%, rgba(7,24,39,0.08) 58%, rgba(7,24,39,0) 100%)"
                }}
              />
              <div className="absolute inset-x-0 bottom-0 p-5 sm:hidden">
                <p className="text-sm text-on-dark/80">{locLine}</p>
              </div>
            </div>

            {/* Content side */}
            <div className="flex flex-col min-h-0 flex-1">
              <div className="overflow-y-auto px-6 pt-7 pb-4 sm:px-7 flex-1">
                <DialogPrimitive.Title className="font-display text-2xl font-bold text-on-dark">
                  {d.name}
                </DialogPrimitive.Title>
                <DialogPrimitive.Description className="text-sm text-on-dark/70 mt-1">
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5" />
                    {locLine}
                  </span>
                </DialogPrimitive.Description>

                {d.intro && (
                  <p className="mt-4 text-sm text-on-dark/85 leading-relaxed line-clamp-3">{d.intro}</p>
                )}

                <div className="mt-5">
                  <h3 className="text-xs font-medium text-on-dark/60 mb-1.5">Top experiences</h3>
                  <p className="text-sm text-on-dark/85 leading-snug line-clamp-2">
                    {(d.top_experiences || []).slice(0, 3).join(" · ")}
                  </p>
                </div>

                <dl className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5 text-sm">
                  <div>
                    <dt className="text-xs font-medium text-on-dark/60">Suggested length</dt>
                    <dd className="font-display font-semibold text-on-dark mt-0.5">{d.min_days}–{d.max_days} days</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-on-dark/60">Best months</dt>
                    <dd className="text-on-dark mt-0.5 leading-snug">{bestMonthsSummary(d)}</dd>
                  </div>
                </dl>

                {tags.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {tags.map((t) => (
                      <span
                        key={t}
                        className="text-xs bg-white/10 text-on-dark/85 px-2.5 py-1 rounded-full"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                )}

                {result && prac && (
                  <div className="mt-5 pt-5 border-t border-white/10">
                    <div className="flex items-center justify-between gap-3 mb-3">
                      <TravelFitRing score={result.finalScore} size="md" />
                      <span className="text-sm text-teal font-semibold">{result.matchLabel}</span>
                    </div>
                    <dl className="grid grid-cols-1 gap-y-2 text-sm">
                      <div className="flex items-start justify-between gap-4">
                        <dt className="text-muted-dark flex items-center gap-1.5"><Compass className="w-3.5 h-3.5" /> Travel mode</dt>
                        <dd className="text-on-dark text-right max-w-[60%]">{normalizeMode(prac.travelMode)}</dd>
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <dt className="text-muted-dark flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> Travel time</dt>
                        <dd className="text-on-dark">About {prac.oneWayHours} hours each way</dd>
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <dt className="text-muted-dark flex items-center gap-1.5"><Gauge className="w-3.5 h-3.5" /> Time at destination</dt>
                        <dd className="text-on-dark">{prac.usableDestinationDays} days</dd>
                      </div>
                    </dl>
                  </div>
                )}
              </div>

              {/* Mobile prev/next — below content, never over the image */}
              {list.length > 1 && (
                <div className="sm:hidden flex items-center justify-center gap-3 px-6 py-3 border-t border-white/10">
                  <button
                    type="button"
                    onClick={() => go(-1)}
                    aria-label="Previous destination"
                    className="h-10 w-10 rounded-full glass-badge flex items-center justify-center hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-on-dark"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <span className="glass-badge text-xs text-on-dark/85 px-2.5 py-1 rounded-full tabular-nums">
                    {safeIndex + 1} / {list.length}
                  </span>
                  <button
                    type="button"
                    onClick={() => go(1)}
                    aria-label="Next destination"
                    className="h-10 w-10 rounded-full glass-badge flex items-center justify-center hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-on-dark"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              )}

              {/* Sticky bottom CTA */}
              <div className="border-t border-white/10 px-6 py-4">
                {returning ? (
                  <Button
                    onClick={viewTrip}
                    className="w-full sm:w-auto wn-cta-dark min-h-12 focus-visible:!ring-on-dark focus-visible:ring-offset-cinema"
                  >
                    View my trip <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                ) : (
                  <Button
                    asChild
                    className="w-full sm:w-auto wn-cta-dark min-h-12 focus-visible:!ring-on-dark focus-visible:ring-offset-cinema"
                  >
                    <Link to="/questionnaire">Find my Travel Fit</Link>
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Right arrow — outside the panel, vertically centered */}
          {list.length > 1 && <SideArrow dir={1} label="Next destination" />}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}