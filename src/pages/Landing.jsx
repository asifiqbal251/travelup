import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Compass, MapPinned, Bookmark, LifeBuoy, Gauge, UserX, ArrowRight, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import { getPrefs, getSavedTrips } from "@/lib/storage";
import { rankDestinations } from "@/lib/scoring";
import LandingHeroSlideshow from "@/components/LandingHeroSlideshow";
import DestinationRail from "@/components/discovery/DestinationRail";
import DiscoveryDestinationCard from "@/components/discovery/DiscoveryDestinationCard";
import SavedTripRail from "@/components/discovery/SavedTripRail";
import DestinationPreviewDialog from "@/components/discovery/DestinationPreviewDialog";
import DiscoveryRailSkeleton from "@/components/discovery/DiscoveryRailSkeleton";
import JourneyPathway from "@/components/JourneyPathway";
import {
  isReturningPrefs,
  returningContext,
  displayMonthName,
  greatThisMonth,
  shortTrips,
  citiesWithStory,
  natureAndReset,
  topTravelFits,
  easyEscapes,
  becauseYouLike,
  strongInMonth,
  savedTripsRail
} from "@/lib/discoveryCollections";

const STEPS = [
  { icon: Compass, title: "Discover", text: "Answer a short questionnaire and get the best practical matches from 54 curated destinations." },
  { icon: MapPinned, title: "Plan", text: "Compare Travel Fit, then open a practical day-by-day itinerary and packing list." },
  { icon: Bookmark, title: "Save", text: "Store multiple itinerary snapshots locally and reopen them from saved trips." },
  { icon: LifeBuoy, title: "Travel companion", text: "Practical on-the-ground support after you arrive.", coming: true }
];

const TRUST = [
  { icon: MapPinned, label: "54 curated destinations" },
  { icon: Gauge, label: "Practicality-aware matching" },
  { icon: UserX, label: "No account required" }
];

