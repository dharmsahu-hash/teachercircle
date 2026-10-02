import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { pgRpc, publicErrorMessage } from "@/lib/db";
import { adminCreateTeacherSchema, invalidIdResponse, isId, parseJsonBody } from "@/lib/validation";
import { invalidateDirectory } from "@/lib/cache";

// FR-21: admin can create a profile on behalf of an already-registered user
// who hasn't completed onboarding. Deliberately does NOT create a login
// identity for someone who has never signed in — see the scope note in §27
// of the design doc.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await requireAdmin().catch(() => null);
  if (!admin) return NextResponse.json({ error: "Admin only" }, { status: 403 });
  if (!isId(params.id)) return invalidIdResponse();

  const parsed = await parseJsonBody(req, adminCreateTeacherSchema);
  if (!parsed.ok) return parsed.response;
  const { name, city } = parsed.data;
  try {
    await pgRpc(
      "admin_create_teacher_profile",
      { target_user_id: params.id, p_name: name, p_city: city },
      admin.token
    );
    invalidateDirectory();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: publicErrorMessage(err, "Could not create teacher profile") }, { status: 400 });
  }
}
