import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { pg, PostgrestError } from "@/lib/db";

export async function GET() {
  const user = await requireSession().catch(() => null);
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const favorites = await pg(`/favorite_teacher?user_id=eq.${user.id}&select=teacher_id&order=created_at.desc`, {
    token: user.token,
  });
  const teacherIds: string[] = (favorites ?? []).map((f: any) => f.teacher_id);
  if (teacherIds.length === 0) return NextResponse.json([]);

  // teacher_public is a view (no direct foreign key PostgREST can embed
  // through), so this is two queries rather than one embedded fetch — same
  // pattern already used for admin/reports's participant lookups.
  const teachers = await pg(
    `/teacher_public?user_id=in.(${teacherIds.join(",")})&select=user_id,name,bio,subjects,city,rate_per_hour,experience_years,avg_rating,review_count,is_subscribed,avatar_url,avatar_seed,self_attested_at`,
    { token: user.token }
  );
  // Preserve favorited order (most recently saved first), not whatever order
  // the `in.()` query happens to return.
  const byId = new Map((teachers ?? []).map((t: any) => [t.user_id, t]));
  const ordered = teacherIds.map((id) => byId.get(id)).filter(Boolean);
  return NextResponse.json(ordered);
}

export async function POST(req: NextRequest) {
  const user = await requireSession().catch(() => null);
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { teacherId } = await req.json().catch(() => ({}));
  if (!teacherId) return NextResponse.json({ error: "teacherId is required" }, { status: 400 });

  try {
    await pg(`/favorite_teacher`, {
      method: "POST",
      token: user.token,
      body: { user_id: user.id, teacher_id: teacherId },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    // Already favorited (duplicate primary key) is not an error the caller
    // needs to see — the end state ("this teacher is saved") is the same.
    if (err instanceof PostgrestError && err.status === 409) return NextResponse.json({ ok: true });
    return NextResponse.json({ error: "Could not save teacher" }, { status: 400 });
  }
}
