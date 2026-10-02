import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { pgRpc, publicErrorMessage } from "@/lib/db";
import { invalidIdResponse, isId } from "@/lib/validation";

// The poster closes their own request (e.g. they found a tutor). The
// database function only matches the caller's own open requests.
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const user = await requireSession().catch(() => null);
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!isId(params.id)) return invalidIdResponse();
  try {
    await pgRpc("close_my_tutor_request", { p_request_id: params.id }, user.token);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: publicErrorMessage(err, "Could not close this request.") }, { status: 400 });
  }
}
