import { Link } from "react-router-dom";
import { Bookmark } from "lucide-react";
import { Image } from "@/components/ui/image";
import { TRAVEL_FALLBACK_IMAGE } from "@/lib/fallbackImage";
import DestinationRail from "@/components/discovery/DestinationRail";

// Saved-trip continuation rail using the same image-led visual language as the
// Discovery Home. Opening a card navigates to the saved detail page using the
// immutable snapshot — it never regenerates anything. A subtle packing-progress
// bar is shown over the image when progress data exists.
function SavedTripCard({ trip }) {
  const d = trip.destination || {};
  const checked = (trip.packing && trip.packing.checkedItemIds) || [];
  const groups = (trip.packing && trip.packing.groups) || [];
  const custom = (trip.packing && trip.packing.customItems) || [];
  const total = groups.reduce((n, g) => n + (g.items || []).length, 0) + custom.length;
  const progress = total ? Math.round((checked.length / total) * 100) : null;

  // Uniform dimensions: every saved-trip card in the rail uses the same width,
  // aspect ratio and crop — no first-card enlargement.
  const width = "w-[78vw] max-w-[300px] sm:w-[300px] lg:w-[320px]";

  return (
    <Link
      to={`/saved-trips/${trip.id}`}
      aria-label={`Continue saved trip to ${d.name || "destination"}`}
      className={`group block ${width} text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-on-dark focus-visible:ring-offset-2 focus-visible:ring-offset-cinema motion-safe:transition-transform motion-safe:duration-200 motion-safe:ease-out motion-safe:hover:-translate-y-1 motion-safe:focus-visible:-translate-y-1`}
    >
      <span className="relative block w-full aspect-[4/5] overflow-hidden rounded-2xl bg-cinema/40">
        <Image
          src={d.imageUrl}
          alt=""
          fittingType="fill"
          fallbackSrc={TRAVEL_FALLBACK_IMAGE}
          loading="lazy"
          className="w-full h-full motion-safe:transition-transform motion-safe:duration-200 motion-safe:ease-out motion-safe:group-hover:scale-[1.04] motion-safe:group-focus-visible:scale-[1.04]"
        />
        <span
          className="absolute inset-x-0 bottom-0 h-2/3 rounded-b-2xl"
          style={{
            background:
              "linear-gradient(to top, rgba(7,24,39,0.86) 0%, rgba(7,24,39,0.45) 42%, rgba(7,24,39,0) 100%)"
          }}
        />
        <span className="glass-badge absolute top-3 left-3 inline-flex items-center gap-1 text-on-dark text-[10px] font-semibold px-2 py-1 rounded-full">
          <Bookmark className="w-3 h-3" /> Saved
        </span>
        <span className="absolute inset-x-0 bottom-0 p-4">
          <span className="block font-display text-lg font-bold text-on-dark leading-tight">
            {d.name || "Saved trip"}
          </span>
          <span className="block text-sm text-on-dark/80 mt-1">
            From {(trip.preferences && trip.preferences.departureCity) || "home"} · {trip.preferences && trip.preferences.travelDays}-day trip
          </span>
          {progress != null && (
            <span className="mt-2 block h-1 w-full overflow-hidden rounded-full bg-white/20" aria-hidden="true">
              <span className="block h-full bg-on-dark" style={{ width: `${progress}%` }} />
            </span>
          )}
        </span>
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