import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { canReveal } from "@/lib/entitlement";
import { pg, pgRpc, PostgrestError } from "@/lib/db";

export async function POST(req: NextRequest, { params }: { params: { teacherId: string } }) {
  const user = await requireSession().catch(() => null);
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const entitlement = await canReveal(user.token, user.id);
  if (!entitlement.allowed) {
    return NextResponse.json(
      { error: "upgrade_required", freeRemaining: entitlement.freeRemaining },
      { status: 402 }
    );
  }

  try {
    await pg(`/contact_request`, {
      method: "POST",
      token: user.token,
      body: { teacher_id: params.teacherId, requester_id: user.id },
    });
  } catch (err) {
    // A repeat connect to the same teacher is fine — the reveal below still
    // works since a contact_request row from an earlier visit already exists.
    if (!(err instanceof PostgrestError)) throw err;
  }

  try {
    const contact = await pgRpc(
      "reveal_teacher_contact",
      { target_teacher_id: params.teacherId },
      user.token
    );
    return NextResponse.json({ contact });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
