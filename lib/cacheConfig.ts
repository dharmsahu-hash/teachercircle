export const DIRECTORY_TAG = "directory";

// How long shared read-only database results are cached (see lib/cache.ts).
// Pure, so it can be unit tested without Next.
//
// DIRECTORY_CACHE_SECONDS wins if set (0 disables). Otherwise 300 on
// production deploys and 0 everywhere else, so local dev, the test suites and
// stage previews always read fresh data.
export function cacheSeconds(env: Record<string, string | undefined> = process.env): number {
  const explicit = env.DIRECTORY_CACHE_SECONDS;
  if (explicit !== undefined && explicit !== "") {
    const n = Number(explicit);
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
  }
  return env.VERCEL_ENV === "production" ? 300 : 0;
}
