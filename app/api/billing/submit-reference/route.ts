import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { pg } from "@/lib/db";

export async function POST(req: NextRequest) {
  const user = await requireSession().catch(() => null);
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { transactionId, utr } = await req.json();
  if (!transactionId || !utr) {
    return NextResponse.json({ error: "transactionId and utr are required" }, { status: 400 });
  }

  try {
    // RLS (txn_owner_submit) only allows this row's owner to move it to
    // "submitted" — see db/migrations/0004_rls_policies.sql. Bug found while
    // testing (docs/04-test-report.md finding F-1): an RLS-blocked UPDATE
    // doesn't raise an error, it just matches zero rows — Postgres/PostgREST
    // return 200 with an empty array. Without checking for that, this route
    // reported "submitted" success for a transactionId belonging to a
    // DIFFERENT user, even though nothing was actually updated.
    const rows = await pg(`/payment_transaction?id=eq.${transactionId}`, {
      method: "PATCH",
      token: user.token,
      body: { status: "submitted", provider_ref: utr },
    });
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
    }
    return NextResponse.json({ status: "submitted" });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
