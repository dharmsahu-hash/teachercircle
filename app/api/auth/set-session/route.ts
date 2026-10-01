import { NextRequest, NextResponse } from "next/server";
import { setSessionCookie } from "@/lib/session";
import { parseJsonBody, setSessionSchema } from "@/lib/validation";

// Called by app/auth/callback/page.tsx after a Google OAuth redirect — GoTrue
// hands the tokens back in the URL fragment (never sent to any server), so a
// tiny client-side page reads them and POSTs here to store an httpOnly cookie.
export async function POST(req: NextRequest) {
  const parsed = await parseJsonBody(req, setSessionSchema);
  if (!parsed.ok) return parsed.response;
  const { access_token, expires_in } = parsed.data;
  setSessionCookie(access_token, Number(expires_in) || 3600);
  return NextResponse.json({ ok: true });
}
