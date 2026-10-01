import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { pgRpc, publicErrorMessage } from "@/lib/db";
import { invalidIdResponse, isId } from "@/lib/validation";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const admin = await requireAdmin().catch(() => null);
  if (!admin) return NextResponse.json({ error: "Admin only" }, { status: 403 });
  if (!isId(params.id)) return invalidIdResponse();

  try {
    await pgRpc("admin_soft_delete_profile", { target_user_id: params.id }, admin.token);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: publicErrorMessage(err, "Could not delete this profile") }, { status: 400 });
  }
}
