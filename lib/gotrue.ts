// Server-to-server calls to GoTrue for the email/password fallback path.
// Google sign-in (when GOOGLE_CLIENT_ID is configured) is a browser redirect
// straight to GoTrue's /authorize endpoint instead — see app/login/page.tsx.
// That plain-navigation redirect never sends the `apikey` header the way
// these fetch() calls do below, but Supabase's docs show /authorize called
// exactly like that (no apikey), so it's only these POST endpoints that need it.

const GOTRUE_URL = process.env.GOTRUE_URL || "http://localhost:9999";
const SUPABASE_API_KEY = process.env.SUPABASE_API_KEY;

export type GoTrueSession = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: { id: string; email: string };
};

// GoTrue's /signup response has no top-level access_token when the project
// requires email confirmation (Supabase Cloud's default — unlike local dev's
// GOTRUE_MAILER_AUTOCONFIRM=true) — it returns just the created user, session
// pending until the confirmation link is clicked. Distinguishing this from a
// real session, rather than assuming one always comes back, matters once
// this runs against Supabase.
export type SignUpResult = GoTrueSession | { confirmationRequired: true; user: { id: string; email: string } };

async function gotrue(path: string, body: unknown) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (SUPABASE_API_KEY) headers.apikey = SUPABASE_API_KEY;

  const res = await fetch(`${GOTRUE_URL}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error_description || data?.msg || `GoTrue ${path} failed (${res.status})`);
  }
  return data;
}

export async function signUpWithPassword(email: string, password: string): Promise<SignUpResult> {
  const data = await gotrue("/signup", { email, password });
  if (!data?.access_token) {
    return { confirmationRequired: true, user: { id: data.id, email: data.email } };
  }
  return data as GoTrueSession;
}

export async function signInWithPassword(email: string, password: string): Promise<GoTrueSession> {
  return gotrue("/token?grant_type=password", { email, password }) as Promise<GoTrueSession>;
}
