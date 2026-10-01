// Server-to-server calls to GoTrue for the email/password fallback path.
// Google sign-in (when GOOGLE_CLIENT_ID is configured) is a browser redirect
// straight to GoTrue's /authorize endpoint instead — see app/login/page.tsx.
// That plain-navigation redirect never sends the `apikey` header the way
// these fetch() calls do below, but Supabase's docs show /authorize called
// exactly like that (no apikey), so it's only these POST endpoints that need it.

import { getAppBaseUrl } from "./url";

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
    const userMessage = data?.error_description || data?.msg;
    if (!userMessage) console.error(`GoTrue ${path.split("?")[0]} failed (${res.status})`, data);
    throw new GoTrueError(res.status, userMessage || "Sign-in is temporarily unavailable — please try again.");
  }
  return data;
}

// GoTrue's own error_description / msg ("Invalid login credentials", "User
// already registered", ...) is written for end users, so routes may show
// it. Any other error from a sign-in call (network failure, a bug) is not.
export class GoTrueError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function signUpWithPassword(
  email: string,
  password: string,
  requestHost?: string | null
): Promise<SignUpResult> {
  // GoTrue's SignupParams struct has no redirect_to field. It reads that
  // value only from the query string, a form field, or a redirect_to header
  // (utilities.getRedirectTo). A JSON body property is ignored, so the
  // confirmation email falls back to the project's Site URL. The query
  // parameter is what supabase-js sends. getAppBaseUrl must not be
  // localhost here: GoTrue will happily embed that, and the inbox link
  // opens a dev server. If this URL's host is not the Supabase Site URL
  // and is not on the Redirect URLs allow-list, GoTrue drops it and uses
  // Site URL instead — that dashboard value also has to be the public app
  // (docs/03-deployment.md, Step 4b).
  const redirectTo = confirmationRedirect(requestHost);
  const data = await gotrue(`/signup?redirect_to=${encodeURIComponent(redirectTo)}`, {
    email,
    password,
  });
  if (!data?.access_token) {
    return { confirmationRequired: true, user: { id: data.id, email: data.email } };
  }
  return data as GoTrueSession;
}

// Sends a fresh signup confirmation email (GoTrue POST /resend), with the
// same redirect_to rule as signup — a query parameter, not a body field.
export async function resendSignupConfirmation(email: string, requestHost?: string | null): Promise<void> {
  const redirectTo = confirmationRedirect(requestHost);
  await gotrue(`/resend?redirect_to=${encodeURIComponent(redirectTo)}`, { type: "signup", email });
}

// Where the link in a confirmation email should land. Logged (host only, no
// email) so Vercel's logs show what the app asked for: if users still land
// on localhost while this logs the public host, Supabase rejected the
// redirect and fell back to its Site URL — a dashboard setting, not code.
function confirmationRedirect(requestHost?: string | null): string {
  const redirectTo = `${getAppBaseUrl(requestHost)}/auth/callback`;
  console.info(`auth: confirmation email redirect_to host = ${new URL(redirectTo).host}`);
  return redirectTo;
}

export async function signInWithPassword(email: string, password: string): Promise<GoTrueSession> {
  return gotrue("/token?grant_type=password", { email, password }) as Promise<GoTrueSession>;
}
