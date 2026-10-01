import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { pg, publicErrorMessage } from "@/lib/db";
import { parseJsonBody, submitReferenceSchema } from "@/lib/validation";

export async function POST(req: NextRequest) {
  const user = await requireSession().catch(() => null);
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const parsed = await parseJsonBody(req, submitReferenceSchema);
  if (!parsed.ok) return parsed.response;
  const { transactionId, utr } = parsed.data;

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
  } catch (err) {
    return NextResponse.json({ error: publicErrorMessage(err, "Could not submit payment reference") }, { status: 400 });
  }
}
