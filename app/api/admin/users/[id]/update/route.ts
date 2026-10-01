import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { pgRpc, publicErrorMessage } from "@/lib/db";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await requireAdmin().catch(() => null);
  if (!admin) return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const patch = await req.json();
  try {
    await pgRpc("admin_update_teacher_profile", { target_user_id: params.id, patch }, admin.token);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: publicErrorMessage(err, "Could not update this profile") }, { status: 400 });
  }
}
