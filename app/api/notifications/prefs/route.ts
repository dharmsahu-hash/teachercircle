import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { pgRpc, publicErrorMessage } from "@/lib/db";
import { isMissingRelation } from "@/lib/tutorRequestData";
import { notificationPrefsSchema, parseJsonBody } from "@/lib/validation";

export async function GET() {
  const user = await requireSession().catch(() => null);
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  try {
    return NextResponse.json({ available: true, prefs: await pgRpc("my_notification_prefs", {}, user.token) });
  } catch (err) {
    if (isMissingRelation(err)) return NextResponse.json({ available: false });
    return NextResponse.json({ error: publicErrorMessage(err, "Could not load settings.") }, { status: 400 });
  }
}

export async function POST(req: NextRequest) {
  const user = await requireSession().catch(() => null);
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const parsed = await parseJsonBody(req, notificationPrefsSchema);
  if (!parsed.ok) return parsed.response;
  const v = parsed.data;
  try {
    const prefs = await pgRpc(
      "set_my_notification_prefs",
      { p_email_digest: v.emailDigest, p_push_requests: v.pushRequests, p_push_messages: v.pushMessages, p_push_quiz: v.pushQuiz },
      user.token
    );
    return NextResponse.json({ ok: true, prefs });
  } catch (err) {
    if (isMissingRelation(err)) return NextResponse.json({ available: false }, { status: 503 });
    return NextResponse.json({ error: publicErrorMessage(err, "Could not save settings.") }, { status: 400 });
  }
}
