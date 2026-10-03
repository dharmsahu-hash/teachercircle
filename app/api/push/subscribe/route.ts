import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { pgRpc, publicErrorMessage } from "@/lib/db";
import { isAllowedPushEndpoint } from "@/lib/pushEndpoint";
import { isMissingRelation } from "@/lib/tutorRequestData";
import { parseJsonBody, pushSubscribeSchema } from "@/lib/validation";

// A signed-in user turns on alerts for this browser. The endpoint must belong
// to a known push service (our server will POST to it later).
export async function POST(req: NextRequest) {
  const user = await requireSession().catch(() => null);
  if (!user) return NextResponse.json({ error: "Please sign in to turn on alerts." }, { status: 401 });

  const parsed = await parseJsonBody(req, pushSubscribeSchema);
  if (!parsed.ok) return parsed.response;
  const { endpoint, keys } = parsed.data;
  if (!isAllowedPushEndpoint(endpoint)) {
    return NextResponse.json({ error: "This browser's push service is not supported." }, { status: 400 });
  }

  try {
    await pgRpc(
      "save_push_subscription",
      { p_endpoint: endpoint, p_p256dh: keys.p256dh, p_auth: keys.auth, p_user_agent: req.headers.get("user-agent") ?? null },
      user.token
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (isMissingRelation(err)) return NextResponse.json({ error: "Alerts are not available yet." }, { status: 503 });
    return NextResponse.json({ error: publicErrorMessage(err, "Could not turn on alerts.") }, { status: 400 });
  }
}
