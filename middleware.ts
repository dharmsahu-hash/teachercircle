import { NextResponse, type NextRequest } from "next/server";
import { canonicalRedirectUrl } from "@/lib/canonicalHost";

// Sends the *.vercel.app deployment hostnames (and the www/non-www twin) to
// the one canonical domain, so visitors only ever see and share that address.
// All the rules, and why it is safe to deploy before the domain is ready,
// are in lib/canonicalHost.ts. 308 = permanent, and keeps the method, so a
// POST to the old host is not silently turned into a GET.
export function middleware(req: NextRequest) {
  const target = canonicalRedirectUrl({
    host: req.headers.get("host"),
    pathname: req.nextUrl.pathname,
    search: req.nextUrl.search,
    env: {
      VERCEL_ENV: process.env.VERCEL_ENV,
      APP_HOSTNAME: process.env.APP_HOSTNAME,
      VERCEL_PROJECT_PRODUCTION_URL: process.env.VERCEL_PROJECT_PRODUCTION_URL,
      DISABLE_CANONICAL_REDIRECT: process.env.DISABLE_CANONICAL_REDIRECT,
    },
  });
  return target ? NextResponse.redirect(target, 308) : NextResponse.next();
}

// Everything except Next's static assets and the icon.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
