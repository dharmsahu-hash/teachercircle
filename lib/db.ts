// Thin fetch wrapper around PostgREST. No ORM, no query builder — PostgREST
// already turns the Postgres schema into a REST API; this just adds the
// Authorization header and JSON handling every call needs.
//
// SUPABASE_API_KEY is unset (and this header omitted) for the self-hosted
// stack, which has no gateway in front of PostgREST to check it. Supabase
// Cloud's Kong gateway rejects every /rest/v1 request without an `apikey`
// header, bearer token or not — found wiring up production, not documented
// anywhere obvious.

const POSTGREST_URL = process.env.POSTGREST_URL || "http://localhost:3001";
const SUPABASE_API_KEY = process.env.SUPABASE_API_KEY;

type FetchOpts = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  token?: string | null;
  body?: unknown;
  headers?: Record<string, string>;
};

export async function pg(path: string, opts: FetchOpts = {}) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Prefer: "return=representation",
    ...opts.headers,
  };
  if (SUPABASE_API_KEY) headers.apikey = SUPABASE_API_KEY;
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;

  const res = await fetch(`${POSTGREST_URL}${path}`, {
    method: opts.method || "GET",
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    cache: "no-store",
  });

  const text = await res.text();
  if (!res.ok) {
    throw new PostgrestError(res.status, text);
  }
  return text ? JSON.parse(text) : null;
}

export async function pgRpc(name: string, args: Record<string, unknown> = {}, token?: string | null) {
  return pg(`/rpc/${name}`, { method: "POST", body: args, token });
}

export class PostgrestError extends Error {
  status: number;
  // Postgres's own message (`message` in PostgREST's JSON error body), e.g.
  // the text of a `raise exception` in one of our SQL functions.
  dbMessage: string | null;
  constructor(status: number, body: string) {
    super(`PostgREST error ${status}: ${body}`);
    this.status = status;
    let parsed: { message?: unknown } | null = null;
    try {
      parsed = JSON.parse(body);
    } catch {
      // non-JSON body (gateway HTML, empty) — nothing to extract
    }
    this.dbMessage = typeof parsed?.message === "string" ? parsed.message : null;
  }
}

// The `raise exception` texts our own migrations use on purpose, mapped to
// what a user should read. Anything not listed here — constraint names,
// column names, policy text, Kong/PostgREST internals — must never reach the
// client (docs/05 finding #1), so it falls through to the route's fallback.
const USER_FACING_DB_MESSAGES: Record<string, string> = {
  "not authorized": "You don't have permission to do that.",
  "user not found": "That user could not be found.",
  "not a participant": "You're not part of this conversation.",
  "conversation not found": "That conversation could not be found.",
  "transaction not pending": "This payment has already been processed.",
  "role already assigned": "Your role has already been set.",
  "invalid role": "Please choose a valid role.",
  "not connected": "Connect with this teacher first.",
  "name is required": "Name is required.",
  "invalid phone number": "Please enter a valid phone number.",
  "invalid avatar seed": "That avatar choice isn't valid.",
  "referrer not found": "That invite link isn't valid.",
  "cannot refer yourself": "You can't use your own invite link.",
  "a user with this email already exists": "A user with this email already exists.",
};

// Turns any error thrown inside a route handler into a message that is safe
// to send to the browser. The full error is logged server-side so it is
// still visible in Vercel / docker logs.
export function publicErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof PostgrestError && err.dbMessage) {
    const friendly = USER_FACING_DB_MESSAGES[err.dbMessage];
    if (friendly) return friendly;
  }
  console.error(err);
  return fallback;
}
