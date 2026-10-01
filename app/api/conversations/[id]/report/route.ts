import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { pg, PostgrestError } from "@/lib/db";
import { checkRateLimit } from "@/lib/rateLimit";
import { invalidIdResponse, isId, parseJsonBody, reportSchema } from "@/lib/validation";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireSession().catch(() => null);
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!isId(params.id)) return invalidIdResponse();

  const parsed = await parseJsonBody(req, reportSchema);
  if (!parsed.ok) return parsed.response;
  const trimmed = parsed.data.reason.trim();
  if (!trimmed) return NextResponse.json({ error: "Please describe the issue" }, { status: 400 });

  // 5 / hour per user — reports are rare in normal use; this just stops
  // someone from flooding the admin queue.
  const allowed = await checkRateLimit(`report:${user.id}`, 5, 3600).catch(() => true);
  if (!allowed) {
    return NextResponse.json({ error: "Too many reports submitted — please try again later." }, { status: 429 });
  }

  try {
    await pg(`/message_report`, {
      method: "POST",
      token: user.token,
      body: { conversation_id: params.id, reporter_id: user.id, reason: trimmed },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const status = err instanceof PostgrestError ? 403 : 500;
    return NextResponse.json({ error: "Could not submit report" }, { status });
  }
}
