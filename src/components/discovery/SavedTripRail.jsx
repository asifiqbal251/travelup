import { Link } from "react-router-dom";
import { Bookmark } from "lucide-react";
import { Image } from "@/components/ui/image";
import { TRAVEL_FALLBACK_IMAGE } from "@/lib/fallbackImage";
import DestinationRail from "@/components/discovery/DestinationRail";

// Saved-trip continuation rail. Opening a card navigates to the saved detail
// page using the immutable snapshot — it never regenerates anything.
function SavedTripCard({ trip }) {
  const d = trip.destination || {};
  return (
    <Link
      to={`/saved-trips/${trip.id}`}
      aria-label={`Continue saved trip to ${d.name || "destination"}`}
      className="group block w-[230px] sm:w-[290px] lg:w-[300px] text-left rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2EC4B6] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0B1F3A]"
    >
      <span className="block relative aspect-video w-full overflow-hidden rounded-lg bg-[#0B1F3A]/40">
        <Image
          src={d.imageUrl}
          alt=""
          fittingType="fill"
          fallbackSrc={TRAVEL_FALLBACK_IMAGE}
          loading="lazy"
          className="w-full h-full motion-safe:transition-transform motion-safe:duration-500 motion-safe:group-hover:scale-105"
        />
        <span className="absolute top-2 left-2 inline-flex items-center gap-1 bg-[#0B1F3A]/85 text-white text-[10px] font-semibold px-2 py-1 rounded-full">
          <Bookmark className="w-3 h-3" /> Saved
        </span>
      </span>
      <span className="block mt-2 font-semibold text-[#F5F2EA] truncate">{d.name || "Saved trip"}</span>
      <span className="block text-sm text-[#F5F2EA]/60 truncate">{d.country || ""}</span>
      <span className="block text-xs text-[#F5F2EA]/70 mt-1">
        {d.minDays != null && d.maxDays != null ? `${d.minDays}–${d.maxDays} days` : ""}
        {trip.preferences && trip.preferences.travelDays ? ` · ${trip.preferences.travelDays}-day plan` : ""}
      </span>
    </Link>
  );
}

export default function SavedTripRail({ items }) {
  return (
    <DestinationRail
      title="Continue your saved trips"
      id="saved-trips"
      items={items}
      getKey={(item) => String(item.trip.id || "")}
      renderItem={(item) => <SavedTripCard trip={item.trip} />}
    />
  );
}