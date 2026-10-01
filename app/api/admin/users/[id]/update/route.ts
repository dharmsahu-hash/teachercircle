import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { pgRpc, publicErrorMessage } from "@/lib/db";
import { adminUpdateTeacherSchema, invalidIdResponse, isId, parseJsonBody } from "@/lib/validation";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await requireAdmin().catch(() => null);
  if (!admin) return NextResponse.json({ error: "Admin only" }, { status: 403 });
  if (!isId(params.id)) return invalidIdResponse();

  const parsed = await parseJsonBody(req, adminUpdateTeacherSchema);
  if (!parsed.ok) return parsed.response;
  const patch = parsed.data;
  try {
    await pgRpc("admin_update_teacher_profile", { target_user_id: params.id, patch }, admin.token);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: publicErrorMessage(err, "Could not update this profile") }, { status: 400 });
  }
}
