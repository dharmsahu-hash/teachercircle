import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { pg, PostgrestError } from "@/lib/db";
import { containsAbusiveLanguage, ABUSIVE_LANGUAGE_ERROR } from "@/lib/profanity";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireSession().catch(() => null);
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const rows = await pg(
    `/message?conversation_id=eq.${params.id}&select=id,sender_id,body,created_at&order=created_at.asc`,
    { token: user.token }
  );
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

  try {
    const rows = await pg(`/message`, {
      method: "POST",
      token: user.token,
      body: { conversation_id: params.id, sender_id: user.id, body: trimmed },
    });
    return NextResponse.json(Array.isArray(rows) ? rows[0] : rows);
  } catch (err) {
    // RLS (message_insert_if_participant) rejects this for anyone not a
    // party to the conversation — surfaced as a plain 403, not a raw
    // PostgREST error string.
    const status = err instanceof PostgrestError ? 403 : 500;
    return NextResponse.json({ error: "Could not send message" }, { status });
  }
}
