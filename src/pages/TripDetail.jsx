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
  setPendingTripSnapshot, MAX_SAVED_TRIPS, GUEST_TRIP_LIMIT,
  getMultiStopLegs,
} from "@/lib/storage";
import { generateItinerary } from "@/lib/itinerary";
import { generateMultiDestItinerary } from "@/lib/multiDestItinerary";
import { generatePackingList } from "@/lib/packing";
import { assessPracticality } from "@/lib/practicality";
import { scoreWithPracticality } from "@/lib/scoring";
import TripView, { TripHeader } from "@/components/TripView";
import { toast } from "@/components/ui/use-toast";
import { Bookmark, BookmarkCheck } from "lucide-react";
import { useAccountIdentity, saveTripToAccount, getAccountSavedTrips, updateTripSnapshotInAccount } from "@/lib/auth";
import GuestUpgradeModal from "@/components/guest/GuestUpgradeModal";
import GuestSaveBanner from "@/components/guest/GuestSaveBanner";

const QUOTA_MSG = "This browser is out of space for another saved trip. Delete an older saved trip and try again.";
const GENERIC_MSG = "We couldn't save this itinerary in this browser. Check your browser storage settings and try again.";
const ACCOUNT_SAVE_MSG = "Check your connection and try again.";

export default function TripDetail() {
  const navigate = useNavigate();
  const identity = useAccountIdentity();
  const { isSignedIn } = identity;
  const [dest, setDest] = useState(null);
  const [prefs, setPrefsState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [packingState, setPackingState] = useState({ checkedItemIds: [], customItems: [], removedItemIds: [] });
  const [alreadySaved, setAlreadySaved] = useState(false);
  // Multi-stop state: fullLegs holds [{destination, days}] with full dest objects.
  // snapshotLegs holds [{destinationId, days, name, country}] for the saved snapshot.
  const [fullLegs, setFullLegs] = useState(null);
  const [snapshotLegs, setSnapshotLegs] = useState(null);
  // The account's existing record for this trip's fingerprint, once known --
  // signed-in users save/replace directly against the account (see doSave/
  // confirmReplace) rather than through local storage, so this is the thing
  // that needs updating on a re-save, and the account record id delete/
  // replace need.
  const [accountMatch, setAccountMatch] = useState(null);
  const [dupOpen, setDupOpen] = useState(false);
  const [limitOpen, setLimitOpen] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  useEffect(() => {
    const storedLegs = getMultiStopLegs();
    const id = storedLegs ? null : getSelectedDestinationId();
    const p = getPrefs();

    if (!storedLegs && !id) { navigate("/results"); return; }
    if (!p) { navigate("/results"); return; }
    setPrefsState(p);

    if (storedLegs) {
      // Multi-stop: fetch all destinations then assemble legs
      Promise.all(storedLegs.map((l) => base44.entities.Destination.get(l.destinationId)))
        .then(async (dests) => {
          const assembled = storedLegs.map((l, i) => ({ destination: dests[i], days: l.days }));
          setFullLegs(assembled);
          setSnapshotLegs(storedLegs.map((l, i) => ({
            destinationId: l.destinationId,
            days: l.days,
            name: dests[i].name,
            country: dests[i].country,
          })));
          setDest(dests[0]); // first destination provides display, image, packing
          const fp = tripFingerprint(p, storedLegs);
          setPackingState(seedActiveTripPacking(fp, dests[0].id));
          if (isSignedIn) {
            const res = await getAccountSavedTrips(identity);
            if (res.ok) {
              const match = res.trips.find((t) => t.fingerprint === fp) || null;
              setAccountMatch(match);
              setAlreadySaved(!!match);
            } else {
              setAccountMatch(null);
              setAlreadySaved(!!findSavedTripByFingerprint(fp));
            }
          } else {
            setAlreadySaved(!!findSavedTripByFingerprint(fp));
          }
          setLoading(false);
        })
        .catch(() => { navigate("/results"); });
      return;
    }

    // Single-destination path (unchanged)
    base44.entities.Destination.get(id)
      .then(async (d) => {
        setDest(d);
        const fp = tripFingerprint(p, d.id);
        setPackingState(seedActiveTripPacking(fp, d.id));
        if (isSignedIn) {
          const res = await getAccountSavedTrips(identity);
          if (res.ok) {
            const match = res.trips.find((t) => t.fingerprint === fp) || null;
            setAccountMatch(match);
            setAlreadySaved(!!match);
          } else {
            // Degrade gracefully: can't confirm account state, so fall back
            // to whatever this device knows locally rather than blocking
            // the save button or claiming falsely that nothing is saved.
            setAccountMatch(null);
            setAlreadySaved(!!findSavedTripByFingerprint(fp));
          }
        } else {
          setAlreadySaved(!!findSavedTripByFingerprint(fp));
        }
        setLoading(false);
      })
      .catch(() => { navigate("/results"); });
  }, [navigate, isSignedIn, identity.email]);

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

  const plannedMultiStop = Array.isArray(fullLegs) && fullLegs.length >= 2;

  // Itinerary: multi-stop uses the stitched generator; single uses existing path.
  const multi = plannedMultiStop ? generateMultiDestItinerary(fullLegs, prefs) : null;
  const itinerary = multi ? multi.days : generateItinerary(dest, prefs);

  // Header, leg labels and the saved snapshot show the legs actually built and
  // their achieved day counts, not the proposal's intent -- the generator can
  // fall short of a leg's allocation or drop a leg outright, and the page must
  // never promise days or destinations the itinerary doesn't contain.
  const builtLegs = multi
    ? multi.legDays.map((b) => ({
        ...snapshotLegs.find((l) => l.destinationId === b.destinationId),
        days: b.days,
      }))
    : null;
  const isMultiStop = !!builtLegs && builtLegs.length >= 2;
  // If dropping legs left a single destination, that one is the trip.
  const tripDest = builtLegs && builtLegs.length === 1
    ? fullLegs.find((l) => l.destination.id === builtLegs[0].destinationId).destination
    : dest;
  const display = normalizeDestinationDisplay(tripDest);
  const shownLegs = isMultiStop ? builtLegs : null;

  const packingGroups = generatePackingList(tripDest, prefs);
  const travelFit = plannedMultiStop ? null : assessPracticality(dest, prefs);
  const score = plannedMultiStop ? null : scoreWithPracticality(dest, prefs, travelFit).finalScore;
  // Fingerprint stays keyed on the proposal so re-opening the same plan still
  // matches its saved copy.
  const fingerprint = plannedMultiStop
    ? tripFingerprint(prefs, snapshotLegs)
    : tripFingerprint(prefs, dest.id);

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
    // Custom items start unchecked (B8 bug fix: previous code erroneously
    // added the new id to checkedItemIds, pre-ticking every custom item).
    persistPacking({
      ...packingState,
      customItems: [...packingState.customItems, { id, label, category }]
    });
  };
  const handleRemove = (id) => {
    persistPacking({
      checkedItemIds: packingState.checkedItemIds.filter((x) => x !== id),
      customItems: packingState.customItems.filter((c) => c.id !== id)
    });
  };
  const handleReset = () => persistPacking({ checkedItemIds: [], customItems: [], removedItemIds: packingState.removedItemIds });
  // Bulk pack/unpack for a category's "Pack all" / "Unpack all" button.
  // Written as a direct set-membership computation (not N calls to
  // handleToggle) because handleToggle reads packingState from this
  // render's closure -- looping it would only ever apply the last call.
  const handleSetChecked = (ids, checked) => {
    const idSet = new Set(ids);
    const withoutThese = packingState.checkedItemIds.filter((x) => !idSet.has(x));
    persistPacking({
      ...packingState,
      checkedItemIds: checked ? [...withoutThese, ...ids] : withoutThese
    });
  };
  // Deleting a generated item is a soft-delete: it drops off the checked list
  // (nothing to pack that no longer exists) and is filtered from the visible
  // list, but the id itself persists so a later itinerary regeneration for
  // the same trip never brings it back silently.
  const handleDeleteItem = (id) => {
    persistPacking({
      ...packingState,
      checkedItemIds: packingState.checkedItemIds.filter((x) => x !== id),
      removedItemIds: packingState.removedItemIds.includes(id)
        ? packingState.removedItemIds
        : [...packingState.removedItemIds, id]
    });
  };
  const handleRestoreItem = (id) => {
    persistPacking({
      ...packingState,
      removedItemIds: packingState.removedItemIds.filter((x) => x !== id)
    });
  };

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

  // Signed-in users save straight to the account and are never subject to
  // the guest one-trip limit or the local-storage MAX_SAVED_TRIPS cap --
  // both are local-device concepts that don't apply once an account exists.
  const saveNewAccountTrip = async () => {
    const snapshot = buildTripSnapshot({
      dest: tripDest, prefs, fingerprint, itinerary, packingGroups, packingState, travelFit, score,
      legs: shownLegs || undefined,
    });
    const res = await saveTripToAccount(identity, snapshot);
    if (res.ok) {
      const refreshed = await getAccountSavedTrips(identity);
      if (refreshed.ok) {
        setAccountMatch(refreshed.trips.find((t) => t.fingerprint === fingerprint) || null);
      }
      setAlreadySaved(true);
      toast({ title: "Itinerary saved" });
    } else {
      toast({ title: "Couldn't save", description: ACCOUNT_SAVE_MSG });
    }
  };

  const doSave = () => {
    if (isSignedIn) {
      if (accountMatch) {
        setDupOpen(true);
      } else {
        saveNewAccountTrip();
      }
      return;
    }
    const existing = findSavedTripByFingerprint(fingerprint);
    if (existing) {
      setDupOpen(true);
      return;
    }
    // Guest one-trip limit: a signed-out visitor may save exactly one trip
    // locally. Attempting a second is preserved as a pending trip (survives
    // reload / leaving to check email) rather than saved or dropped, and the
    // sign-up prompt opens instead. Pre-existing guests who already have
    // more than one saved trip are never blocked from replacing/deleting
    // those — this only gates NEW additions once the limit is already met.
    if (getSavedTripCount() >= GUEST_TRIP_LIMIT) {
      const snapshot = buildTripSnapshot({
        dest: tripDest, prefs, fingerprint, itinerary, packingGroups, packingState, travelFit, score,
        legs: shownLegs || undefined,
      });
      setPendingTripSnapshot(snapshot);
      setUpgradeOpen(true);
      return;
    }
    if (getSavedTripCount() >= MAX_SAVED_TRIPS) {
      setLimitOpen(true);
      return;
    }
    const snapshot = buildTripSnapshot({
      dest: tripDest, prefs, fingerprint, itinerary, packingGroups, packingState, travelFit, score,
      legs: shownLegs || undefined,
    });
    reportSaveResult(saveNewTrip(snapshot));
  };

  const confirmReplace = async () => {
    setDupOpen(false);
    if (isSignedIn) {
      if (!accountMatch) return;
      const snapshot = buildTripSnapshot({
        dest: tripDest, prefs, fingerprint, itinerary, packingGroups, packingState, travelFit, score,
        existingId: accountMatch.id, existingSavedAt: accountMatch.savedAt,
        legs: shownLegs || undefined,
      });
      const res = await updateTripSnapshotInAccount(accountMatch.accountRecordId, snapshot);
      if (res.ok) {
        setAccountMatch({ ...snapshot, accountRecordId: accountMatch.accountRecordId });
        setAlreadySaved(true);
        toast({ title: "Itinerary saved" });
      } else {
        toast({ title: "Couldn't save", description: ACCOUNT_SAVE_MSG });
      }
      return;
    }
    const existing = findSavedTripByFingerprint(fingerprint);
    if (!existing) return;
    const snapshot = buildTripSnapshot({
      dest: tripDest, prefs, fingerprint, itinerary, packingGroups, packingState, travelFit, score,
      existingId: existing.id, existingSavedAt: existing.savedAt,
      legs: shownLegs || undefined,
    });
    reportSaveResult(replaceSavedTrip(existing.id, snapshot));
  };

  return (
    <div>
      <TripHeader
        display={display}
        score={isMultiStop ? null : score}
        backHref="/results"
        backLabel="Back to recommendations"
        legs={shownLegs}
      />

      {/* overflow-clip (not overflow-hidden) -- hidden establishes a scroll
          container per the CSS Overflow spec, which silently breaks
          position:sticky for every descendant (the tab bar and the new
          jump-nav pill row included): sticky then computes against this
          div's own non-scrolling box instead of the viewport and never
          actually pins. clip gives the same rounded-corner clipping without
          that side effect. Found live-testing the jump-nav sticky pills. */}
      <div className="relative -mt-6 sm:-mt-8 rounded-t-[28px] sm:rounded-t-[32px] bg-wn-page-l overflow-clip">
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

          {alreadySaved && <GuestSaveBanner className="mb-6" />}

          <TripView
            display={display}
            itinerary={itinerary}
            packingGroups={packingGroups}
            packingState={packingState}
            travelFit={travelFit}
            legs={shownLegs}
            packingHandlers={{
              onToggle: handleToggle,
              onAdd: handleAdd,
              onRemove: handleRemove,
              onReset: handleReset,
              onDelete: handleDeleteItem,
              onRestore: handleRestoreItem,
              onSetChecked: handleSetChecked
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

      <GuestUpgradeModal open={upgradeOpen} onOpenChange={setUpgradeOpen} />
    </div>
  );
}