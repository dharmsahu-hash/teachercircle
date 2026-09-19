import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { pgRpc } from "@/lib/db";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const admin = await requireAdmin().catch(() => null);
  if (!admin) return NextResponse.json({ error: "Admin only" }, { status: 403 });

  try {
    await pgRpc("admin_soft_delete_profile", { target_user_id: params.id }, admin.token);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
