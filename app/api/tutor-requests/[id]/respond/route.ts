import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { pgRpc, publicErrorMessage } from "@/lib/db";
import { pushVia } from "@/lib/push";
import { checkRateLimit } from "@/lib/rateLimit";
import { invalidIdResponse, isId } from "@/lib/validation";

// A listed teacher answers a request: respond_to_tutor_request() opens (or
// reuses) a conversation with the poster. Returns its id so the page can
// take the teacher straight to the message thread.
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const user = await requireSession().catch(() => null);
  if (!user) return NextResponse.json({ error: "Please sign in as a teacher to reply." }, { status: 401 });
  if (user.role !== "teacher") {
    return NextResponse.json({ error: "Only teachers can reply to a request." }, { status: 403 });
  }
  if (!isId(params.id)) return invalidIdResponse();

  const allowed = await checkRateLimit(`tutor-reply:${user.id}`, 20, 3600).catch(() => true);
  if (!allowed) return NextResponse.json({ error: "Too many replies — please try again later." }, { status: 429 });

  try {
    const conversationId = await pgRpc("respond_to_tutor_request", { p_request_id: params.id }, user.token);
    await pushVia("push_targets_for_request_poster", { p_request_id: params.id }, {
      title: "A teacher replied to your request",
      body: "Open your messages to talk to them.",
      url: `/messages/${conversationId}`,
      tag: "reply",
    });
    return NextResponse.json({ ok: true, conversationId });
  } catch (err) {
    return NextResponse.json({ error: publicErrorMessage(err, "Could not send your reply. Please try again.") }, { status: 400 });
  }
}
