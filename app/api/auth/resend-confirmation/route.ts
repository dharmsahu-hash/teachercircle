import { NextRequest, NextResponse } from "next/server";
import { resendSignupConfirmation, GoTrueError } from "@/lib/gotrue";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { parseJsonBody, resendConfirmationSchema } from "@/lib/validation";

// Sends a new signup confirmation email. For people whose first link expired,
// got lost, or (before the Supabase URL settings were fixed) pointed at
// localhost. The response is the same whether or not the email has an
// account, so this cannot be used to find out who is registered.
export async function POST(req: NextRequest) {
  const parsed = await parseJsonBody(req, resendConfirmationSchema);
  if (!parsed.ok) return parsed.response;

  // Each call sends an email: keep it tight. GoTrue has its own per-address
  // cooldown on top of this.
  const allowed = await checkRateLimit(`resend:${getClientIp(req)}`, 3, 3600).catch(() => true);
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests — please try again later." }, { status: 429 });
  }

  try {
    const requestHost = req.headers.get("x-forwarded-host") || req.headers.get("host");
    await resendSignupConfirmation(parsed.data.email, requestHost);
  } catch (err) {
    // GoTrue's per-address cooldown ("you can only request this after N
    // seconds") is worth showing; anything else stays generic.
    if (err instanceof GoTrueError && err.status === 429) {
      return NextResponse.json({ error: "Please wait a minute before asking for another email." }, { status: 429 });
    }
    console.error("resend confirmation failed", err instanceof GoTrueError ? err.status : err);
  }
  return NextResponse.json({ ok: true });
}
