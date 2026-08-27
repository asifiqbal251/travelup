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
import { Trash2, Plane, ArrowRight } from "lucide-react";

const FIT_BADGE = {
  Practical: { label: "Good fit", cls: "bg-teal text-cinema" },
  Manageable: { label: "Manageable", cls: "bg-ink text-on-dark" },
  Stretch: { label: "Travel-heavy", cls: "bg-coral text-white" },
  "Poor practical fit": { label: "Poor fit", cls: "bg-destructive text-destructive-foreground" }
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
        <Plane className="w-10 h-10 text-teal mx-auto mb-4" />
        <h1 className="font-display text-2xl font-bold mb-2 text-ink">No saved trips yet</h1>
        <p className="text-muted-foreground mb-6">
          You can save any itinerary from its trip page to view it again here later.
        </p>
        <Button asChild className="bg-coral hover:bg-coral/90 text-white min-h-11">
          <Link to="/questionnaire">Find my trip</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <h1 ref={headingRef} tabIndex={-1} className="font-display text-3xl font-bold text-ink mb-4 focus:outline-none">
        Saved trips
      </h1>

      <div className="flex items-start gap-3 mb-8 text-sm text-muted-foreground">
        <Plane className="w-5 h-5 text-teal flex-shrink-0 mt-0.5" />
        <p>
          Saved trips stay on this browser and device. They are not synced to an account.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {trips.map((t) => {
          const fit = FIT_BADGE[(t.travelFit && t.travelFit.level) || "Practical"];
          const checked = (t.packing && t.packing.checkedItemIds) || [];
          const groups = (t.packing && t.packing.groups) || [];
          const custom = (t.packing && t.packing.customItems) || [];
          const total = groups.reduce((n, g) => n + (g.items || []).length, 0) + custom.length;
          const progress = total ? Math.round((checked.length / total) * 100) : null;
          const d = t.destination || {};
          return (
            <article
              key={t.id}
              ref={(el) => { cardRefs.current[t.id] = el; }}
              tabIndex={-1}
              className="relative rounded-3xl overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-teal motion-safe:transition-transform motion-safe:duration-200 motion-safe:hover:-translate-y-1 group"
            >
              <Link
                to={`/saved-trips/${t.id}`}
                aria-label={`Open saved trip to ${d.name || "destination"}`}
                className="block"
              >
                <span className="relative block w-full aspect-[4/5] overflow-hidden bg-card">
                  <Image
                    src={d.imageUrl}
                    alt=""
                    fittingType="fill"
                    fallbackSrc={TRAVEL_FALLBACK_IMAGE}
                    className="w-full h-full motion-safe:transition-transform motion-safe:duration-300 motion-safe:group-hover:scale-[1.04] motion-safe:group-focus-visible:scale-[1.04]"
                  />
                  <span
                    className="absolute inset-x-0 bottom-0 h-2/3"
                    style={{
                      background:
                        "linear-gradient(to top, rgba(7,24,39,0.92) 0%, rgba(7,24,39,0.5) 45%, rgba(7,24,39,0) 100%)"
                    }}
                  />
                  <span className={`glass absolute top-3 left-3 text-[11px] font-semibold px-2.5 py-1 rounded-full ${fit.cls}`}>
                    {fit.label}
                  </span>
                  <span className="absolute inset-x-0 bottom-0 p-5 text-on-dark">
                    <span className="block font-display text-xl font-bold leading-tight">{d.name}</span>
                    <span className="block text-sm text-on-dark/85 mt-1">
                      From {(t.preferences && t.preferences.departureCity) || "home"} · {t.preferences && t.preferences.travelDays}-day trip
                    </span>
                    <span className="flex items-center gap-2 mt-2">
                      <span className="text-xs text-on-dark/75">Updated {formatDate(t.updatedAt)}</span>
                      <span className="ml-auto inline-flex items-center text-xs font-semibold text-teal">
                        Open trip <ArrowRight className="w-3.5 h-3.5 ml-1" />
                      </span>
                    </span>
                    {progress != null && (
                      <span className="mt-3 block h-1 w-full overflow-hidden rounded-full bg-white/20" aria-label={`${progress}% packed`}>
                        <span className="block h-full bg-teal" style={{ width: `${progress}%` }} />
                      </span>
                    )}
                  </span>
                </span>
              </Link>
              <button
                onClick={() => setDeleteId(t.id)}
                className="glass absolute top-3 right-3 h-9 w-9 grid place-items-center rounded-full text-on-dark hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
                aria-label={`Delete saved trip to ${d.name}`}
              >
                <Trash2 className="w-4 h-4" />
              </button>
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