import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { pg, PostgrestError } from "@/lib/db";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireSession().catch(() => null);
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { reason } = await req.json().catch(() => ({}));
  const trimmed = typeof reason === "string" ? reason.trim() : "";
  if (!trimmed) return NextResponse.json({ error: "Please describe the issue" }, { status: 400 });

  try {
    await pg(`/message_report`, {
      method: "POST",
      token: user.token,
      body: { conversation_id: params.id, reporter_id: user.id, reason: trimmed },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const status = err instanceof PostgrestError ? 403 : 500;
    return NextResponse.json({ error: "Could not submit report" }, { status });
  }
}
