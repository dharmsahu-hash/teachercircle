import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { pgRpc } from "@/lib/db";
import { clearSessionCookie } from "@/lib/session";

export async function POST() {
  const user = await requireSession().catch(() => null);
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  // set_my_deleted() is SECURITY DEFINER and only ever touches auth.uid()'s
  // own rows — soft-delete, not a destructive DELETE. See
  // db/migrations/0005_profile_lifecycle_admin.sql.
  await pgRpc("set_my_deleted", {}, user.token);
  clearSessionCookie();
  return NextResponse.json({ ok: true });
}
