// Decodes (never verifies) a JWT payload — reading claims here is purely for
// UI branching (which onboarding step to show, whose profile this is). The
// only verification that matters happens server-side in Postgres/PostgREST
// when the token is actually used as a Bearer credential; a forged or
// expired token here would simply fail every real request downstream.
export function decodeJwt(token: string): Record<string, any> | null {
  try {
    const payload = token.split(".")[1];
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const json = Buffer.from(normalized, "base64").toString("utf8");
    return JSON.parse(json);
  } catch {
    return null;
  }
}
