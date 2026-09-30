// UI-visibility toggles — distinct from `feature_flags.payments_enabled` in
// the DB, which gates billing *enforcement* (quota limits) and is exercised
// by the automated test suite. This one only controls whether the
// Subscribe entry points are shown/reachable in the UI; the underlying
// /api/billing/subscribe flow stays fully built and tested underneath it.
// Flip back to true to re-expose it — no other code needs to change.
export const SUBSCRIPTION_UI_ENABLED = false;

// Google is configured either with a client id in this app (local GoTrue)
// or entirely in the Supabase dashboard (production). Supabase's hosted
// auth URL is enough to show the button; the provider toggle still has to
// be on in that dashboard or the redirect comes back as an error.
export function isGoogleSignInEnabled(): boolean {
  if (process.env.GOOGLE_OAUTH_ENABLED === "true") return true;
  if (process.env.GOOGLE_CLIENT_ID) return true;
  const gotrue = `${process.env.GOTRUE_URL || ""} ${process.env.GOTRUE_URL_BROWSER || ""}`;
  return gotrue.includes("supabase.co");
}
