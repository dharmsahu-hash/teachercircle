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
  constructor(status: number, body: string) {
    super(`PostgREST error ${status}: ${body}`);
    this.status = status;
  }
}
