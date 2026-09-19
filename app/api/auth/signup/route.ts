import { NextRequest, NextResponse } from "next/server";
import { signUpWithPassword } from "@/lib/gotrue";
import { setSessionCookie } from "@/lib/session";

export async function POST(req: NextRequest) {
  const { email, password } = await req.json();
  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
  }
  try {
    const result = await signUpWithPassword(email, password);
    if ("confirmationRequired" in result) {
      return NextResponse.json({ ok: true, confirmationRequired: true });
    }
    setSessionCookie(result.access_token, result.expires_in);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    // GoTrue's own message here is an internal-sounding "email rate limit
    // exceeded" — Supabase's built-in mailer is hard-capped at 2 emails/hour
    // on every plan, raised only by configuring custom SMTP (see
    // docs/03-deployment.md). Until/unless that's done, surface something a
    // real user can act on rather than an ops-facing string, and point at
    // the one sign-in path this limit never applies to.
    const isRateLimit = /rate limit/i.test(err.message);
    const message = isRateLimit
      ? "We've hit a temporary limit on confirmation emails — please try again in a few minutes, or use \"Continue with Google\" above instead."
      : err.message;
    return NextResponse.json({ error: message }, { status: isRateLimit ? 429 : 400 });
  }
}
