import { useEffect, useRef } from "react";
import { useAuth } from "@/lib/AuthContext";
import { useAccountIdentity } from "@/lib/auth";
import { migrateGuestTripsToAccount } from "@/lib/tripMigration";
import { clearPendingEmailVerification } from "@/lib/storage";

// Fires once whenever AuthContext confirms a session (isAuthenticated flips
// to true after checkUserAuth resolves). Both sign-in paths land here the
// same way: Google returns via a full-page redirect and the email/OTP path
// redirects with window.location.href after verifyOtp — either one remounts
// AuthProvider fresh, so this single hook covers sign-up and sign-in for
// both methods without needing to be called from Login/Register directly.
// migrateGuestTripsToAccount is fail-safe by construction (tripMigration.js)
// — a local trip is only ever deleted after the account write is confirmed.
export default function TripMigrationEffect() {
  const { isAuthenticated, user } = useAuth();
  const identity = useAccountIdentity();
  const ranForEmail = useRef(null);

  useEffect(() => {
    if (!isAuthenticated || !user?.email) return;
    if (ranForEmail.current === user.email) return;
    ranForEmail.current = user.email;
    clearPendingEmailVerification();
    migrateGuestTripsToAccount(identity);
  }, [isAuthenticated, user]);

  return null;
}
