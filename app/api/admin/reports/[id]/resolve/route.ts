import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { pg } from "@/lib/db";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const admin = await requireAdmin().catch(() => null);
  if (!admin) return NextResponse.json({ error: "Admin only" }, { status: 403 });

  await pg(`/message_report?id=eq.${params.id}`, {
    method: "PATCH",
    token: admin.token,
    body: { resolved_at: new Date().toISOString() },
  });

  return NextResponse.json({ ok: true });
}
