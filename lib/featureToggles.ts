// UI-visibility toggles — distinct from `feature_flags.payments_enabled` in
// the DB, which gates billing *enforcement* (quota limits) and is exercised
// by the automated test suite. This one only controls whether the
// Subscribe entry points are shown/reachable in the UI; the underlying
// /api/billing/subscribe flow stays fully built and tested underneath it.
// Flip back to true to re-expose it — no other code needs to change.
export const SUBSCRIPTION_UI_ENABLED = false;
