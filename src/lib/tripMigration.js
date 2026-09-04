// Moves a guest's locally-saved trip(s) into their account after they sign
// up or sign in, AND reconciles local vs. account trips on every later call
// (invoked again from SavedTrips.jsx / SavedTripDetail.jsx on load) so a
// trip saved locally while already signed in — e.g. on a device where the
// sign-up migration already ran once — still reaches the account.
//
// Fail-safe by construction: a local trip is deleted only after
// saveTripToAccount() confirms it was written, or after the account is
// confirmed to already have that fingerprint. Any failure — network error,
// quota, anything — leaves the local copy exactly as it was. A user must
// never lose a trip because a migration errored.
//
// Duplicate handling: the account is read first (getAccountSavedTrips) and
// checked by fingerprint before any write. A local trip whose fingerprint
// already exists in the account is dropped locally WITHOUT writing — the
// account copy is treated as canonical and no second copy is created. This
// resolves the collision this file used to only flag as an open question,
// now that the account side can actually be queried.
//
// If the account can't be read at all, no writes are attempted — writing
// blind risks duplicating a trip that's already there. Every local trip is
// left untouched for the next call to retry.

import {
  getSavedTrips, getPendingTripSnapshot, clearPendingTripSnapshot, deleteSavedTrip
} from "@/lib/storage";
import { saveTripToAccount, getAccountSavedTrips } from "@/lib/auth";

// identity: { email, stableId } from useAccountIdentity() — see the
// portability requirements in src/lib/auth.js.
//
// Returns accountTrips (the reconciled, current account list) alongside the
// usual counts so callers that need to display trips right after
// reconciling don't have to issue a second fetch.
export async function migrateGuestTripsToAccount(identity) {
  const accountRes = await getAccountSavedTrips(identity);
  const accountFetchFailed = !accountRes.ok;
  let accountTrips = accountRes.trips;

  const pending = getPendingTripSnapshot();
  const localTrips = getSavedTrips().filter((t) => !pending || t.id !== pending.id);
  const toMigrate = pending ? [pending, ...localTrips] : localTrips;

  if (toMigrate.length === 0) {
    return { ok: true, migrated: 0, failed: 0, skipped: 0, accountTrips, accountFetchFailed };
  }

  if (accountFetchFailed) {
    return { ok: false, migrated: 0, failed: 0, skipped: 0, accountTrips, accountFetchFailed };
  }

  const accountFingerprints = new Set(accountTrips.map((t) => t.fingerprint));
  let migrated = 0;
  let failed = 0;
  let skipped = 0;
  let wroteAny = false;

  for (const trip of toMigrate) {
    if (accountFingerprints.has(trip.fingerprint)) {
      skipped += 1;
      if (pending && trip.id === pending.id) clearPendingTripSnapshot();
      else deleteSavedTrip(trip.id);
      continue;
    }
    const res = await saveTripToAccount(identity, trip);
    if (res && res.ok) {
      migrated += 1;
      wroteAny = true;
      if (pending && trip.id === pending.id) clearPendingTripSnapshot();
      else deleteSavedTrip(trip.id);
    } else {
      // Fail-safe: leave the local copy untouched.
      failed += 1;
    }
  }

  if (wroteAny) {
    const refreshed = await getAccountSavedTrips(identity);
    if (refreshed.ok) accountTrips = refreshed.trips;
  }

  return { ok: failed === 0, migrated, failed, skipped, accountTrips, accountFetchFailed };
}
