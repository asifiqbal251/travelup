import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogFooter,
  AlertDialogTitle, AlertDialogDescription, AlertDialogAction, AlertDialogCancel
} from "@/components/ui/alert-dialog";
import { User, LogIn, LogOut, Compass, Plane, Trash2, ArrowRight, AlertTriangle } from "lucide-react";
import {
  getPrefs, getSavedTrips, clearState, getPrefsHistory, switchToPrefsHistoryEntry, tripFingerprint
} from "@/lib/storage";
import { isReturningPrefs, returningContext } from "@/lib/discoveryCollections";
import { useAccountIdentity, beginGoogleSignIn, beginEmailSignIn, useSignOut } from "@/lib/auth";
import { migrateGuestTripsToAccount } from "@/lib/tripMigration";

// Signed-in only: every section here (account email, account trip count) is
// meaningless without an account, and a guest can already reach "Clear my
// data" from the nav. A signed-out visitor who lands here directly (an old
// link, a typed URL) gets a sign-in prompt below rather than a broken page.
export default function Profile() {
  const identity = useAccountIdentity();
  const { isSignedIn, email } = identity;

  if (!isSignedIn) return <SignedOutProfile />;
  return <SignedInProfile email={email} identity={identity} />;
}

function SignedOutProfile() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-16 text-center">
      <User className="w-10 h-10 text-muted-foreground mx-auto mb-4" />
      <h1 className="font-display text-2xl font-bold mb-2 text-ink">Sign in to view your profile</h1>
      <p className="text-muted-foreground mb-6">
        Your profile brings together your account, travel preferences and saved trips in one place.
      </p>
      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <Button onClick={beginGoogleSignIn} className="wn-cta-coral min-h-11">
          <LogIn className="w-4 h-4 mr-2" /> Continue with Google
        </Button>
        <Button onClick={beginEmailSignIn} variant="outline" className="min-h-11">
          Use email instead
        </Button>
      </div>
    </div>
  );
}

