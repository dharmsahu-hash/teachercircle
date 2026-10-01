import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { pg, PostgrestError } from "@/lib/db";
import { parseJsonBody, userIdSchema } from "@/lib/validation";

export async function POST(req: NextRequest) {
  const user = await requireSession().catch(() => null);
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const parsed = await parseJsonBody(req, userIdSchema);
  if (!parsed.ok) return parsed.response;
  const { userId } = parsed.data;
  if (userId === user.id) return NextResponse.json({ error: "You can't block yourself" }, { status: 400 });

  try {
    await pg(`/blocked_user`, {
      method: "POST",
      token: user.token,
      body: { blocker_id: user.id, blocked_id: userId },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    // Already blocked (unique violation) is fine — treat as success, not an error.
    if (err instanceof PostgrestError && err.status === 409) {
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Could not block user" }, { status: 400 });
  }
}
