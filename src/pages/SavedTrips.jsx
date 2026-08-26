import { useEffect, useState, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Image } from "@/components/ui/image";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogFooter,
  AlertDialogTitle, AlertDialogDescription, AlertDialogAction, AlertDialogCancel
} from "@/components/ui/alert-dialog";
import { getSavedTrips, deleteSavedTrip } from "@/lib/storage";
import { TRAVEL_FALLBACK_IMAGE } from "@/lib/fallbackImage";
import { ArrowRight, Trash2, Plane } from "lucide-react";

const FIT_BADGE = {
  Practical: { label: "Good fit", cls: "bg-[#2EC4B6] text-white" },
  Manageable: { label: "Manageable", cls: "bg-[#0B1F3A] text-white" },
  Stretch: { label: "Travel-heavy", cls: "bg-[#E8A33D] text-white" },
  "Poor practical fit": { label: "Poor fit", cls: "bg-[#FF6B5B] text-white" }
};

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric", month: "short", day: "numeric"
    });
  } catch {
    return "";
  }
}

export default function SavedTrips() {
  const navigate = useNavigate();
  const [trips, setTrips] = useState([]);
  const [deleteId, setDeleteId] = useState(null);
  const headingRef = useRef(null);
  const cardRefs = useRef({});

  useEffect(() => {
    setTrips(getSavedTrips());
  }, []);

  const tripToDelete = trips.find((t) => t.id === deleteId) || null;

  const confirmDelete = () => {
    if (!deleteId) return;
    const id = deleteId;
    const idx = trips.findIndex((t) => t.id === id);
    deleteSavedTrip(id);
    setDeleteId(null);
    const next = getSavedTrips();
    setTrips(next);
    // Restore focus to the next surviving card, or the page heading if none remain.
    setTimeout(() => {
      if (next.length === 0) {
        headingRef.current?.focus();
        return;
      }
      const target = next[Math.min(idx, next.length - 1)];
      if (target && cardRefs.current[target.id]) {
        cardRefs.current[target.id].focus();
      } else {
        headingRef.current?.focus();
      }
    }, 0);
  };

  if (trips.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <Plane className="w-10 h-10 text-[#2EC4B6] mx-auto mb-4" />
        <h1 className="text-2xl font-semibold mb-2">No saved trips yet</h1>
        <p className="text-[#0B1F3A]/70 mb-6">
          You can save any itinerary from its trip page to view it again here later.
        </p>
        <Button asChild className="bg-[#FF6B5B] hover:bg-[#FF6B5B]/90 text-white min-h-11">
          <Link to="/questionnaire">Find My Trip</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 ref={headingRef} tabIndex={-1} className="text-2xl font-semibold mb-4 focus:outline-none">
        Saved Trips
      </h1>

      <div className="bg-[#0B1F3A]/5 border border-[#2EC4B6]/30 rounded-xl p-4 mb-6 flex gap-3">
        <Plane className="w-5 h-5 text-[#0B1F3A] flex-shrink-0 mt-0.5" />
        <p className="text-sm text-[#0B1F3A]/75">
          Saved trips stay on this browser and device. They are not synced to an account.
        </p>
      </div>

      <div className="space-y-4">
        {trips.map((t) => {
          const fit = FIT_BADGE[(t.travelFit && t.travelFit.level) || "Practical"];
          return (
            <article
              key={t.id}
              ref={(el) => { cardRefs.current[t.id] = el; }}
              tabIndex={-1}
              className="bg-white rounded-2xl border border-[#E6E2D8] shadow-sm overflow-hidden focus:outline-none focus:ring-2 focus:ring-[#2EC4B6]"
            >
              <div className="flex flex-col sm:flex-row">
                <div className="relative h-40 sm:w-44 sm:h-auto flex-shrink-0">
                  <Image
                    src={t.destination.imageUrl}
                    alt={`${t.destination.name}, ${t.destination.country}`}
                    fittingType="fill"
                    fallbackSrc={TRAVEL_FALLBACK_IMAGE}
                    className="w-full h-full"
                  />
                </div>
                <div className="p-4 flex-1 min-w-0">
                  <h2 className="font-semibold text-lg">{t.destination.name}</h2>
                  <p className="text-sm text-[#0B1F3A]/60">{t.destination.country} · {t.destination.region}</p>
                  <p className="text-sm text-[#0B1F3A]/70 mt-1">
                    From {t.preferences.departureCity || "home"} · {t.preferences.travelDays} days
                  </p>
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${fit.cls}`}>{fit.label}</span>
                    <span className="text-xs text-[#0B1F3A]/60">Updated {formatDate(t.updatedAt)}</span>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-4">
                    <Button
                      onClick={() => navigate(`/saved-trips/${t.id}`)}
                      className="bg-[#0B1F3A] hover:bg-[#0B1F3A]/90 min-h-10"
                    >
                      Open trip <ArrowRight className="w-4 h-4 ml-1" />
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setDeleteId(t.id)}
                      className="min-h-10"
                      aria-label={`Delete saved trip to ${t.destination.name}`}
                    >
                      <Trash2 className="w-4 h-4 mr-1" /> Delete
                    </Button>
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => { if (!o) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this saved trip?</AlertDialogTitle>
            <AlertDialogDescription>
              {tripToDelete
                ? `"${tripToDelete.destination.name}" will be removed from your saved trips. This cannot be undone.`
                : "This saved trip will be removed. This cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Delete trip</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}