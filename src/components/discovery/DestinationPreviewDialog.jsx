import { useNavigate, Link } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Image } from "@/components/ui/image";
import { setSelectedDestinationId } from "@/lib/storage";
import { TRAVEL_FALLBACK_IMAGE } from "@/lib/fallbackImage";
import { bestMonthsSummary } from "@/lib/discoveryCollections";
import { nameWithCountry } from "@/lib/destinationLabel";
import { flagForCountry } from "@/lib/countryFlag";
import { MapPin, Clock, Gauge, ArrowRight, Compass } from "lucide-react";

// One shared cinematic preview dialog. It receives the already-loaded item
// (destination record plus, for personalized recommendations, the ranked
// result) so opening a card never re-fetches or recomputes. Radix handles
// Escape, focus containment, and focus restoration to the originating card.
//
// Desktop: spacious side-by-side image + content. Mobile: near-full-screen sheet
// with a sticky bottom CTA. Metadata uses typography and separators, not a
// border around every value.
function normalizeMode(mode) {
  if (!mode) return "Local transport";
  return String(mode)
    .replace(/local ground transportation/gi, "local transport")
    .replace(/ground transportation/gi, "local transport")
    .replace(/ground transfer/gi, "transfer");
}

export default function DestinationPreviewDialog({ item, open, onOpenChange, returning }) {
  const navigate = useNavigate();
  if (!item) return null;
  const dest = item.dest;
  const result = item.result || null;
  const prac = result && result.practicality;
  const d = dest;
  const tags = Array.from(
    new Set([...(d.primary_interests || []), ...(d.interest_tags || [])])
  ).slice(0, 4);

  // Avoid repeating the country when the curated name already embeds it.
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-3xl p-0 overflow-hidden rounded-none h-[100dvh] bg-cinema/80 backdrop-blur-lg backdrop-saturate-150 border-white/10 text-on-dark sm:h-auto sm:max-h-[90vh] sm:rounded-3xl"
      >
        <div className="flex flex-col h-full sm:grid sm:grid-cols-2">
          {/* Image side */}
          <div className="relative h-52 sm:h-auto sm:min-h-[460px]">
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
              <h2 className="font-display text-2xl font-bold text-on-dark">{d.name}</h2>
              <p className="text-sm text-on-dark/80">{locLine}</p>
            </div>
          </div>

          {/* Content side */}
          <div className="flex flex-col min-h-0 flex-1">
            <div className="overflow-y-auto px-6 pt-6 pb-4 sm:px-8 sm:pt-8 flex-1">
              <DialogHeader className="hidden sm:flex">
                <DialogTitle className="font-display text-2xl font-bold text-on-dark">
                  {d.name}
                </DialogTitle>
                <DialogDescription className="text-on-dark/70">
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5" />
                    {locLine}
                  </span>
                </DialogDescription>
              </DialogHeader>

              {d.intro && (
                <p className="mt-4 text-sm text-on-dark/85 leading-relaxed">{d.intro}</p>
              )}

              <div className="mt-5">
                <h3 className="text-xs font-medium text-on-dark/60 mb-1.5">Top experiences</h3>
                <p className="text-sm text-on-dark/85 leading-snug">
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
                  <div className="flex items-end justify-between gap-3 mb-3">
                    <div>
                      <div className="flex items-baseline gap-0.5 leading-none">
                        <span className="font-display text-3xl font-bold text-on-dark">{result.finalScore}</span>
                        <span className="text-sm font-medium text-muted-dark">/100</span>
                      </div>
                      <span className="block text-[10px] uppercase tracking-wide text-muted-dark mt-1">Travel Fit</span>
                    </div>
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

            {/* Sticky bottom CTA */}
            <div className="border-t border-white/10 px-6 py-4 sm:px-8">
              {returning ? (
                <Button
                  onClick={viewTrip}
                  className="w-full sm:w-auto bg-coral hover:bg-coral/90 text-ink min-h-12 focus-visible:!ring-on-dark focus-visible:ring-offset-cinema"
                >
                  View my trip <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              ) : (
                <Button
                  asChild
                  className="w-full sm:w-auto bg-coral hover:bg-coral/90 text-ink min-h-12 focus-visible:!ring-on-dark focus-visible:ring-offset-cinema"
                >
                  <Link to="/questionnaire">Find my Travel Fit</Link>
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}