import { NextRequest, NextResponse } from "next/server";
import { signInWithPassword, GoTrueError } from "@/lib/gotrue";
import { publicErrorMessage } from "@/lib/db";
import { setSessionCookie } from "@/lib/session";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { loginSchema, parseJsonBody } from "@/lib/validation";

export async function POST(req: NextRequest) {
  const parsed = await parseJsonBody(req, loginSchema);
  if (!parsed.ok) return parsed.response;
  const { email, password } = parsed.data;

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
  } catch (err) {
    if (err instanceof GoTrueError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    return NextResponse.json({ error: publicErrorMessage(err, "Could not sign you in — please try again.") }, { status: 500 });
  }
}
