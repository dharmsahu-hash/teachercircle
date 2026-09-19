import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { pgRpc } from "@/lib/db";

// FR-21: admin can create a profile on behalf of an already-registered user
// who hasn't completed onboarding. Deliberately does NOT create a login
// identity for someone who has never signed in — see the scope note in §27
// of the design doc.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await requireAdmin().catch(() => null);
  if (!admin) return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const { name, city } = await req.json();
  try {
    await pgRpc(
      "admin_create_teacher_profile",
      { target_user_id: params.id, p_name: name, p_city: city },
      admin.token
    );
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
