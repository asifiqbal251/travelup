import { Image } from "@/components/ui/image";
import { TRAVEL_FALLBACK_IMAGE } from "@/lib/fallbackImage";

// A single destination card. The whole card is a semantic button that opens the
// shared preview dialog. Editorial cards show no score/travel estimate;
// personalized cards show the Travel Fit score, match label and one-way time.
export default function DiscoveryDestinationCard({ item, onOpen, personalized }) {
  const { dest, reason, tags, result } = item;
  const prac = personalized && result && result.practicality;

  return (
    <button
      type="button"
      onClick={() => onOpen(dest)}
      aria-label={`Open ${dest.name}, ${dest.country}`}
      className="group block w-[230px] sm:w-[290px] lg:w-[300px] text-left rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2EC4B6] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0B1F3A]"
    >
      <span className="block relative aspect-video w-full overflow-hidden rounded-lg bg-[#0B1F3A]/40">
        <Image
          src={dest.image_url}
          alt=""
          fittingType="fill"
          fallbackSrc={TRAVEL_FALLBACK_IMAGE}
          loading="lazy"
          className="w-full h-full motion-safe:transition-transform motion-safe:duration-500 motion-safe:group-hover:scale-105"
        />
        {personalized && result && (
          <span className="absolute top-2 right-2 bg-[#0B1F3A]/90 text-white text-xs font-semibold px-2 py-0.5 rounded-full">
            {result.finalScore}/100
          </span>
        )}
      </span>
      <span className="block mt-2 font-semibold text-[#F5F2EA] truncate">{dest.name}</span>
      <span className="block text-sm text-[#F5F2EA]/60 truncate">{dest.country}</span>
      <span className="flex items-center flex-wrap gap-x-2 gap-y-1 mt-1 text-xs text-[#F5F2EA]/70">
        <span>{dest.min_days}–{dest.max_days} days</span>
        {tags && tags.map((t) => (
          <span key={t} className="bg-white/10 px-1.5 py-0.5 rounded text-[10px]">{t}</span>
        ))}
      </span>
      <span className="block mt-1 text-sm text-[#2EC4B6] truncate">{reason}</span>
      {personalized && prac && (
        <span className="block mt-1 text-xs text-[#F5F2EA]/65">
          {result.matchLabel} · About {prac.oneWayHours} hours one way · {prac.usableDestinationDays} days there
        </span>
      )}
    </button>
  );
}