import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/session";
import { getAppBaseUrl } from "@/lib/url";

export async function POST() {
  clearSessionCookie();
  // Same hardcoded-http:// bug as the old login redirect_to (see lib/url.ts):
  // on Vercel this built an http:// target for a 307 redirect, which
  // defaults to re-POSTing the request — a browser asked to resubmit a form
  // insecurely over http after signing out on https shows exactly the
  // warning that was reported ("information you are about to submit is not
  // secure"). 303 See Other also switches the follow-up to a GET, which is
  // what a POST-then-redirect-home should be anyway.
  return NextResponse.redirect(new URL("/", getAppBaseUrl()), 303);
}