export default function Landing() {
  const [destinations, setDestinations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [preview, setPreview] = useState({ item: null, open: false });

  const [prefs] = useState(() => getPrefs());
  const [saved] = useState(() => getSavedTrips());
  const returning = isReturningPrefs(prefs);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    base44.entities.Destination.list()
      .then((list) => {
        if (cancelled) return;
        setDestinations(list);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError(true);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const retry = () => setReloadKey((k) => k + 1);

  const openPreview = (item) => setPreview({ item, open: true });
  const closePreview = () => setPreview((p) => ({ ...p, open: false }));

  const { rails, savedItems } = useMemo(() => {
    if (loading || error || !destinations.length) return { rails: [], savedItems: [] };
    if (returning) {
      const ranked = rankDestinations(destinations, prefs);
      const savedItems = savedTripsRail(saved);
      const monthName = displayMonthName(prefs);
      const liked = (prefs.interests || []).slice(0, 2).map((i) => String(i).toLowerCase()).join(" and ");
      const rails = [
        { id: "top-fits", title: `Top Travel Fits for your ${prefs.travelDays}-day trip`, items: topTravelFits(ranked, prefs), personalized: true },
        { id: "easy-escapes", title: `Easy escapes from ${prefs.departureCity}`, items: easyEscapes(ranked, prefs), personalized: true },
        { id: "because-you-like", title: `Because you like ${liked}`, items: becauseYouLike(ranked, prefs), personalized: true },
        { id: "strong-in-month", title: `Strong in ${monthName}`, items: strongInMonth(ranked, prefs), personalized: true }
      ].filter((r) => r.items.length > 0);
      return { rails, savedItems };
    }
    const rails = [
      { id: "great-month", title: "Great this month", items: greatThisMonth(destinations), personalized: false },
      { id: "short-trips", title: "Short trips, big payoff", items: shortTrips(destinations), personalized: false },
      { id: "cities", title: "Cities with a story", items: citiesWithStory(destinations), personalized: false },
      { id: "nature", title: "Nature & reset", items: natureAndReset(destinations), personalized: false }
    ].filter((r) => r.items.length > 0);
    return { rails, savedItems: [] };
  }, [destinations, prefs, saved, loading, error, returning]);

  return (
    <div className="bg-cinema text-on-dark">
      {/* 1. Cinematic hero slideshow */}
      <LandingHeroSlideshow />

      {/* 2. Returning-traveller context strip (glass, sits just under the hero) */}
      {returning && (
        <div className="sticky top-16 z-30">
          <div className="glass">
            <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
              <p className="text-sm text-on-dark/90">
                <span className="text-teal font-semibold">Your Travel Fit:</span>{" "}
                {returningContext(prefs)}
              </p>
              <Button
                asChild
                variant="outline"
                size="sm"
                className="border-white/20 text-on-dark hover:bg-white/10 hover:text-on-dark min-h-9 focus-visible:!ring-on-dark focus-visible:ring-offset-cinema"
              >
                <Link to="/questionnaire">Update preferences</Link>
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 3. Saved-trip continuation rail */}
      {returning && savedItems.length > 0 && (
        <div className="pt-10">
          <SavedTripRail items={savedItems} />
        </div>
      )}

      {/* 4. Destination rails */}
      <div className="pt-10 pb-4">
        {loading && (
          <>
            <DiscoveryRailSkeleton title="Great this month" />
            <DiscoveryRailSkeleton title="Short trips, big payoff" />
          </>
        )}

        {error && (
          <div className="max-w-5xl mx-auto px-4 py-12 text-center">
            <p className="text-on-dark/85 mb-4">We couldn’t load destinations right now.</p>
            <Button
              onClick={retry}
              className="bg-coral hover:bg-coral/90 text-ink min-h-11 focus-visible:!ring-on-dark focus-visible:ring-offset-cinema"
            >
              <RotateCw className="w-4 h-4 mr-2" /> Try again
            </Button>
          </div>
        )}

        {!loading && !error && rails.map((r) => (
          <DestinationRail
            key={r.id}
            title={r.title}
            id={r.id}
            items={r.items}
            getKey={(item) => String(item.dest.id || "")}
            renderItem={(item, i) => (
              <DiscoveryDestinationCard
                item={item}
                onOpen={openPreview}
                personalized={r.personalized}
                featured={i === 0}
              />
            )}
          />
        ))}
      </div>

      {/* 5. The TravelUp journey */}
      <section className="max-w-5xl mx-auto px-4 py-16">
        <h2 className="font-display text-2xl sm:text-3xl font-bold mb-2 text-center text-on-dark">
          The TravelUp journey
        </h2>
        <p className="text-sm text-muted-dark text-center mb-10 max-w-xl mx-auto">
          From a few quick answers to a practical, saveable plan — all on this browser.
        </p>
        <JourneyPathway steps={STEPS} />
        <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
          {TRUST.map((t) => (
            <div key={t.label} className="inline-flex items-center gap-2 text-sm text-on-dark/80">
              <t.icon className="w-4 h-4 text-on-dark/70" aria-hidden="true" /> {t.label}
            </div>
          ))}
        </div>
      </section>

      {/* 6. Final Travel Fit CTA */}
      <section className="bg-surface-dark border-t border-white/10">
        <div className="max-w-5xl mx-auto px-4 py-16 text-center">
          <h2 className="font-display text-2xl sm:text-3xl font-bold mb-3 text-on-dark">
            Ready to find your Travel Fit?
          </h2>
          <p className="text-on-dark/75 mb-6 max-w-xl mx-auto">
            No account required — your answers and saved trips stay on this browser and device.
          </p>
          <Button
            asChild
            size="lg"
            className="bg-coral hover:bg-coral/90 text-ink min-h-12 px-8 focus-visible:!ring-on-dark focus-visible:ring-offset-cinema"
          >
            <Link to="/questionnaire">
              Find my Travel Fit <ArrowRight className="w-4 h-4 ml-2" />
            </Link>
          </Button>
        </div>
      </section>

      {/* Shared destination preview dialog */}
      <DestinationPreviewDialog
        item={preview.item}
        open={preview.open}
        onOpenChange={(o) => {
          if (!o) closePreview();
        }}
        returning={returning}
      />
    </div>
  );
}