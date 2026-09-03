// Moves a guest's locally-saved trip(s) into their account after they sign
// up or sign in. Not triggered anywhere yet — there is no working sign-up to
// call it from. Once the AUTH INTEGRATION POINT (src/lib/auth.js) has a real
// sign-up/sign-in, call migrateGuestTripsToAccount() immediately on success;
// no user action should be required to trigger it.
//
// Fail-safe by construction: a local trip is deleted only after
// saveTripToAccount() confirms it was written. Any failure — network error,
// auth not configured, quota, anything — leaves the local copy exactly as it
// was. A user must never lose a trip because a migration errored.
//
// The same function serves both the sign-up case (the pending trip a guest
// was blocked from saving, per storage.getPendingTripSnapshot) and the
// sign-in case (a returning guest's already-saved local trip(s) merging into
// an existing account) — the operation is identical: push whatever is local
// into the account, fail-safe. One open product question flagged for
// whoever wires real auth: if a guest's local trip and their existing
// account already have a trip with the same fingerprint, this will attempt
// to write both rather than detect the collision (no account-side read
// exists yet to check). Recommend resolving that as "keep both" or "keep
// the newer updatedAt" once the account side can actually be queried, rather
// than guessing here.

import {
  getSavedTrips, getPendingTripSnapshot, clearPendingTripSnapshot, deleteSavedTrip
} from "@/lib/storage";
import { saveTripToAccount } from "@/lib/auth";

// identity: { email, stableId } from useAccountIdentity() — see the
// portability requirements in src/lib/auth.js.
export async function migrateGuestTripsToAccount(identity) {
  const pending = getPendingTripSnapshot();
  const localTrips = getSavedTrips().filter((t) => !pending || t.id !== pending.id);
  const toMigrate = pending ? [pending, ...localTrips] : localTrips;

  if (toMigrate.length === 0) return { ok: true, migrated: 0, failed: 0 };

  let migrated = 0;
  let failed = 0;
  for (const trip of toMigrate) {
    const res = await saveTripToAccount(identity, trip);
    if (res && res.ok) {
      migrated += 1;
      if (pending && trip.id === pending.id) clearPendingTripSnapshot();
      else deleteSavedTrip(trip.id);
    } else {
      // Fail-safe: leave the local copy untouched.
      failed += 1;
    }
  }

  return { ok: failed === 0, migrated, failed };
}
