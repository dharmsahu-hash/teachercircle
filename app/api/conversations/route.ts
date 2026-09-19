import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { pg, PostgrestError } from "@/lib/db";

export async function GET() {
  const user = await requireSession().catch(() => null);
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const rows = await pg(
    `/conversation_thread?select=*&order=created_at.desc`,
    { token: user.token }
  );
  return NextResponse.json(rows ?? []);
}

// Finds the existing (teacher, requester) conversation, or creates it —
// creation is only allowed by RLS (conversation_insert_if_connected, see
// 0015_messages.sql) when a contact_request already exists for this pair,
// same "connect first" rule reviews already enforce.
export async function POST(req: NextRequest) {
  const user = await requireSession().catch(() => null);
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { teacherId } = await req.json().catch(() => ({}));
  if (!teacherId) return NextResponse.json({ error: "teacherId is required" }, { status: 400 });

  const existing = await pg(
    `/conversation?teacher_id=eq.${teacherId}&requester_id=eq.${user.id}&select=id`,
    { token: user.token }
  );
  if (Array.isArray(existing) && existing[0]) {
    return NextResponse.json({ conversationId: existing[0].id });
  }

  try {
    const created = await pg(`/conversation`, {
      method: "POST",
      token: user.token,
      body: { teacher_id: teacherId, requester_id: user.id },
    });
    const row = Array.isArray(created) ? created[0] : created;
    return NextResponse.json({ conversationId: row.id });
  } catch (err) {
    const message =
      err instanceof PostgrestError
        ? "Connect with this teacher first before sending a message."
        : "Could not start a conversation";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
