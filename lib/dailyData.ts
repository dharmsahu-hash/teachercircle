// Reads of a signed-in player's saved streak (migration 0029). Tolerates a
// database where 0029 has not been applied yet: returns null, and the quiz
// still works with the streak kept in the browser (AGENTS.md: code must
// survive an unapplied migration).

import { pg } from "./db";
import { parseStreak, type StreakState } from "./streak";
import { isMissingRelation } from "./tutorRequestData";

export async function getMyStreak(token: string): Promise<StreakState | null> {
  try {
    const rows = (await pg("/daily_streak?select=current_streak,best_streak,last_date,total_quizzes&limit=1", { token })) as
      | { current_streak: number; best_streak: number; last_date: string | null; total_quizzes: number }[]
      | null;
    const r = rows?.[0];
    return r ? parseStreak({ current: r.current_streak, best: r.best_streak, lastDate: r.last_date, total: r.total_quizzes }) : parseStreak(null);
  } catch (err) {
    if (isMissingRelation(err)) return null;
    throw err;
  }
}
