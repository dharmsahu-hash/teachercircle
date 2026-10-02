// One public address for the site (e.g. teacherscircle.co.in): in production,
// requests that arrive on the *.vercel.app deployment hostnames, or on the
// www/non-www twin of the canonical domain, get a permanent redirect to the
// canonical host. Pure functions, so they are unit tested; middleware.ts is
// the thin wrapper that applies them.
//
// Safety rules (a wrong redirect target takes the whole site down):
//  - only when VERCEL_ENV === "production": preview deployments (the stage
//    branch) keep their own *.vercel.app URLs, and local dev is untouched;
//  - only when a canonical domain is configured AND it is not itself a
//    vercel.app / localhost host, so a half-finished setup does nothing;
//  - DISABLE_CANONICAL_REDIRECT=1 switches it off without a code change.

export type HostEnv = {
  VERCEL_ENV?: string;
  APP_HOSTNAME?: string;
  VERCEL_PROJECT_PRODUCTION_URL?: string;
  DISABLE_CANONICAL_REDIRECT?: string;
};

// "https://Example.com:443/path" -> "example.com"
export function cleanHost(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const host = raw
    .split(",")[0]
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/:\d+$/, "");
  return host && !/\s/.test(host) ? host : null;
}

function isLocal(host: string): boolean {
  return host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0" || host.endsWith(".local") || host.endsWith(".localhost");
}

// APP_HOSTNAME wins. VERCEL_PROJECT_PRODUCTION_URL is Vercel's own pick of
// the project's production domain (the shortest custom one when there is
// one), so it is a sensible fallback once a custom domain is attached.
export function canonicalHost(env: HostEnv): string | null {
  for (const candidate of [env.APP_HOSTNAME, env.VERCEL_PROJECT_PRODUCTION_URL]) {
    const host = cleanHost(candidate);
    if (host && !isLocal(host) && !host.endsWith(".vercel.app")) return host;
  }
  return null;
}

// The www / non-www twin that should also redirect to the canonical host.
export function twinHost(canonical: string): string {
  return canonical.startsWith("www.") ? canonical.slice(4) : `www.${canonical}`;
}

// Returns the URL to permanently redirect to, or null to serve the request.
export function canonicalRedirectUrl(args: {
  host: string | null | undefined;
  pathname: string;
  search?: string;
  env: HostEnv;
}): string | null {
  const { env } = args;
  if (env.VERCEL_ENV !== "production") return null;
  if (env.DISABLE_CANONICAL_REDIRECT === "1") return null;
  const canonical = canonicalHost(env);
  if (!canonical) return null;
  const host = cleanHost(args.host);
  if (!host || host === canonical) return null;
  if (!host.endsWith(".vercel.app") && host !== twinHost(canonical)) return null; // unknown host: leave alone
  return `https://${canonical}${args.pathname}${args.search ?? ""}`;
}
