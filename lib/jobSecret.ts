import { timingSafeEqual } from "node:crypto";

// Background endpoints (digest, reminders) and the push fan-out are guarded by
// CRON_SECRET. The same value is passed to the database job functions, which
// compare its hash with the one stored in job_secret.
export function getJobSecret(): string | null {
  const s = process.env.CRON_SECRET;
  return s && s.length >= 32 ? s : null;
}

// True when the request carries "Authorization: Bearer <CRON_SECRET>" (what
// Vercel Cron and our GitHub Action both send).
export function isJobRequest(authHeader: string | null, secret: string | null = getJobSecret()): boolean {
  if (!secret || !authHeader) return false;
  const given = Buffer.from(authHeader.replace(/^Bearer\s+/i, ""));
  const want = Buffer.from(secret);
  return given.length === want.length && timingSafeEqual(given, want);
}

// "Stop these emails" links: userId + an HMAC of it, so the link works without
// signing in and cannot be forged for someone else.
import { createHmac } from "node:crypto";

export function signUnsubscribe(userId: string, secret: string): string {
  return `${userId}.${createHmac("sha256", secret).update("unsub:" + userId).digest("hex").slice(0, 32)}`;
}

export function verifyUnsubscribe(token: unknown, secret: string | null = getJobSecret()): string | null {
  if (!secret || typeof token !== "string") return null;
  const m = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.([0-9a-f]{32})$/.exec(token);
  if (!m) return null;
  const want = Buffer.from(signUnsubscribe(m[1], secret));
  const given = Buffer.from(token);
  return want.length === given.length && timingSafeEqual(want, given) ? m[1] : null;
}
