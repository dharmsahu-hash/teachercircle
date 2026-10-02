"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { todayIST } from "@/lib/dailyQuiz";
import { playedToday, visibleStreak } from "@/lib/streak";
import { loadStreak } from "@/lib/streakStorage";

// A small "🔥 5" in the header while a streak is alive: the daily reminder.
// Reads only this browser's storage, so it costs the server nothing. Renders
// nothing until mounted (storage is not available on the server).
export default function StreakChip() {
  const [state, setState] = useState<{ days: number; done: boolean } | null>(null);

  useEffect(() => {
    const update = () => {
      const s = loadStreak();
      const today = todayIST();
      setState({ days: visibleStreak(s, today), done: playedToday(s, today) });
    };
    update();
    window.addEventListener("tc-streak", update);
    window.addEventListener("storage", update);
    return () => {
      window.removeEventListener("tc-streak", update);
      window.removeEventListener("storage", update);
    };
  }, []);

  if (!state || state.days === 0) return null;
  return (
    <Link
      href="/daily"
      className={`streak-chip${state.done ? " done" : ""}`}
      title={state.done ? `${state.days}-day streak. Today's quiz is done.` : `${state.days}-day streak. Play today's quiz to keep it.`}
      aria-label={`${state.days}-day streak${state.done ? "" : ", play today to keep it"}`}
    >
      <span aria-hidden="true">🔥</span> {state.days}
    </Link>
  );
}
