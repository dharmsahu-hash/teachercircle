import { NextRequest, NextResponse } from "next/server";
import { signInWithPassword } from "@/lib/gotrue";
import { setSessionCookie } from "@/lib/session";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

export async function POST(req: NextRequest) {
  const { email, password } = await req.json();
  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
  }

  // 10 attempts / 5 min per IP — generous enough for a real user who mistypes
  // a password a few times, tight enough to blunt casual brute-forcing.
  const allowed = await checkRateLimit(`login:${getClientIp(req)}`, 10, 300).catch(() => true);
  if (!allowed) {
    return NextResponse.json({ error: "Too many attempts — please try again in a few minutes." }, { status: 429 });
  }

  try {
    const session = await signInWithPassword(email, password);
    setSessionCookie(session.access_token, session.expires_in);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 401 });
  }
}
