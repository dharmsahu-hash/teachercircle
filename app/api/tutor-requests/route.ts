import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { pgRpc, publicErrorMessage } from "@/lib/db";
import { pushVia } from "@/lib/push";
import { ABUSIVE_LANGUAGE_ERROR, containsAbusiveLanguage } from "@/lib/profanity";
import { checkRateLimit } from "@/lib/rateLimit";
import { CONTACT_INFO_ERROR, containsContactInfo, normalizeSubject, requestPath } from "@/lib/tutorRequest";
import { parseJsonBody, postTutorRequestSchema } from "@/lib/validation";

// POST /api/tutor-requests — a signed-in student or parent posts an
// "I need a tutor" request (migration 0028). The poster's identity is never
// part of the public page; teachers reply through in-app messages.
export async function POST(req: NextRequest) {
  const user = await requireSession().catch(() => null);
  if (!user) return NextResponse.json({ error: "Please sign in to post a request." }, { status: 401 });
  if (user.role !== "student" && user.role !== "parent") {
    return NextResponse.json({ error: "Only students and parents can post a tutor request." }, { status: 403 });
  }

  const parsed = await parseJsonBody(req, postTutorRequestSchema);
  if (!parsed.ok) return parsed.response;
  const v = parsed.data;
  const subject = normalizeSubject(v.subject);
  const city = v.city?.trim() || null;

  // Public text: no abuse, no phone numbers / emails / links.
  for (const text of [subject, city ?? "", v.details ?? ""]) {
    if (containsAbusiveLanguage(text)) return NextResponse.json({ error: ABUSIVE_LANGUAGE_ERROR }, { status: 400 });
    if (containsContactInfo(text)) return NextResponse.json({ error: CONTACT_INFO_ERROR }, { status: 400 });
  }

  const allowed = await checkRateLimit(`tutor-request:${user.id}`, 3, 86400).catch(() => true);
  if (!allowed) {
    return NextResponse.json({ error: "You've posted several requests today — please try again tomorrow." }, { status: 429 });
  }

  try {
    const id = (await pgRpc(
      "post_tutor_request",
      {
        p_subject: subject,
        p_city: city,
        p_class: v.cls || null,
        p_board: v.board || null,
        p_exam: v.exam || null,
        p_mode: v.mode,
        p_details: v.details || null,
      },
      user.token
    )) as string;
    // Free browser alert to teachers who match. Best-effort, never blocks the post.
    const where = v.mode === "online" ? "online" : city ? `in ${city}` : "";
    await pushVia("push_targets_for_request", { p_request_id: id }, {
      title: "New student request for you",
      body: `${subject}${where ? " " + where : ""} - reply first.`,
      url: `/tutor-requests/${id}`,
      tag: "request",
    });
    return NextResponse.json({ ok: true, id, path: requestPath({ id, subject, city, class: v.cls || null }) });
  } catch (err) {
    return NextResponse.json({ error: publicErrorMessage(err, "Could not post your request. Please try again.") }, { status: 400 });
  }
}
