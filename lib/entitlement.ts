import { pgRpc } from "./db";

export type Entitlement = { allowed: boolean; freeRemaining: number | null };

// Every gated action in the app calls this first. It short-circuits to
// "always allowed" the instant feature_flags.payments_enabled is false —
// see db/migrations/0003_billing_schema.sql and 0005_profile_lifecycle_admin.sql.
//
// NOTE: the design doc's Redis flag-cache (60s TTL) is deliberately not wired
// in this first runnable pass — this calls Postgres directly. It's one cheap
// function call per request; add the cache once that's actually measured to
// matter, not before.
export async function canReveal(token: string, userId: string): Promise<Entitlement> {
  const enabled = (await pgRpc("is_payments_enabled", {}, token)) as boolean;
  if (!enabled) return { allowed: true, freeRemaining: null };

  const hasActive = (await pgRpc("has_active_subscription", { u: userId }, token)) as boolean;
  if (hasActive) return { allowed: true, freeRemaining: null };

  const used = (await pgRpc("monthly_connection_count", { u: userId }, token)) as number;
  const limit = (await pgRpc("free_connections_limit_for", { u: userId }, token)) as number;
  return { allowed: used < limit, freeRemaining: Math.max(0, limit - used) };
}
