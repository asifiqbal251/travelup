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
  { icon: Bookmark, title: "Save", text: "Store multiple itinerary snapshots locally and reopen them from Saved Trips." },
  { icon: LifeBuoy, title: "Travel Companion", text: "Practical on-the-ground support after you arrive.", coming: true }
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
  const [preview, setPreview] = useState({ dest: null, open: false });

  // Read prefs and saved trips exactly once per mount.
  const [prefs] = useState(() => getPrefs());
  const [saved] = useState(() => getSavedTrips());
  const returning = isReturningPrefs(prefs);

  // Fetch the catalogue once per mount (and once per user retry). The hero, CTA
  // and journey render immediately and never block on this request.
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

  const openPreview = (dest) => setPreview({ dest, open: true });
  const closePreview = () => setPreview((p) => ({ ...p, open: false }));

  // Build all rails deterministically from the loaded data. rankDestinations is
  // called once for the returning state and every personalized rail is derived
  // from that single eligible ranked array.
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
    <div className="bg-[#0B1F3A] text-[#F5F2EA]">
      {/* 1. Cinematic hero slideshow (unchanged component) */}
      <LandingHeroSlideshow />

      {/* 2. Returning-traveller context strip */}
      {returning && (
        <div className="border-b border-white/10 bg-[#0B1F3A]">
          <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
            <p className="text-sm text-[#F5F2EA]/85">
              <span className="text-[#2EC4B6] font-semibold">Your Travel Fit:</span>{" "}
              {returningContext(prefs)}
            </p>
            <Button
              asChild
              variant="outline"
              size="sm"
              className="border-white/25 text-white hover:bg-white/10 hover:text-white min-h-9"
            >
              <Link to="/questionnaire">Update preferences</Link>
            </Button>
          </div>
        </div>
      )}

      {/* 3. Saved-trip continuation rail */}
      {returning && savedItems.length > 0 && (
        <div className="pt-6">
          <SavedTripRail items={savedItems} />
        </div>
      )}

      {/* 4. Destination rails */}
      <div className="pt-6">
        {loading && (
          <>
            <DiscoveryRailSkeleton title="Great this month" />
            <DiscoveryRailSkeleton title="Short trips, big payoff" />
          </>
        )}

        {error && (
          <div className="max-w-5xl mx-auto px-4 py-12 text-center">
            <p className="text-[#F5F2EA]/85 mb-4">We couldn’t load destinations right now.</p>
            <Button
              onClick={retry}
              className="bg-[#FF6B5B] hover:bg-[#FF6B5B]/90 text-white min-h-11"
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
            renderItem={(item) => (
              <DiscoveryDestinationCard item={item} onOpen={openPreview} personalized={r.personalized} />
            )}
          />
        ))}
      </div>

      {/* 5. The TravelUp journey (compact, dark) */}
      <section className="max-w-5xl mx-auto px-4 py-14">
        <h2 className="text-2xl font-semibold mb-2 text-center text-[#F5F2EA]">The TravelUp journey</h2>
        <p className="text-sm text-[#F5F2EA]/65 text-center mb-8 max-w-xl mx-auto">
          From a few quick answers to a practical, saveable plan — all on this browser.
        </p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {STEPS.map((s) => (
            <div key={s.title} className="bg-white/5 rounded-2xl p-6 border border-white/10">
              <div className="w-11 h-11 rounded-xl bg-[#2EC4B6]/15 text-[#2EC4B6] flex items-center justify-center mb-4">
                <s.icon className="w-5 h-5" />
              </div>
              <div className="flex items-center gap-2 mb-2">
                <h3 className="font-semibold text-[#F5F2EA]">{s.title}</h3>
                {s.coming && (
                  <span className="text-[10px] font-semibold uppercase tracking-wide bg-[#E8A33D]/20 text-[#E8A33D] px-2 py-0.5 rounded-full">
                    Coming later
                  </span>
                )}
              </div>
              <p className="text-sm text-[#F5F2EA]/70">{s.text}</p>
            </div>
          ))}
        </div>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
          {TRUST.map((t) => (
            <div key={t.label} className="inline-flex items-center gap-2 text-sm text-[#F5F2EA]/80">
              <t.icon className="w-4 h-4 text-[#2EC4B6]" aria-hidden="true" /> {t.label}
            </div>
          ))}
        </div>
      </section>

      {/* 6. Final Travel Fit CTA */}
      <section className="bg-[#0E2A4A] border-t border-white/10">
        <div className="max-w-5xl mx-auto px-4 py-14 text-center">
          <h2 className="text-2xl font-semibold mb-3 text-[#F5F2EA]">Ready to find your Travel Fit?</h2>
          <p className="text-[#F5F2EA]/75 mb-6 max-w-xl mx-auto">
            No account required — your answers and saved trips stay on this browser and device.
          </p>
          <Button
            asChild
            size="lg"
            className="bg-[#FF6B5B] hover:bg-[#FF6B5B]/90 text-white min-h-12 px-8"
          >
            <Link to="/questionnaire">
              Find my Travel Fit <ArrowRight className="w-4 h-4 ml-2" />
            </Link>
          </Button>
        </div>
      </section>

      {/* Shared destination preview dialog */}
      <DestinationPreviewDialog
        dest={preview.dest}
        open={preview.open}
        onOpenChange={(o) => {
          if (!o) closePreview();
        }}
        returning={returning}
      />
    </div>
  );
}