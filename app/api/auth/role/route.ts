import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { pgRpc } from "@/lib/db";

export async function POST(req: NextRequest) {
  const user = await requireSession().catch(() => null);
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { role } = await req.json();
  if (!["student", "parent", "teacher"].includes(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  try {
    // set_my_role() is SECURITY DEFINER and only succeeds once, while role IS NULL —
    // see db/migrations/0002_role_assignment.sql.
    await pgRpc("set_my_role", { new_role: role }, user.token);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
