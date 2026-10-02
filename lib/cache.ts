// Clears the shared read cache (lib/cachedRead.ts). Only API routes import
// this file (static "next/cache" import, which plain Node cannot load).
import { revalidateTag } from "next/cache";
import { DIRECTORY_TAG } from "./cacheConfig";

// Call after anything that changes who is listed or what a listing says.
export function invalidateDirectory(): void {
  try {
    revalidateTag(DIRECTORY_TAG);
  } catch {
    // Outside a request context (scripts, tests) there is nothing to invalidate.
  }
}
