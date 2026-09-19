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
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
