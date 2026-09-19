import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { pgRpc } from "@/lib/db";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const admin = await requireAdmin().catch(() => null);
  if (!admin) return NextResponse.json({ error: "Admin only" }, { status: 403 });

  try {
    // approve_payment() itself re-checks is_admin() — see
    // db/migrations/0003_billing_schema.sql. This route check is UX, not the
    // real gate.
    await pgRpc("approve_payment", { txn_id: params.id }, admin.token);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
