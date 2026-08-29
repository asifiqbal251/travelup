import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogFooter,
  AlertDialogTitle, AlertDialogDescription, AlertDialogAction, AlertDialogCancel
} from "@/components/ui/alert-dialog";
import {
  getSavedTrip, updateSavedTripPacking, deleteSavedTrip, normalizeDestinationDisplay
} from "@/lib/storage";
import TripView, { TripHeader } from "@/components/TripView";
import { toast } from "@/components/ui/use-toast";
import { Trash2, Plane } from "lucide-react";

// Renders a saved trip purely from its immutable snapshot. It never calls the
// Destination entity API, regenerates itinerary/packing/overview, or changes
// current preferences / selectedDestinationId.
export default function SavedTripDetail() {
  const { savedTripId } = useParams();
  const navigate = useNavigate();
  const [trip, setTrip] = useState(null);
  const [loading, setLoading] = useState(true);
  const [deleteOpen, setDeleteOpen] = useState(false);

  useEffect(() => {
    const t = getSavedTrip(savedTripId);
    if (!t) {
      setLoading(false);
      return;
    }
    setTrip(t);
    setLoading(false);
  }, [savedTripId]);

  if (loading) {
    return (
      <div className="min-h-[100dvh] bg-wn-page text-wn-text-2">
        <div className="max-w-2xl mx-auto px-4 py-20 text-center">
          <div className="w-8 h-8 mx-auto border-4 border-wn-line border-t-wn-cyan rounded-full animate-spin mb-4" />
          Opening saved trip…
        </div>
      </div>
    );
  }

  if (!trip) {
    return (
      <div className="min-h-[100dvh] bg-wn-page text-wn-text">
        <div className="max-w-2xl mx-auto px-4 py-16 text-center">
          <Plane className="w-10 h-10 text-wn-text-2 mx-auto mb-4" />
          <h1 className="font-display text-2xl font-bold mb-2 text-wn-text">Saved trip not found</h1>
          <p className="text-wn-text-2 mb-6">
            This saved trip may have been deleted or is no longer available on this browser.
          </p>
          <Button asChild className="wn-cta-dark min-h-11">
            <Link to="/saved-trips">Back to saved trips</Link>
          </Button>
        </div>
      </div>
    );
  }

  const display = normalizeDestinationDisplay(trip.destination);
  const packingState = {
    checkedItemIds: (trip.packing && trip.packing.checkedItemIds) || [],
    customItems: (trip.packing && trip.packing.customItems) || []
  };
  const packingGroups = (trip.packing && trip.packing.groups) || [];

  // Saved packing writes update only this saved trip's snapshot.
  const persistPacking = (next) => {
    const res = updateSavedTripPacking(trip.id, next);
    if (res.ok) {
      setTrip(res.value);
    } else {
      toast({
        title: "Couldn't update",
        description: "Check your browser storage settings and try again."
      });
    }
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

  const confirmDelete = () => {
    setDeleteOpen(false);
    deleteSavedTrip(trip.id);
    navigate("/saved-trips");
  };

  return (
    <div>
      <TripHeader display={display} score={typeof trip.score === "number" ? trip.score : null} backHref="/saved-trips" backLabel="Back to saved trips" />

      <div className="relative -mt-6 sm:-mt-8 rounded-t-[28px] sm:rounded-t-[32px] bg-wn-page-l overflow-hidden">
        <div className="max-w-3xl mx-auto px-4 pt-8 pb-8">
          <div className="mb-6">
            <Button
              variant="outline"
              onClick={() => setDeleteOpen(true)}
              className="min-h-11"
              aria-label={`Delete saved trip to ${trip.destination.name}`}
            >
              <Trash2 className="w-4 h-4 mr-2" /> Delete saved trip
            </Button>
          </div>

          <TripView
            display={display}
            itinerary={trip.itinerary}
            packingGroups={packingGroups}
            packingState={packingState}
            travelFit={trip.travelFit}
            packingHandlers={{
              onToggle: handleToggle,
              onAdd: handleAdd,
              onRemove: handleRemove,
              onReset: handleReset
            }}
          />
        </div>
      </div>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this saved trip?</AlertDialogTitle>
            <AlertDialogDescription>
              {`"${trip.destination.name}" will be removed from your saved trips. This cannot be undone.`}
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