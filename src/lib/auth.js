// ============================================================
// AUTH INTEGRATION POINT — Base44 auth not yet configured.
// Google OAuth (primary) + email/password (fallback) will be wired here.
// ============================================================
//
// Every part of the guest-to-account flow (the soft save banner, the hard
// sign-up prompt, the nav "Sign in" link, and trip migration) calls into
// this module instead of base44.auth directly. Wiring real auth later is
// therefore a single, well-defined change confined to this file — nothing
// else in the guest flow should need to change.
//
// Google is the intended PRIMARY method (email/password is fallback-only):
// Base44 requires mandatory email OTP verification for email/password
// accounts, so register() alone does not create a session and the user must
// leave the app, find a code in their email, and return before login
// succeeds. The email path below is written to tolerate that gap (the
// caller must not lose guest state while the user is away) even though it
// is currently a no-op.
//
// Do not call base44.auth from anywhere else in the guest-flow code —
// route every sign-up/sign-in attempt through the functions below so this
// stays the one place that changes when auth is configured.

import { useAuth } from "@/lib/AuthContext";
import { toast } from "@/components/ui/use-toast";

const COMING_SOON_TITLE = "Almost there";

function notifyComingSoon(action) {
  toast({
    title: COMING_SOON_TITLE,
    description: `${action} isn't available yet — check back soon. Your trip stays saved on this device.`
  });
}

// The account identity the rest of the app is allowed to depend on. Base44's
// internal user id is NOT portable across a platform migration — email is
// the portable key. `stableId` is a placeholder for a future
// WhereNova-generated identifier; until real accounts exist it falls back to
// whatever Base44 exposes, but no app logic outside this file should read
// anything from the Base44 user object other than through this hook.
export function useAccountIdentity() {
  const { isAuthenticated, user } = useAuth();
  const signedIn = !!isAuthenticated && !!user;
  return {
    isSignedIn: signedIn,
    email: signedIn ? user.email || null : null,
    stableId: signedIn ? user.id || user.email || null : null
  };
}

// ---- Sign-up / sign-in entry points ----
//
// All four are no-ops today (they surface a friendly "not yet" message
// rather than pretending to work or silently doing nothing). Wiring real
// Base44 auth means replacing ONLY these five function bodies:
//   - beginGoogleSignUp / beginGoogleSignIn -> base44.auth.loginWithProvider("google", ...)
//   - beginEmailSignUp -> base44.auth.register(...)
//   - beginEmailSignIn -> base44.auth.loginViaEmailPassword(...)
//   - saveTripToAccount -> the real backend write trip migration depends on

export function beginGoogleSignUp() {
  notifyComingSoon("Sign-up");
}

export function beginGoogleSignIn() {
  notifyComingSoon("Sign-in");
}

export function beginEmailSignUp(/* email, password */) {
  notifyComingSoon("Sign-up");
}

export function beginEmailSignIn(/* email, password */) {
  notifyComingSoon("Sign-in");
}

// Persists one trip snapshot to the signed-in user's account. Returns a
// discriminated result so callers (trip migration) can tell a confirmed
// write apart from an unconfigured/failed one and act fail-safe accordingly.
// Stubbed until Base44 auth + a backend trip store exist.
export async function saveTripToAccount(/* identity, tripSnapshot */) {
  return { ok: false, reason: "not_configured" };
}
