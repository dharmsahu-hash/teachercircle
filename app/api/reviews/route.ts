import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { pg } from "@/lib/db";
import { containsAbusiveLanguage, ABUSIVE_LANGUAGE_ERROR } from "@/lib/profanity";
import { checkRateLimit } from "@/lib/rateLimit";

export async function POST(req: NextRequest) {
  const user = await requireSession().catch(() => null);
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { teacherId, rating, comment } = await req.json();
  if (!teacherId || !rating) {
    return NextResponse.json({ error: "teacherId and rating are required" }, { status: 400 });
  }
  if (comment && containsAbusiveLanguage(comment)) {
    return NextResponse.json({ error: ABUSIVE_LANGUAGE_ERROR }, { status: 400 });
  }

  // 10 / hour per user — the one-review-per-teacher constraint already
  // limits repeat reviews of the same teacher; this bounds how many
  // different teachers one account can review in a burst.
  const allowed = await checkRateLimit(`review:${user.id}`, 10, 3600).catch(() => true);
  if (!allowed) {
    return NextResponse.json({ error: "Too many reviews submitted — please try again later." }, { status: 429 });
  }

  try {
    // RLS (review_insert_if_connected) rejects this unless a contact_request
    // already exists for this pair — see db/migrations/0004_rls_policies.sql.
    const rows = await pg(`/review`, {
      method: "POST",
      token: user.token,
      body: { teacher_id: teacherId, reviewer_id: user.id, rating, comment: comment ?? null },
    });
    return NextResponse.json(rows);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
