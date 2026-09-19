import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { pg } from "@/lib/db";

export async function DELETE(_req: Request, { params }: { params: { teacherId: string } }) {
  const user = await requireSession().catch(() => null);
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  await pg(`/favorite_teacher?user_id=eq.${user.id}&teacher_id=eq.${params.teacherId}`, {
    method: "DELETE",
    token: user.token,
  });
  return NextResponse.json({ ok: true });
}
