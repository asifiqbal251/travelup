import { Image } from "@/components/ui/image";
import { TRAVEL_FALLBACK_IMAGE } from "@/lib/fallbackImage";

// Image-led destination card. The photograph becomes the card (bleeds to every
// edge). Default visible content is limited to name + one concise reason; a
// score badge appears only for personalized recommendations. Country stays in
// the accessible name even when not visually repeated.
//
// `featured` slightly enlarges the first card in a rail for editorial hierarchy
// without reordering data. Hover/focus feedback completes in ~200ms (motion-safe
// only); keyboard focus gets an equivalent elevated state plus a focus ring.
export default function DiscoveryDestinationCard({ item, onOpen, personalized, featured }) {
  const { dest, reason, result } = item;
  const width = featured
    ? "w-[82vw] max-w-[340px] sm:w-[340px] lg:w-[360px]"
    : "w-[78vw] max-w-[300px] sm:w-[300px] lg:w-[320px]";

  const a11yLabel = personalized && result
    ? `Open ${dest.name}, ${dest.country}. Travel Fit ${result.finalScore} out of 100`
    : `Open ${dest.name}, ${dest.country}`;

  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      aria-label={a11yLabel}
      className={`group block ${width} text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-offset-2 focus-visible:ring-offset-cinema motion-safe:transition-[transform] motion-safe:duration-200 motion-safe:ease-out motion-safe:hover:-translate-y-1 motion-safe:focus-visible:-translate-y-1`}
    >
      <span className="relative block w-full aspect-[4/5] overflow-hidden rounded-2xl bg-cinema/40">
        <Image
          src={dest.image_url}
          alt=""
          fittingType="fill"
          fallbackSrc={TRAVEL_FALLBACK_IMAGE}
          loading="lazy"
          className="w-full h-full motion-safe:transition-transform motion-safe:duration-200 motion-safe:ease-out motion-safe:group-hover:scale-[1.04] motion-safe:group-focus-visible:scale-[1.04]"
        />
        {/* Localized bottom gradient for text contrast only */}
        <span
          className="absolute inset-x-0 bottom-0 h-2/3 rounded-b-2xl"
          style={{
            background:
              "linear-gradient(to top, rgba(7,24,39,0.92) 0%, rgba(7,24,39,0.6) 38%, rgba(7,24,39,0) 100%)"
          }}
        />
        {personalized && result && (
          <span
            className="glass absolute top-3 right-3 text-on-dark text-xs font-semibold px-2.5 py-1 rounded-full"
            aria-hidden="true"
          >
            {result.finalScore}
          </span>
        )}
        <span className="absolute inset-x-0 bottom-0 p-4">
          <span className="block font-display text-lg font-bold text-on-dark leading-tight">
            {dest.name}
          </span>
          <span className="block text-sm text-teal font-medium mt-1">{reason}</span>
        </span>
      </span>
    </button>
  );
}