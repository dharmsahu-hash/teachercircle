import webpush from "web-push";
import { pgRpc } from "./db";
import { isAllowedPushEndpoint } from "./pushEndpoint";
import { getJobSecret } from "./jobSecret";

// Browser push, free (no per-message cost). Needs VAPID keys in the
// environment (scripts/notify-setup.mjs makes them); without them every call
// here quietly does nothing, so local dev and tests are unaffected.
export type PushSub = { id: string; endpoint: string; p256dh: string; auth: string };
export type PushPayload = { title: string; body: string; url: string; tag?: string };

let configured: boolean | null = null;
export function pushConfigured(): boolean {
  if (configured !== null) return configured;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return (configured = false);
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:support@teacherscircle.co.in", pub, priv);
  return (configured = true);
}

// Sends one payload to many devices. Devices a push service reports as gone
// (404/410) are returned so the caller can forget them. Never throws.
export async function sendPushToSubs(subs: PushSub[], payload: PushPayload): Promise<{ sent: number; gone: string[] }> {
  if (!pushConfigured() || subs.length === 0) return { sent: 0, gone: [] };
  const body = JSON.stringify(payload);
  const gone: string[] = [];
  let sent = 0;
  await Promise.all(
    subs
      .filter((s) => isAllowedPushEndpoint(s.endpoint))
      .map(async (s) => {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, { TTL: 86400, timeout: 5000 });
          sent++;
        } catch (err) {
          const code = (err as { statusCode?: number }).statusCode;
          if (code === 404 || code === 410) gone.push(s.id);
        }
      })
  );
  return { sent, gone };
}

// Ask the database (secret-guarded job function) who to notify, send, and
// tidy up dead devices. Returns how many pushes went out. Never throws, and
// never does any work when push is not configured or the job secret is unset.
export async function pushVia(rpc: string, args: Record<string, unknown>, payload: PushPayload): Promise<number> {
  const secret = getJobSecret();
  if (!secret || !pushConfigured()) return 0;
  try {
    const subs = (await pgRpc(rpc, { p_secret: secret, ...args })) as PushSub[] | null;
    if (!Array.isArray(subs) || subs.length === 0) return 0;
    const { sent, gone } = await sendPushToSubs(subs, payload);
    if (gone.length) await pgRpc("drop_push_subscriptions", { p_secret: secret, p_ids: gone }).catch(() => undefined);
    return sent;
  } catch {
    return 0;
  }
}
