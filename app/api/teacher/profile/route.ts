import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { pg } from "@/lib/db";

export async function GET() {
  const user = await requireSession().catch(() => null);
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const rows = await pg(`/teacher_profile?user_id=eq.${user.id}&select=*`, { token: user.token });
  return NextResponse.json(Array.isArray(rows) ? rows[0] ?? null : null);
}

export async function POST(req: NextRequest) {
  const user = await requireSession().catch(() => null);
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (user.role !== "teacher") return NextResponse.json({ error: "Teachers only" }, { status: 403 });

  const body = await req.json();

  try {
    // Fetching the full existing row (not just its existence) is the fix for
    // a real bug the test suite caught: normalize() used to default every
    // omitted field to null/[]/true, so a client sending a partial update —
    // intentionally or via a stale/racing form — silently wiped every field
    // it didn't include. Falling back to the existing row's own values for
    // anything absent from the request body makes this a true partial
    // update. See tests/system/run.mjs §4 and docs/04-test-report.md finding F-2.
    const existingRows = await pg(`/teacher_profile?user_id=eq.${user.id}&select=*`, { token: user.token });
    const existing = Array.isArray(existingRows) ? existingRows[0] : null;
    const payload = normalize(body, existing ?? {});

    if (existing) {
      const rows = await pg(`/teacher_profile?user_id=eq.${user.id}`, {
        method: "PATCH",
        token: user.token,
        body: payload,
      });
      return NextResponse.json(Array.isArray(rows) ? rows[0] : rows);
    }
    const rows = await pg(`/teacher_profile`, {
      method: "POST",
      token: user.token,
      body: { user_id: user.id, ...payload },
    });
    return NextResponse.json(Array.isArray(rows) ? rows[0] : rows);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}

function normalize(body: any, fallback: any = {}) {
  return {
    name: body.name ?? fallback.name ?? null,
    bio: body.bio ?? fallback.bio ?? null,
    city: body.city ?? fallback.city ?? null,
    pincode: body.pincode ?? fallback.pincode ?? null,
    subjects:
      typeof body.subjects === "string"
        ? body.subjects.split(",").map((s: string) => s.trim()).filter(Boolean)
        : body.subjects ?? fallback.subjects ?? [],
    rate_per_hour:
      body.rate_per_hour !== undefined
        ? body.rate_per_hour
          ? Number(body.rate_per_hour)
          : null
        : fallback.rate_per_hour ?? null,
    experience_years:
      body.experience_years !== undefined
        ? body.experience_years
          ? Number(body.experience_years)
          : null
        : fallback.experience_years ?? null,
    contact_email: body.contact_email ?? fallback.contact_email ?? null,
    contact_phone: body.contact_phone ?? fallback.contact_phone ?? null,
    is_listed: body.is_listed ?? fallback.is_listed ?? true,
  };
}
