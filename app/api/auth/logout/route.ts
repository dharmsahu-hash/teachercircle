import { NextRequest, NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/session";
import { getAppBaseUrl } from "@/lib/url";

export async function POST(req: NextRequest) {
  clearSessionCookie();
  // Same hardcoded-http:// bug as the old login redirect_to (see lib/url.ts):
  // on Vercel this built an http:// target for a 307 redirect, which
  // defaults to re-POSTing the request — a browser asked to resubmit a form
  // insecurely over http after signing out on https shows exactly the
  // warning that was reported ("information you are about to submit is not
  // secure"). 303 See Other also switches the follow-up to a GET, which is
  // what a POST-then-redirect-home should be anyway.
  const requestHost = req.headers.get("x-forwarded-host") || req.headers.get("host");
  return NextResponse.redirect(new URL("/", getAppBaseUrl(requestHost)), 303);
}
