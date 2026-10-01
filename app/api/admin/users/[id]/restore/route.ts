import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { pgRpc, publicErrorMessage } from "@/lib/db";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const admin = await requireAdmin().catch(() => null);
  if (!admin) return NextResponse.json({ error: "Admin only" }, { status: 403 });

  try {
    await pgRpc("admin_restore_profile", { target_user_id: params.id }, admin.token);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: publicErrorMessage(err, "Could not restore this profile") }, { status: 400 });
  }
}
