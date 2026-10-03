import { NextRequest, NextResponse } from "next/server";
import { pgRpc } from "@/lib/db";
import { getJobSecret, verifyUnsubscribe } from "@/lib/jobSecret";

// Target of the confirm button on /unsubscribe. A form post (not a plain link)
// so mail scanners that pre-open links cannot opt anyone out by accident.
export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  const token = form?.get("t");
  const secret = getJobSecret();
  const userId = secret ? verifyUnsubscribe(token, secret) : null;
  const back = new URL("/unsubscribe", req.nextUrl.origin);
  if (!secret || !userId) {
    back.searchParams.set("status", "invalid");
    return NextResponse.redirect(back, 303);
  }
  try {
    await pgRpc("set_digest_optout", { p_secret: secret, p_user_id: userId });
    back.searchParams.set("status", "done");
  } catch {
    back.searchParams.set("status", "error");
  }
  return NextResponse.redirect(back, 303);
}
