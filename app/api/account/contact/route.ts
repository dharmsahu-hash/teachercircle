import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { pgRpc, PostgrestError } from "@/lib/db";
import { isValidFullName, isValidPhone } from "@/lib/contact";

export async function POST(req: NextRequest) {
  const user = await requireSession().catch(() => null);
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
  const phone = typeof body.phone === "string" && body.phone.trim() ? body.phone.trim() : null;

  if (!isValidFullName(fullName)) {
    return NextResponse.json({ error: "Please enter your name" }, { status: 400 });
  }
  if (!isValidPhone(phone)) {
    return NextResponse.json({ error: "Please enter a valid phone number" }, { status: 400 });
  }

  try {
    await pgRpc("set_my_contact_info", { new_full_name: fullName, new_phone: phone }, user.token);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const status = err instanceof PostgrestError ? 400 : 500;
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status });
  }
}
