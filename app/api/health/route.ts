import { checkHealth } from "@/lib/health";

// Always run live: a cached health check is worse than none.
export const dynamic = "force-dynamic";

// GET /api/health -> 200 {"status":"ok",...} when the database and the
// sign-in service both respond, 503 {"status":"degraded",...} otherwise.
// Suitable for an uptime monitor (e.g. UptimeRobot) and for CI's
// "wait for the app" step.
export async function GET() {
  const report = await checkHealth();
  return Response.json(report, {
    status: report.status === "ok" ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
