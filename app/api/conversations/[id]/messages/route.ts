import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { pg, pgRpc, PostgrestError } from "@/lib/db";
import { containsAbusiveLanguage, ABUSIVE_LANGUAGE_ERROR } from "@/lib/profanity";
import { sendEmail } from "@/lib/email";
import { getAppBaseUrl } from "@/lib/url";
import { checkRateLimit } from "@/lib/rateLimit";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireSession().catch(() => null);
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const rows = await pg(
    `/message?conversation_id=eq.${params.id}&select=id,sender_id,body,created_at&order=created_at.asc`,
    { token: user.token }
  );

  // Viewing a thread marks it read — same behavior as opening an email or
  // chat thread. Awaited (not fire-and-forget): a serverless function can
  // be torn down right after it responds, so an un-awaited call here could
  // simply never complete. Still best-effort — a failure must not break
  // loading the messages themselves.
  try {
    await pgRpc("mark_conversation_read", { p_conversation_id: params.id }, user.token);
  } catch {
    // Not marking as read is never worse than failing to load the thread.
  }

  return NextResponse.json(rows ?? []);
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireSession().catch(() => null);
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { body } = await req.json().catch(() => ({}));
  const trimmed = typeof body === "string" ? body.trim() : "";
  if (!trimmed) return NextResponse.json({ error: "Message can't be empty" }, { status: 400 });
  if (containsAbusiveLanguage(trimmed)) {
    return NextResponse.json({ error: ABUSIVE_LANGUAGE_ERROR }, { status: 400 });
  }

  // 30 messages / 10 min per sender — well above any real conversation's
  // pace, enough to stop a compromised/scripted account from spamming.
  const allowed = await checkRateLimit(`message:${user.id}`, 30, 600).catch(() => true);
  if (!allowed) {
    return NextResponse.json({ error: "You're sending messages too fast — please slow down." }, { status: 429 });
  }

  try {
    const rows = await pg(`/message`, {
      method: "POST",
      token: user.token,
      body: { conversation_id: params.id, sender_id: user.id, body: trimmed },
    });
    const message = Array.isArray(rows) ? rows[0] : rows;

    // Best-effort: notifying the other participant must never fail or
    // delay the send itself. get_conversation_partner_email() is the same
    // SECURITY DEFINER pattern as reveal_teacher_contact() — `users` has no
    // read policy beyond your own row, so this is the only RLS-safe way to
    // get the recipient's address server-side.
    try {
      const partnerEmail = await pgRpc(
        "get_conversation_partner_email",
        { p_conversation_id: params.id },
        user.token
      );
      if (partnerEmail) {
        const link = `${getAppBaseUrl()}/messages/${params.id}`;
        await sendEmail(
          partnerEmail,
          "New message on TeacherCircle",
          `<p>You have a new message waiting on TeacherCircle.</p><p><a href="${link}">View &amp; reply</a></p>`
        );
      }
    } catch {
      // Notification failure is never the caller's problem.
    }

    return NextResponse.json(message);
  } catch (err) {
    // RLS (message_insert_if_participant) rejects this for anyone not a
    // party to the conversation — surfaced as a plain 403, not a raw
    // PostgREST error string.
    const status = err instanceof PostgrestError ? 403 : 500;
    return NextResponse.json({ error: "Could not send message" }, { status });
  }
}