function SignedInProfile({ email, identity }) {
  const navigate = useNavigate();
  const signOut = useSignOut();
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [tripCount, setTripCount] = useState(null);
  const [tripCountError, setTripCountError] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // Re-read on every refreshKey bump (post-clear) rather than caching in
  // state -- these are cheap synchronous localStorage reads, same pattern
  // Landing.jsx uses for its lazy-initial prefs/saved reads.
  const prefs = getPrefs();
  const returning = isReturningPrefs(prefs);
  const history = getPrefsHistory();

  // Switching recomputes recommendations for the newly-active preferences --
  // that's the actual point of switching -- so this takes the user to
  // Results rather than leaving them on Profile with just the summary
  // line updated.
  const switchToHistoryEntry = (entry) => {
    const res = switchToPrefsHistoryEntry(entry);
    if (res.ok) navigate("/results");
  };

  useEffect(() => {
    let cancelled = false;
    async function loadCount() {
      const res = await migrateGuestTripsToAccount(identity);
      if (cancelled) return;
      if (res.accountFetchFailed) {
        setTripCount(getSavedTrips().length);
        setTripCountError(true);
      } else {
        const accountFingerprints = new Set(res.accountTrips.map((t) => t.fingerprint));
        const stillLocalOnly = getSavedTrips().filter((t) => !accountFingerprints.has(t.fingerprint));
        setTripCount(res.accountTrips.length + stillLocalOnly.length);
        setTripCountError(false);
      }
    }
    loadCount();
    return () => { cancelled = true; };
  }, [identity.email, refreshKey]);

  const confirmSignOut = () => {
    setSignOutOpen(false);
    signOut();
  };

  const confirmClear = () => {
    setClearOpen(false);
    clearState();
    setRefreshKey((k) => k + 1);
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="font-display text-3xl font-bold text-ink mb-6">My profile</h1>

      <div className="space-y-5">
        {/* Account */}
        <section className="rounded-2xl p-6 bg-card shadow-sm">
          <h2 className="font-display font-semibold text-ink mb-4">Account</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Signed in as <span className="font-medium text-ink">{email}</span>
          </p>
          <Button variant="outline" onClick={() => setSignOutOpen(true)} className="min-h-11">
            <LogOut className="w-4 h-4 mr-2" /> Sign out
          </Button>
        </section>

        {/* Travel preferences */}
        <section className="rounded-2xl p-6 bg-card shadow-sm">
          <h2 className="font-display font-semibold text-ink mb-4">Travel preferences</h2>
          {returning ? (
            <>
              <p className="text-sm text-ink/80 mb-4 flex items-start gap-2">
                <Compass className="w-4 h-4 text-teal flex-shrink-0 mt-0.5" aria-hidden="true" />
                <span>
                  <span className="text-teal font-semibold">Your Travel Fit:</span>{" "}
                  {returningContext(prefs)}
                </span>
              </p>
              <Button asChild variant="outline" className="min-h-11">
                <Link to="/questionnaire">Update preferences</Link>
              </Button>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground mb-4">
                You haven't set your travel preferences yet.
              </p>
              <Button asChild variant="outline" className="min-h-11">
                <Link to="/questionnaire">Set my preferences</Link>
              </Button>
            </>
          )}

          {history.length > 0 && (
            <div className="mt-5 pt-4 border-t border-border">
              <p className="text-xs font-medium text-muted-foreground mb-2">
                Recent Travel Fits
              </p>
              <ul>
                {history.map((entry) => (
                  <li key={tripFingerprint(entry, "")}>
                    <button
                      type="button"
                      onClick={() => switchToHistoryEntry(entry)}
                      className="w-full text-left text-sm text-muted-foreground hover:text-ink py-1.5 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ink motion-safe:transition-colors"
                    >
                      {returningContext(entry)}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {/* Saved trips */}
        <section className="rounded-2xl p-6 bg-card shadow-sm">
          <h2 className="font-display font-semibold text-ink mb-4">Saved trips</h2>
          {tripCountError && (
            <p className="flex items-center gap-2 text-sm text-destructive mb-3">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              Couldn't reach your account just now -- this count may be incomplete.
            </p>
          )}
          <p className="text-sm text-ink/80 mb-4 flex items-center gap-2">
            <Plane className="w-4 h-4 text-muted-foreground flex-shrink-0" aria-hidden="true" />
            {tripCount === null
              ? "Loading..."
              : `${tripCount} saved ${tripCount === 1 ? "trip" : "trips"}`}
          </p>
          <Button asChild variant="outline" className="min-h-11">
            <Link to="/saved-trips">
              View saved trips <ArrowRight className="w-4 h-4 ml-2" />
            </Link>
          </Button>
        </section>

        {/* Your data */}
        <section className="rounded-2xl p-6 bg-card shadow-sm">
          <h2 className="font-display font-semibold text-ink mb-4">Your data</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Permanently delete your questionnaire answers and everything saved locally on this browser.
          </p>
          <Button variant="outline" onClick={() => setClearOpen(true)} className="min-h-11">
            <Trash2 className="w-4 h-4 mr-2" /> Clear my data
          </Button>
        </section>
      </div>

      <AlertDialog open={signOutOpen} onOpenChange={setSignOutOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sign out?</AlertDialogTitle>
            <AlertDialogDescription>
              You'll be signed out of your account on this device. Trips saved to your account
              become inaccessible until you sign back in, but nothing is deleted -- they'll be
              there when you return. Trips saved locally on this browser are not affected either
              way.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmSignOut}>Sign out</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={clearOpen} onOpenChange={setClearOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear all local data?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes from this browser: your questionnaire answers, current destination
              selection, current and active-trip packing progress, every saved trip with its packing
              progress, and any trip still waiting on sign-up to save. This cannot be undone. Trips
              already saved to your account are not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmClear}>Delete all local data</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
