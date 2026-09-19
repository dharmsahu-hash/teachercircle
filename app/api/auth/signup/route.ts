import { NextRequest, NextResponse } from "next/server";
import { signUpWithPassword } from "@/lib/gotrue";
import { setSessionCookie } from "@/lib/session";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { passwordStrengthError } from "@/lib/password";

export async function POST(req: NextRequest) {
  const { email, password } = await req.json();
  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
  }

  // Server-side, not just client-side — anyone can call this API directly.
  const strengthError = passwordStrengthError(password);
  if (strengthError) {
    return NextResponse.json({ error: strengthError }, { status: 400 });
  }

  // 5 signups / hour per IP — GoTrue's own mailer cap (2/hour) already limits
  // real abuse via email volume, this just stops hammering the endpoint itself.
  const allowed = await checkRateLimit(`signup:${getClientIp(req)}`, 5, 3600).catch(() => true);
  if (!allowed) {
    return NextResponse.json({ error: "Too many signup attempts — please try again later." }, { status: 429 });
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
