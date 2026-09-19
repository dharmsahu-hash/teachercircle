import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { pg } from "@/lib/db";

export async function DELETE(_req: NextRequest, { params }: { params: { userId: string } }) {
  const user = await requireSession().catch(() => null);
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  await pg(`/blocked_user?blocker_id=eq.${user.id}&blocked_id=eq.${params.userId}`, {
    method: "DELETE",
    token: user.token,
  }).catch(() => null);

  return NextResponse.json({ ok: true });
}
