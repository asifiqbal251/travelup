import { Image } from "@/components/ui/image";
import { TRAVEL_FALLBACK_IMAGE } from "@/lib/fallbackImage";
import { nameWithCountry } from "@/lib/destinationLabel";
import { DEST_CARD_WIDTH, DEST_CARD_ASPECT, DEST_TITLE_CLAMP } from "@/lib/destinationCard";
import TravelFitRing from "@/components/TravelFitRing";

// Image-led destination card. The photograph becomes the card (bleeds to every
// edge). Default visible content is limited to name + one concise reason; a
// score badge appears only for personalized recommendations. Country stays in
// the accessible name even when not visually repeated.
//
// Every sibling card in a rail uses the SAME geometry (shared
// destinationCard.js): identical width, aspect ratio, crop, radius and reserved
// title area — no first-card enlargement. `featured` is accepted for call-site
// compatibility but has no visual effect. Hover/focus feedback completes in
// ~200ms (motion-safe only); keyboard focus gets an equivalent elevated state
// plus a focus ring.
export default function DiscoveryDestinationCard({ item, onOpen, personalized, featured }) {
  void featured; // geometry is uniform regardless of position
  const { dest, reason, result } = item;

  const labeled = nameWithCountry(dest.name, dest.country);
  const a11yLabel = personalized && result
    ? `Open ${labeled}. Travel Fit ${result.finalScore} out of 100`
    : `Open ${labeled}`;

  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      aria-label={a11yLabel}
      className={`group block ${DEST_CARD_WIDTH} text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-on-dark focus-visible:ring-offset-2 focus-visible:ring-offset-cinema motion-safe:transition-[transform] motion-safe:duration-200 motion-safe:ease-out motion-safe:hover:-translate-y-1 motion-safe:focus-visible:-translate-y-1`}
    >
      <span className={`relative block w-full ${DEST_CARD_ASPECT} overflow-hidden rounded-2xl bg-cinema/40`}>
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
              "linear-gradient(to top, rgba(7,24,39,0.86) 0%, rgba(7,24,39,0.45) 42%, rgba(7,24,39,0) 100%)"
          }}
        />
        {personalized && result && (
          <span className="absolute top-3 right-3 rounded-full glass-badge p-1" aria-hidden="true">
            <TravelFitRing score={result.finalScore} size="md" />
          </span>
        )}
        <span className="absolute inset-x-0 bottom-0 p-4">
          <span className={`block font-display text-lg font-bold text-on-dark ${DEST_TITLE_CLAMP}`}>
            {dest.name}
          </span>
          <span className={`block text-sm font-medium mt-1 line-clamp-1 ${personalized ? "text-teal" : "text-on-dark/85"}`}>
            {reason}
          </span>
        </span>
      </span>
    </button>
  );
}