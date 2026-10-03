import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { pgRpc } from "@/lib/db";
import { parseJsonBody, pushUnsubscribeSchema } from "@/lib/validation";

// Turn alerts off for this browser.
export async function POST(req: NextRequest) {
  const user = await requireSession().catch(() => null);
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const parsed = await parseJsonBody(req, pushUnsubscribeSchema);
  if (!parsed.ok) return parsed.response;
  try {
    await pgRpc("remove_push_subscription", { p_endpoint: parsed.data.endpoint }, user.token);
  } catch {
    // Already gone, or the feature is not set up: the result is the same.
  }
  return NextResponse.json({ ok: true });
}
