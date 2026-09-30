// Single source of truth for "what's this app's own public base URL".
// Confirmation emails, OAuth, and logout all redirect here. A missing or
// leftover APP_HOSTNAME=localhost:3000 on Vercel made those links send real
// users to a dev server.

function firstHost(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const host = raw.split(",")[0].trim().replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
  if (!host || /[\s]/.test(host)) return null;
  return host;
}

function isLocalHost(host: string): boolean {
  const name = host.split(":")[0].toLowerCase();
  return name === "localhost" || name === "127.0.0.1" || name === "0.0.0.0" || name.endsWith(".local");
}

function publicHost(raw: string | null | undefined): string | null {
  const host = firstHost(raw);
  if (!host || isLocalHost(host)) return null;
  return host;
}

// requestHost is the Host / x-forwarded-host of the current request.
// A configured public APP_HOSTNAME wins. A localhost APP_HOSTNAME does not
// hide the host the user actually signed up on, or Vercel's production domain.
export function getAppBaseUrl(requestHost?: string | null): string {
  const configured = firstHost(process.env.APP_HOSTNAME);
  const vercelProduction = publicHost(process.env.VERCEL_PROJECT_PRODUCTION_URL);
  const vercelUrl = publicHost(process.env.VERCEL_URL);
  const fromRequest = publicHost(requestHost);

  const host =
    publicHost(configured) ||
    (process.env.VERCEL_ENV === "production" ? vercelProduction : null) ||
    fromRequest ||
    vercelProduction ||
    vercelUrl ||
    configured ||
    firstHost(requestHost) ||
    "localhost:3000";

  const scheme = isLocalHost(host) ? "http" : "https";
  return `${scheme}://${host}`;
}
