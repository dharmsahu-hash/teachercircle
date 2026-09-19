import { NextRequest, NextResponse } from "next/server";
import { signInWithPassword } from "@/lib/gotrue";
import { setSessionCookie } from "@/lib/session";

export async function POST(req: NextRequest) {
  const { email, password } = await req.json();
  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
  }
  try {
    const session = await signInWithPassword(email, password);
    setSessionCookie(session.access_token, session.expires_in);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 401 });
  }
}
