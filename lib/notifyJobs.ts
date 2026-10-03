import { pgRpc } from "./db";
import { sendEmailChecked } from "./email";
import { buildDigestEmail, type DigestRow } from "./digestEmail";
import { signUnsubscribe } from "./jobSecret";
import { pushConfigured, sendPushToSubs, type PushSub } from "./push";
import { getAppBaseUrl } from "./url";

// Free-tier guard: Brevo allows 300 emails a day; keep room for message
// notifications and password mails. Override with DIGEST_DAILY_LIMIT.
export function digestDailyLimit(): number {
  const n = Number(process.env.DIGEST_DAILY_LIMIT);
  return Number.isInteger(n) && n >= 0 && n <= 5000 ? n : 200;
}

export type DigestResult = { found: number; sent: number; skippedOverLimit: number; failed: number };

// Once a day. Only teachers with NEW matching requests are returned by the
// database, so a quiet day sends nothing and costs nothing. A teacher is marked
// "sent" only after Brevo accepted the mail, so a failure retries tomorrow.
export async function runDigest(secret: string): Promise<DigestResult> {
  const result: DigestResult = { found: 0, sent: 0, skippedOverLimit: 0, failed: 0 };
  const limit = digestDailyLimit();
  const already = Number(await pgRpc("digest_sent_today", { p_secret: secret })) || 0;
  const room = Math.max(0, limit - already);
  if (room === 0) {
    const probe = (await pgRpc("digest_pending", { p_secret: secret, p_limit: 0 })) as { total: number };
    result.found = probe?.total ?? 0;
    result.skippedOverLimit = result.found;
    return result;
  }
  const pending = (await pgRpc("digest_pending", { p_secret: secret, p_limit: room })) as { total: number; rows: DigestRow[] };
  result.found = pending?.total ?? 0;
  const rows = pending?.rows ?? [];
  result.skippedOverLimit = Math.max(0, result.found - rows.length);

  const base = getAppBaseUrl();
  const sentIds: string[] = [];
  for (const row of rows) {
    const unsub = `${base}/unsubscribe?t=${signUnsubscribe(row.userId, secret)}`;
    const mail = buildDigestEmail(row, base, unsub);
    if (!mail) continue; // nothing to say: no email
    const ok = await sendEmailChecked(row.email, mail.subject, mail.html, { "List-Unsubscribe": `<${unsub}>` });
    if (ok) {
      sentIds.push(row.userId);
      result.sent++;
    } else result.failed++;
  }
  if (sentIds.length) await pgRpc("digest_mark_sent", { p_secret: secret, p_user_ids: sentIds });
  return result;
}

export type ReminderResult = { found: number; pushed: number };

// Evening nudge to players whose 2+ day streak ends tonight. Push only (free);
// nobody without a registered device is contacted, and nobody twice a day.
export async function runStreakReminders(secret: string): Promise<ReminderResult> {
  const result: ReminderResult = { found: 0, pushed: 0 };
  if (!pushConfigured()) return result;
  const targets = ((await pgRpc("streak_reminder_targets", { p_secret: secret, p_limit: 500 })) as { userId: string; streak: number; subs: PushSub[] }[]) ?? [];
  result.found = targets.length;
  const reminded: string[] = [];
  const gone: string[] = [];
  for (const t of targets) {
    const r = await sendPushToSubs(t.subs, {
      title: `Your ${t.streak}-day streak ends tonight`,
      body: "Answer today's 5 questions to keep it alive.",
      url: "/daily",
      tag: "streak",
    });
    gone.push(...r.gone);
    if (r.sent > 0) {
      reminded.push(t.userId);
      result.pushed++;
    }
  }
  if (reminded.length) await pgRpc("mark_quiz_reminded", { p_secret: secret, p_user_ids: reminded });
  if (gone.length) await pgRpc("drop_push_subscriptions", { p_secret: secret, p_ids: gone }).catch(() => undefined);
  return result;
}
