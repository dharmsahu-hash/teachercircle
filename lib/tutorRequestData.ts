// Reads for "I need a tutor" posts (migration 0028). Every read tolerates a
// database where 0028 has not been applied yet: it reports `available: false`
// and returns nothing, so pages show a calm "coming soon" and the sitemap
// stays valid instead of the site returning 500s (AGENTS.md: code must
// survive an unapplied migration).

import { pg, PostgrestError } from "./db";
import { isId } from "./validation";
import type { TutorRequest } from "./tutorRequest";

const PUBLIC_COLUMNS = "id,subject,city,class,board,exam,mode,details,created_at,expires_at,response_count";

export function isMissingRelation(err: unknown): boolean {
  if (!(err instanceof PostgrestError)) return false;
  return err.status === 404 || /PGRST205|42P01|schema cache|does not exist/i.test(err.message);
}

// Strips PostgREST wildcards/separators so a search box value stays a plain
// "contains" match.
const clean = (v?: string | null) => (v ?? "").replace(/[*,()%]/g, " ").trim().slice(0, 60);

export async function listOpenRequests(
  opts: { city?: string | null; subject?: string | null; limit?: number } = {}
): Promise<{ rows: TutorRequest[]; available: boolean }> {
  const parts = [`select=${PUBLIC_COLUMNS}`, "order=created_at.desc", `limit=${Math.min(opts.limit ?? 50, 200)}`];
  const city = clean(opts.city);
  const subject = clean(opts.subject);
  if (city) parts.push(`city=ilike.*${encodeURIComponent(city)}*`);
  if (subject) parts.push(`subject=ilike.*${encodeURIComponent(subject)}*`);
  try {
    return { rows: ((await pg(`/tutor_request_public?${parts.join("&")}`)) ?? []) as TutorRequest[], available: true };
  } catch (err) {
    if (isMissingRelation(err)) return { rows: [], available: false };
    throw err;
  }
}

export async function getOpenRequest(id: string): Promise<{ request: TutorRequest | null; available: boolean }> {
  if (!isId(id)) return { request: null, available: true };
  try {
    const rows = (await pg(`/tutor_request_public?id=eq.${id}&select=${PUBLIC_COLUMNS}`)) as TutorRequest[] | null;
    return { request: rows?.[0] ?? null, available: true };
  } catch (err) {
    if (isMissingRelation(err)) return { request: null, available: false };
    throw err;
  }
}

export type MyRequest = TutorRequest & { status: "open" | "closed" | "removed" };

// The signed-in poster's own requests, any status (owner RLS on the table).
export async function listMyRequests(token: string): Promise<MyRequest[]> {
  try {
    return ((await pg(
      "/tutor_request?select=id,subject,city,class,board,exam,mode,details,created_at,expires_at,status&order=created_at.desc&limit=50",
      { token }
    )) ?? []) as MyRequest[];
  } catch (err) {
    if (isMissingRelation(err)) return [];
    throw err;
  }
}
