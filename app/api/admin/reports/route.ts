import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { pg } from "@/lib/db";

export async function GET() {
  const admin = await requireAdmin().catch(() => null);
  if (!admin) return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const rows = await pg(`/message_report?select=*&order=created_at.asc`, { token: admin.token });
  return NextResponse.json(rows ?? []);
}
