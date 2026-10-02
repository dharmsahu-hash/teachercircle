"use client";

// The player's streak and finished quizzes, kept in this browser
// (localStorage). Anonymous players never touch the server; signed-in players
// are mirrored to their account (components/StreakSync.tsx). Every read and
// write is guarded: storage can be blocked (private mode) and must never
// break the page.

import { EMPTY_STREAK, parseStreak, type StreakState } from "./streak";

const STREAK_KEY = "tc_daily_streak";
const DONE_KEY = "tc_daily_done";

export function loadStreak(): StreakState {
  try {
    return parseStreak(JSON.parse(localStorage.getItem(STREAK_KEY) ?? "null"));
  } catch {
    return EMPTY_STREAK;
  }
}

export function saveStreak(s: StreakState): void {
  try {
    localStorage.setItem(STREAK_KEY, JSON.stringify(s));
    window.dispatchEvent(new Event("tc-streak"));
  } catch {
    // blocked storage: the streak simply is not remembered
  }
}

// { "2026-10-02/7-8": 4, ... } the score for each finished quiz, last 30 kept.
export function loadDone(): Record<string, number> {
  try {
    const raw = JSON.parse(localStorage.getItem(DONE_KEY) ?? "{}");
    return raw && typeof raw === "object" ? raw : {};
  } catch {
    return {};
  }
}

export function markDone(date: string, level: string, score: number): void {
  try {
    const done = loadDone();
    done[`${date}/${level}`] = score;
    const keep = Object.keys(done).sort().slice(-30);
    localStorage.setItem(DONE_KEY, JSON.stringify(Object.fromEntries(keep.map((k) => [k, done[k]]))));
  } catch {
    // ignore
  }
}
