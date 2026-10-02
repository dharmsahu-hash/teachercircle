// Reads from the teacher_public view, tolerating a database that has not
// had migration 0027 (teaching_mode, classes, boards, exams) applied yet.
//
// Why: code and migrations deploy separately. On 2026-10-02 the 0027 code
// reached production before the migration did, and every query selecting the
// new columns failed (PostgREST 400, "column ... does not exist"): /search
// and teacher pages returned 500 and the directory went empty. With this
// helper the site keeps working on the old columns and simply has no
// online/class/exam data until the migration is applied — then it picks the
// columns up again by itself (re-checked every minute).

import { pg, PostgrestError } from "./db";

export const LEVEL_COLUMNS = ["teaching_mode", "classes", "boards", "exams"];

const RECHECK_MS = 60_000;
let levelsMissingSince: number | null = null;

function isMissingLevelColumn(err: unknown): boolean {
  if (!(err instanceof PostgrestError) || err.status !== 400) return false;
  const text = `${err.dbMessage ?? ""} ${err.message}`;
  return /does not exist|42703|PGRST204|could not find/i.test(text) && LEVEL_COLUMNS.some((c) => text.includes(c));
}

// Strips the 0027 columns from a select list and drops filters on them.
function withoutLevels(query: string): string {
  const params = new URLSearchParams(query);
  const out: string[] = [];
  for (const [key, value] of params) {
    if (LEVEL_COLUMNS.includes(key)) continue; // a filter on a missing column
    // URLSearchParams decoded the values; encode them again so a city like
    // "A & B" cannot split into two parameters.
    if (key === "select") {
      const cols = value.split(",").filter((c) => !LEVEL_COLUMNS.includes(c.trim()));
      out.push(`select=${encodeURIComponent(cols.join(","))}`);
    } else {
      out.push(`${key}=${encodeURIComponent(value)}`);
    }
  }
  return out.join("&");
}

export type TeacherPublicResult<T> = { rows: T[]; levelsAvailable: boolean };

// `query` is the part after "/teacher_public?", exactly as before (already
// URL-encoded where needed).
export async function queryTeacherPublic<T = Record<string, unknown>>(
  query: string,
  opts: { token?: string | null } = {}
): Promise<TeacherPublicResult<T>> {
  const recentlyMissing = levelsMissingSince !== null && Date.now() - levelsMissingSince < RECHECK_MS;
  if (!recentlyMissing) {
    try {
      const rows = ((await pg(`/teacher_public?${query}`, { token: opts.token })) ?? []) as T[];
      levelsMissingSince = null;
      return { rows, levelsAvailable: true };
    } catch (err) {
      if (!isMissingLevelColumn(err)) throw err;
      console.warn(
        "teacher_public has no teaching_mode/classes/boards/exams columns: apply db/migrations/0027_teaching_mode_and_levels.sql. Serving without them."
      );
      levelsMissingSince = Date.now();
    }
  }
  const rows = ((await pg(`/teacher_public?${withoutLevels(query)}`, { token: opts.token })) ?? []) as T[];
  return { rows, levelsAvailable: false };
}

// For tests.
export function _resetLevelsCheck() {
  levelsMissingSince = null;
}
