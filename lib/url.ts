// Single source of truth for "what's this app's own public base URL" —
// extracted after a real bug (hardcoded http:// broke Google OAuth on
// Vercel's HTTPS-only domain) showed this logic needs to live in exactly
// one place, not be re-derived per call site.
export function getAppBaseUrl(): string {
  const appHostname = process.env.APP_HOSTNAME || "localhost:3000";
  const scheme = appHostname.startsWith("localhost") ? "http" : "https";
  return `${scheme}://${appHostname}`;
}
