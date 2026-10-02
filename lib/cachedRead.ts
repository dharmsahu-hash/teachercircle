// Short-lived cache for read-only database results that every visitor shares
// (the teacher directory, home page counts, the sitemap's teacher list).
//
// Why: these pages are rendered per request and each used to run its own
// query, the directory pages loading the WHOLE teacher list every time. On the
// free tiers (Supabase 5 GB transfer, Vercel 1M function calls) that is the
// first thing to run out. With a 5-minute cache the database sees one such
// query per window instead of one per visit.
//
// Lifetime: see lib/cacheConfig.ts (300 s in production, none elsewhere, so
// tests and previews read fresh data). Writers clear it through
// invalidateDirectory() in lib/cache.ts.
//
// "next/cache" is imported lazily, only when a cached read runs: this module
// is imported by lib/directory.ts, which the unit tests load under plain
// Node, where "next/cache" cannot be resolved.

import { cacheSeconds, DIRECTORY_TAG } from "./cacheConfig";

// Wraps `fn`. `keyParts` must identify the query (it is part of the cache key).
// `fn` must THROW on failure: errors are then not cached.
export function cachedRead<T>(keyParts: string[], fn: () => Promise<T>): () => Promise<T> {
  const seconds = cacheSeconds();
  if (seconds === 0) return fn;
  let cached: (() => Promise<T>) | null = null;
  return async () => {
    if (!cached) {
      const { unstable_cache } = await import("next/cache");
      cached = unstable_cache(fn, ["read", ...keyParts], { revalidate: seconds, tags: [DIRECTORY_TAG] });
    }
    return cached();
  };
}
