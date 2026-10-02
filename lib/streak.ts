// Streak bookkeeping for the daily quiz. Pure, so the same rules run in the
// browser (anonymous players keep their streak in localStorage at zero server
// cost) and are mirrored in SQL (record_daily_quiz in migration 0029) for
// signed-in players. A "day" is the date in India (see todayIST).

import { addDays } from "./dailyQuiz";

export type StreakState = {
  current: number; // days in a row, as of lastDate
  best: number;
  lastDate: string | null; // last day a quiz was completed
  total: number; // quizzes completed
};

export const EMPTY_STREAK: StreakState = { current: 0, best: 0, lastDate: null, total: 0 };

// Completing today's quiz. Playing again the same day changes nothing.
export function applyCompletion(s: StreakState, today: string): StreakState {
  if (s.lastDate === today) return s;
  const current = s.lastDate === addDays(today, -1) ? s.current + 1 : 1;
  return { current, best: Math.max(s.best, current), lastDate: today, total: s.total + 1 };
}

// The streak to show: it is lost once a whole day was missed.
export function visibleStreak(s: StreakState, today: string): number {
  if (!s.lastDate) return 0;
  return s.lastDate === today || s.lastDate === addDays(today, -1) ? s.current : 0;
}

export function playedToday(s: StreakState, today: string): boolean {
  return s.lastDate === today;
}

// Reads whatever is in storage or an API response without trusting its shape.
export function parseStreak(raw: unknown): StreakState {
  if (!raw || typeof raw !== "object") return EMPTY_STREAK;
  const o = raw as Record<string, unknown>;
  const int = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 100_000 ? v : 0);
  const last = typeof o.lastDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(o.lastDate) ? o.lastDate : null;
  const current = int(o.current);
  return { current, best: Math.max(int(o.best), current), lastDate: last, total: int(o.total) };
}

// Combines the streak kept in this browser with the one saved on the account
// (used once when a player signs in). Keeps whichever is longer and still alive.
export function mergeStreaks(local: StreakState, server: StreakState, today: string): StreakState {
  const localAlive = visibleStreak(local, today) > 0;
  const serverAlive = visibleStreak(server, today) > 0;
  const best = Math.max(local.best, server.best);
  const total = Math.max(local.total, server.total);
  if (localAlive && (!serverAlive || local.current > server.current)) {
    const lastDate = server.lastDate && server.lastDate > (local.lastDate ?? "") ? server.lastDate : local.lastDate;
    return { current: local.current, best: Math.max(best, local.current), lastDate, total };
  }
  return { ...server, best: Math.max(best, server.current), total };
}
