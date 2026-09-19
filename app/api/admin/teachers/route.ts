import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { pgRpc } from "@/lib/db";

export async function POST(req: NextRequest) {
  const admin = await requireAdmin().catch(() => null);
  if (!admin) return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const body = await req.json();
  if (!body.email || !body.name) {
    return NextResponse.json({ error: "email and name are required" }, { status: 400 });
  }

  try {
    const subjects =
      typeof body.subjects === "string"
        ? body.subjects.split(",").map((s: string) => s.trim()).filter(Boolean)
        : body.subjects ?? [];

    // admin_add_teacher() itself re-checks is_admin() and logs itself — see
    // db/migrations/0011_admin_add_teacher.sql.
    const newId = await pgRpc(
      "admin_add_teacher",
      {
        p_email: body.email,
        p_name: body.name,
        p_city: body.city ?? null,
        p_subjects: subjects,
        p_rate_per_hour: body.rate_per_hour ? Number(body.rate_per_hour) : null,
        p_experience_years: body.experience_years ? Number(body.experience_years) : null,
        p_contact_email: body.contact_email ?? body.email,
        p_contact_phone: body.contact_phone ?? null,
      },
      admin.token
    );
    return NextResponse.json({ ok: true, userId: newId });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
