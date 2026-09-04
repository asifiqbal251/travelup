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
import TravelFitRing from "@/components/TravelFitRing";
import { Trash2, Plane, ArrowRight, AlertTriangle } from "lucide-react";
import { flagForCountry } from "@/lib/countryFlag";
import GuestSaveBanner from "@/components/guest/GuestSaveBanner";
import { useAccountIdentity, deleteTripFromAccount } from "@/lib/auth";
import { migrateGuestTripsToAccount } from "@/lib/tripMigration";

const FIT_BADGE = {
  Practical: { label: "Good fit", cls: "bg-teal text-cinema" },
  Manageable: { label: "Manageable", cls: "bg-ink text-on-dark" },
  Stretch: { label: "Travel-heavy", cls: "bg-ink/80 text-on-dark" },
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
  const identity = useAccountIdentity();
  const { isSignedIn } = identity;
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [accountError, setAccountError] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const headingRef = useRef(null);
  const cardRefs = useRef({});

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      if (!isSignedIn) {
        if (!cancelled) {
          setTrips(getSavedTrips());
          setAccountError(false);
          setLoading(false);
        }
        return;
      }
      // Reconcile first (moves any not-yet-migrated local trip into the
      // account, deduped by fingerprint against what's already there), then
      // read the reconciled account list back.
      const res = await migrateGuestTripsToAccount(identity);
      if (cancelled) return;
      if (res.accountFetchFailed) {
        // Degrade gracefully: never show the "no saved trips" empty state on
        // a network error -- that would read as "your trips are gone."
        // Local trips (if any survived un-migrated) are still shown.
        setTrips(getSavedTrips());
        setAccountError(true);
      } else {
        // Merge: account trips (canonical) plus any local trip whose
        // fingerprint genuinely failed to migrate just now (e.g. offline
        // mid-write) -- so a failure never silently drops a trip from view.
        const accountFingerprints = new Set(res.accountTrips.map((t) => t.fingerprint));
        const stillLocalOnly = getSavedTrips().filter((t) => !accountFingerprints.has(t.fingerprint));
        const merged = [...res.accountTrips, ...stillLocalOnly].sort((a, b) =>
          String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""))
        );
        setTrips(merged);
        setAccountError(false);
      }
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [isSignedIn, identity.email]);

  const tripToDelete = trips.find((t) => t.id === deleteId) || null;

  const confirmDelete = async () => {
    if (!deleteId) return;
    const id = deleteId;
    const idx = trips.findIndex((t) => t.id === id);
    const trip = tripToDelete;
    // Account-backed trips must be deleted from the account too, or they
    // reappear the next time this device (or another one) reads the account.
    if (trip && trip.accountRecordId) {
      await deleteTripFromAccount(trip.accountRecordId);
    }
    deleteSavedTrip(id); // no-op if this id has no local copy
    setDeleteId(null);
    const next = trips.filter((t) => t.id !== id);
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

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <div className="w-8 h-8 mx-auto border-4 border-muted border-t-ink rounded-full animate-spin" />
      </div>
    );
  }

  if (trips.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <Plane className="w-10 h-10 text-muted-foreground mx-auto mb-4" />
        <h1 className="font-display text-2xl font-bold mb-2 text-ink">No saved trips yet</h1>
        <p className="text-muted-foreground mb-6">
          You can save any itinerary from its trip page to view it again here later.
        </p>
        {accountError && (
          <p className="flex items-center justify-center gap-2 text-sm text-destructive mb-6">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            Couldn't reach your account just now. If you've saved trips before, they should still
            be there -- try reloading.
          </p>
        )}
        <Button asChild className="wn-cta-dark min-h-11">
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

      {accountError && (
        <div className="flex items-start gap-3 mb-4 text-sm text-destructive">
          <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <p>
            Couldn't reach your account just now, so this may not include every trip you've saved
            elsewhere. Showing what's available on this device.
          </p>
        </div>
      )}

      <div className="flex items-start gap-3 mb-6 text-sm text-muted-foreground">
        <Plane className="w-5 h-5 text-muted-foreground flex-shrink-0 mt-0.5" />
        <p>
          {isSignedIn
            ? "Saved trips are synced to your account and available on any device you sign in on."
            : "Saved trips stay on this browser and device. Create a free account to access them anywhere."}
        </p>
      </div>

      <GuestSaveBanner className="mb-8" />

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
              className="relative rounded-3xl overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-ink motion-safe:transition-transform motion-safe:duration-200 motion-safe:hover:-translate-y-1 group"
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
                        "linear-gradient(to top, rgba(7,24,39,0.86) 0%, rgba(7,24,39,0.45) 42%, rgba(7,24,39,0) 100%)"
                    }}
                  />
                  {typeof t.score === "number" ? (
                    <span className="absolute top-3 left-3">
                      <TravelFitRing score={t.score} size="md" />
                    </span>
                  ) : (
                    <span className="glass-badge absolute top-3 left-3 px-2.5 py-2 rounded-2xl text-left">
                      <span className="block text-[10px] uppercase tracking-wide text-on-dark/70 leading-none">Travel Fit</span>
                      <span className={`inline-flex mt-1.5 text-sm font-bold px-2.5 py-0.5 rounded-full ${fit.cls}`}>
                        {fit.label}
                      </span>
                    </span>
                  )}
                  <span className="absolute inset-x-0 bottom-0 p-5 text-on-dark">
                    <span className="block font-display text-xl font-bold leading-tight">{d.name}</span>
                    <span className="block text-sm text-on-dark/85 mt-1">
                      {flagForCountry(d.country) && <span aria-hidden="true">{flagForCountry(d.country)} </span>}
                      {d.country} · From {(t.preferences && t.preferences.departureCity) || "home"} · {t.preferences && t.preferences.travelDays}-day trip
                    </span>
                    <span className="flex items-center gap-2 mt-2">
                      <span className="text-xs text-on-dark/75">Updated {formatDate(t.updatedAt)}</span>
                      <span className="ml-auto inline-flex items-center text-xs font-semibold text-on-dark">
                        Open trip <ArrowRight className="w-3.5 h-3.5 ml-1" />
                      </span>
                    </span>
                    {progress != null && (
                      <span className="mt-3 block h-1 w-full overflow-hidden rounded-full bg-white/20" aria-label={`${progress}% packed`}>
                        <span className="block h-full bg-on-dark" style={{ width: `${progress}%` }} />
                      </span>
                    )}
                  </span>
                </span>
              </Link>
              <button
                onClick={() => setDeleteId(t.id)}
                className="glass-badge absolute top-3 right-3 h-11 w-11 grid place-items-center rounded-full text-on-dark hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-on-dark"
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