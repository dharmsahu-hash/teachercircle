import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { pgRpc, publicErrorMessage } from "@/lib/db";
import { isId, parseJsonBody, roleSchema } from "@/lib/validation";

export async function POST(req: NextRequest) {
  const user = await requireSession().catch(() => null);
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const parsed = await parseJsonBody(req, roleSchema);
  if (!parsed.ok) return parsed.response;
  const { role, ref } = parsed.data;

  try {
    // set_my_role() is SECURITY DEFINER and only succeeds once, while role IS NULL —
    // see db/migrations/0002_role_assignment.sql.
    await pgRpc("set_my_role", { new_role: role }, user.token);
  } catch (err) {
    return NextResponse.json({ error: publicErrorMessage(err, "Could not save your role") }, { status: 400 });
  }

  // Referral (G5, 0025_referrals.sql) — best-effort, never blocks onboarding.
  // `ref` survives from a ?ref=<id> link via localStorage (see LoginForm.tsx)
  // since the user may confirm their email and land here in a separate page
  // load. An invalid/self/already-set referrer is exactly what
  // set_referred_by() is designed to reject — that's not a failure worth
  // surfacing to someone just trying to finish signing up.
  if (isId(ref)) {
    await pgRpc("set_referred_by", { p_referred_by: ref }, user.token).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
