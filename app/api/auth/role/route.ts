import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { pgRpc } from "@/lib/db";

export async function POST(req: NextRequest) {
  const user = await requireSession().catch(() => null);
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { role, ref } = await req.json();
  if (!["student", "parent", "teacher"].includes(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  try {
    // set_my_role() is SECURITY DEFINER and only succeeds once, while role IS NULL —
    // see db/migrations/0002_role_assignment.sql.
    await pgRpc("set_my_role", { new_role: role }, user.token);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }

  // Referral (G5, 0025_referrals.sql) — best-effort, never blocks onboarding.
  // `ref` survives from a ?ref=<id> link via localStorage (see LoginForm.tsx)
  // since the user may confirm their email and land here in a separate page
  // load. An invalid/self/already-set referrer is exactly what
  // set_referred_by() is designed to reject — that's not a failure worth
  // surfacing to someone just trying to finish signing up.
  if (typeof ref === "string" && ref) {
    await pgRpc("set_referred_by", { p_referred_by: ref }, user.token).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
