import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { pgRpc, publicErrorMessage } from "@/lib/db";
import { invalidIdResponse, isId } from "@/lib/validation";

// Admin removal of a request. admin_remove_tutor_request() re-checks
// is_admin() and writes the audit log itself.
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const admin = await requireAdmin().catch(() => null);
  if (!admin) return NextResponse.json({ error: "Admin only" }, { status: 403 });
  if (!isId(params.id)) return invalidIdResponse();
  try {
    await pgRpc("admin_remove_tutor_request", { p_request_id: params.id }, admin.token);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: publicErrorMessage(err, "Could not remove this request.") }, { status: 400 });
  }
}
