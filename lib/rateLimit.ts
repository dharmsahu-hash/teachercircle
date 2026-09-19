import type { NextRequest } from "next/server";
import { pgRpc } from "./db";

// True if allowed, false if the caller has exceeded p_max calls to this key
// within the last p_window_seconds. See db/migrations/0021_rate_limiting.sql.
export async function checkRateLimit(
  key: string,
  max: number,
  windowSeconds: number,
  token?: string | null
): Promise<boolean> {
  const allowed = await pgRpc(
    "check_rate_limit",
    { p_key: key, p_max: max, p_window_seconds: windowSeconds },
    token
  );
  return allowed === true;
}

// Vercel sets x-forwarded-for on every request; falls back to a constant so
// a missing header fails safe into one shared bucket rather than throwing.
export function getClientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return "unknown";
}
