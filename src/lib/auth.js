// ============================================================
// AUTH INTEGRATION POINT — Base44 auth wired here.
// Google OAuth (primary) + email/password (fallback).
// ============================================================
//
// Every part of the guest-to-account flow (the soft save banner, the hard
// sign-up prompt, the nav "Sign in" link, and trip migration) calls into
// this module instead of base44.auth directly, so this stays the one place
// that changes if auth providers ever change.
//
// Google is the PRIMARY method (email/password is fallback-only): Base44
// requires mandatory email OTP verification for email/password accounts, so
// register() alone does not create a session and the user must leave the
// app, find a code in their email, and return before login succeeds. See
// Register.jsx and TripMigrationEffect.jsx for how that gap is handled.
//
// Do not call base44.auth from anywhere else in the guest-flow code — route
// every sign-up/sign-in attempt through the functions below.

import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";

// The account identity the rest of the app is allowed to depend on. Base44's
// internal user id is NOT portable across a platform migration — email is
// the portable key (it's also what Base44 stamps as `created_by` on every
// entity record, so backend writes need no separate identity field). No app
// logic outside this file should read anything from the Base44 user object
// other than through this hook.
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
// Google is a full-page redirect (Base44 handles the OAuth round trip and
// returns to fromUrl with a token) so callers here fire-and-forget. Email is
// handled by dedicated pages (Register/Login) since it needs a form; these
// two just navigate there, preserving the current page as returnTo so the
// user lands back where they were.

export function beginGoogleSignUp() {
  base44.auth.loginWithProvider("google", window.location.pathname);
}

export function beginGoogleSignIn() {
  base44.auth.loginWithProvider("google", window.location.pathname);
}

function currentPathWithSearch() {
  return window.location.pathname + window.location.search;
}

export function beginEmailSignUp() {
  window.location.href = "/register?returnTo=" + encodeURIComponent(currentPathWithSearch());
}

export function beginEmailSignIn() {
  window.location.href = "/login?returnTo=" + encodeURIComponent(currentPathWithSearch());
}

// Persists one trip snapshot to the signed-in user's account via the
// SavedTrip entity (base44/entities/SavedTrip.jsonc). Returns a
// discriminated result so callers (trip migration) can tell a confirmed
// write apart from a failed one and act fail-safe accordingly — the caller
// must not delete the local copy unless res.ok is true.
export async function saveTripToAccount(identity, tripSnapshot) {
  if (!identity || !identity.isSignedIn) {
    return { ok: false, reason: "not_signed_in" };
  }
  try {
    await base44.entities.SavedTrip.create({
      client_id: tripSnapshot.id,
      fingerprint: tripSnapshot.fingerprint,
      snapshot: tripSnapshot,
      saved_at: tripSnapshot.savedAt,
      updated_at: tripSnapshot.updatedAt
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: "write_failed" };
  }
}
