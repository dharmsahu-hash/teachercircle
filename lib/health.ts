// Health check behind GET /api/health (docs/05 optional list): is the app
// able to reach the database (through PostgREST) and the sign-in service
// (GoTrue) right now?
//
// - database: the same anonymous read the public search does
//   (teacher_public, one row), so it proves PostgREST, Postgres, the view
//   and anon grants all work, not just that a port is open.
// - auth: GoTrue's own /health endpoint.
//
// Each check has a short timeout so a hung dependency cannot hang the check.
// The response never includes error text, URLs or env values: it is public.

export type CheckResult = { ok: boolean; ms: number; status?: number };
export type HealthReport = {
  status: "ok" | "degraded";
  checks: { database: CheckResult; auth: CheckResult };
  version: string | null;
  time: string;
};

const TIMEOUT_MS = 3000;

async function timed(url: string, headers: Record<string, string>): Promise<CheckResult> {
  const started = Date.now();
  try {
    const res = await fetch(url, { headers, cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
    // Drain the body so the connection is released.
    await res.arrayBuffer().catch(() => undefined);
    return { ok: res.ok, ms: Date.now() - started, status: res.status };
  } catch (err) {
    console.error("health check failed", url.replace(/\?.*$/, ""), err instanceof Error ? err.name : err);
    return { ok: false, ms: Date.now() - started };
  }
}

// Env is read per call (not at module load) so tests can point it at fakes.
export async function checkHealth(): Promise<HealthReport> {
  const postgrestUrl = process.env.POSTGREST_URL || "http://localhost:3001";
  const gotrueUrl = process.env.GOTRUE_URL || "http://localhost:9999";
  const apiKey = process.env.SUPABASE_API_KEY;
  const headers: Record<string, string> = apiKey ? { apikey: apiKey } : {};

  const [database, auth] = await Promise.all([
    timed(`${postgrestUrl}/teacher_public?select=user_id&limit=1`, headers),
    timed(`${gotrueUrl}/health`, headers),
  ]);

  return {
    status: database.ok && auth.ok ? "ok" : "degraded",
    checks: { database, auth },
    // Vercel sets this at build time; handy for "which deploy is live?".
    version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
    time: new Date().toISOString(),
  };
}
