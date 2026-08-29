import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogFooter,
  AlertDialogTitle, AlertDialogDescription, AlertDialogAction, AlertDialogCancel
} from "@/components/ui/alert-dialog";
import { base44 } from "@/api/base44Client";
import {
  getSelectedDestinationId, getPrefs, tripFingerprint, seedActiveTripPacking,
  setActiveTripPacking, findSavedTripByFingerprint, getSavedTripCount,
  saveNewTrip, replaceSavedTrip, buildTripSnapshot, normalizeDestinationDisplay,
  MAX_SAVED_TRIPS
} from "@/lib/storage";
import { generateItinerary } from "@/lib/itinerary";
import { generatePackingList } from "@/lib/packing";
import { assessPracticality } from "@/lib/practicality";
import { scoreWithPracticality } from "@/lib/scoring";
import TripView, { TripHeader } from "@/components/TripView";
import { toast } from "@/components/ui/use-toast";
import { Bookmark, BookmarkCheck } from "lucide-react";

const QUOTA_MSG = "This browser is out of space for another saved trip. Delete an older saved trip and try again.";
const GENERIC_MSG = "We couldn't save this itinerary in this browser. Check your browser storage settings and try again.";

export default function TripDetail() {
  const navigate = useNavigate();
  const [dest, setDest] = useState(null);
  const [prefs, setPrefsState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [packingState, setPackingState] = useState({ checkedItemIds: [], customItems: [] });
  const [alreadySaved, setAlreadySaved] = useState(false);
  const [dupOpen, setDupOpen] = useState(false);
  const [limitOpen, setLimitOpen] = useState(false);

  useEffect(() => {
    const id = getSelectedDestinationId();
    const p = getPrefs();
    if (!id || !p) {
      navigate("/results");
      return;
    }
    setPrefsState(p);
    base44.entities.Destination.get(id)
      .then((d) => {
        setDest(d);
        const fp = tripFingerprint(p, d.id);
        setPackingState(seedActiveTripPacking(fp, d.id));
        setAlreadySaved(!!findSavedTripByFingerprint(fp));
        setLoading(false);
      })
      .catch(() => { navigate("/results"); });
  }, [navigate]);

  if (loading) {
    return (
      <div className="min-h-[100dvh] bg-wn-page text-wn-text-2">
        <div className="max-w-2xl mx-auto px-4 py-20 text-center">
          <div className="w-8 h-8 mx-auto border-4 border-wn-line border-t-wn-cyan rounded-full animate-spin mb-4" />
          Building your trip…
        </div>
      </div>
    );
  }

  const display = normalizeDestinationDisplay(dest);
  const itinerary = generateItinerary(dest, prefs);
  const packingGroups = generatePackingList(dest, prefs);
  const travelFit = assessPracticality(dest, prefs);
  const score = scoreWithPracticality(dest, prefs, travelFit).finalScore;
  const fingerprint = tripFingerprint(prefs, dest.id);

  const persistPacking = (next) => {
    setPackingState(next);
    setActiveTripPacking(fingerprint, next);
  };
  const handleToggle = (id) => {
    const checkedItemIds = packingState.checkedItemIds.includes(id)
      ? packingState.checkedItemIds.filter((x) => x !== id)
      : [...packingState.checkedItemIds, id];
    persistPacking({ ...packingState, checkedItemIds });
  };
  const handleAdd = (label, category) => {
    const id = `custom-${Date.now()}`;
    persistPacking({
      checkedItemIds: [...packingState.checkedItemIds, id],
      customItems: [...packingState.customItems, { id, label, category }]
    });
  };
  const handleRemove = (id) => {
    persistPacking({
      checkedItemIds: packingState.checkedItemIds.filter((x) => x !== id),
      customItems: packingState.customItems.filter((c) => c.id !== id)
    });
  };
  const handleReset = () => persistPacking({ checkedItemIds: [], customItems: [] });

  const reportSaveResult = (res) => {
    if (res.ok) {
      setAlreadySaved(true);
      toast({ title: "Itinerary saved" });
    } else if (res.reason === "quota") {
      toast({ title: "Couldn't save", description: QUOTA_MSG });
    } else {
      toast({ title: "Couldn't save", description: GENERIC_MSG });
    }
  };

  const doSave = () => {
    const existing = findSavedTripByFingerprint(fingerprint);
    if (existing) {
      setDupOpen(true);
      return;
    }
    if (getSavedTripCount() >= MAX_SAVED_TRIPS) {
      setLimitOpen(true);
      return;
    }
    const snapshot = buildTripSnapshot({
      dest, prefs, fingerprint, itinerary, packingGroups, packingState, travelFit, score
    });
    reportSaveResult(saveNewTrip(snapshot));
  };

  const confirmReplace = () => {
    setDupOpen(false);
    const existing = findSavedTripByFingerprint(fingerprint);
    if (!existing) return;
    const snapshot = buildTripSnapshot({
      dest, prefs, fingerprint, itinerary, packingGroups, packingState, travelFit, score,
      existingId: existing.id, existingSavedAt: existing.savedAt
    });
    reportSaveResult(replaceSavedTrip(existing.id, snapshot));
  };

  return (
    <div>
      <TripHeader display={display} score={score} backHref="/results" backLabel="Back to recommendations" />

      <div className="relative -mt-6 sm:-mt-8 rounded-t-[28px] sm:rounded-t-[32px] bg-wn-page-l overflow-hidden">
        <div className="max-w-3xl mx-auto px-4 pt-8 pb-8">
          <div className="mb-6">
            <Button
              onClick={doSave}
              variant={alreadySaved ? "outline" : "default"}
              className={`w-full sm:w-auto min-h-12 ${alreadySaved ? "" : "wn-cta-light"}`}
              aria-label={alreadySaved ? "Replace saved itinerary" : "Save itinerary"}
            >
              {alreadySaved
                ? <><BookmarkCheck className="w-4 h-4 mr-2" /> Saved — tap to replace</>
                : <><Bookmark className="w-4 h-4 mr-2" /> Save itinerary</>}
            </Button>
          </div>

          <TripView
            display={display}
            itinerary={itinerary}
            packingGroups={packingGroups}
            packingState={packingState}
            travelFit={travelFit}
            packingHandlers={{
              onToggle: handleToggle,
              onAdd: handleAdd,
              onRemove: handleRemove,
              onReset: handleReset
            }}
          />
        </div>
      </div>

      {/* Duplicate itinerary */}
      <AlertDialog open={dupOpen} onOpenChange={setDupOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Itinerary already saved</AlertDialogTitle>
            <AlertDialogDescription>
              You've already saved this itinerary. Replace the saved copy with the current version?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmReplace}>Replace saved copy</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Saved-trips limit */}
      <AlertDialog open={limitOpen} onOpenChange={setLimitOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Saved trips limit reached</AlertDialogTitle>
            <AlertDialogDescription>
              {`You've saved the maximum of ${MAX_SAVED_TRIPS} trips. Delete one saved trip before saving a new one.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setLimitOpen(false); navigate("/saved-trips"); }}>
              View saved trips
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}