"use client";

import { useEffect, useState } from "react";
import { todayIST } from "@/lib/dailyQuiz";
import { mergeStreaks, parseStreak, playedToday, visibleStreak, type StreakState } from "@/lib/streak";
import { loadStreak, saveStreak } from "@/lib/streakStorage";

// "Your streak" box on the daily-quiz pages. For a signed-in player it also
// does the one-time sync between this browser and the account: the longer
// live streak wins, and a longer local one is saved to the account. Costs the
// server one small call, once per browser session, and only when needed.
export default function StreakPanel({ signedIn, serverStreak }: { signedIn: boolean; serverStreak: StreakState | null }) {
  const [streak, setStreak] = useState<StreakState | null>(null);

  useEffect(() => {
    const today = todayIST();
    const local = loadStreak();
    let merged = local;
    if (signedIn && serverStreak) {
      merged = mergeStreaks(local, serverStreak, today);
      const localAhead = visibleStreak(local, today) > visibleStreak(serverStreak, today);
      let alreadySynced = false;
      try {
        alreadySynced = sessionStorage.getItem("tc_daily_synced") === "1";
      } catch {
        // ignore
      }
      if (localAhead && !alreadySynced) {
        try {
          sessionStorage.setItem("tc_daily_synced", "1");
        } catch {
          // ignore
        }
        fetch("/api/daily/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ current: local.current, best: Math.max(local.best, local.current), last: local.lastDate }),
        })
          .then((r) => r.json().catch(() => ({})))
          .then((d) => {
            if (d?.saved) {
              const fixed = mergeStreaks(merged, parseStreak(d.streak), today);
              saveStreak(fixed);
              setStreak(fixed);
            }
          })
          .catch(() => undefined);
      }
    }
    saveStreak(merged);
    setStreak(merged);

    // The quiz saves the streak when a player finishes: keep this box current.
    const refresh = () => setStreak(loadStreak());
    window.addEventListener("tc-streak", refresh);
    return () => window.removeEventListener("tc-streak", refresh);
  }, [signedIn, serverStreak]);

  if (!streak) return <div className="card streak-panel" aria-hidden="true" style={{ minHeight: 76 }} />;
  const today = todayIST();
  const days = visibleStreak(streak, today);
  const done = playedToday(streak, today);
  return (
    <div className="card streak-panel">
      <div>
        <p className="streak-number">{days > 0 ? <><span aria-hidden="true">🔥</span> {days}</> : "0"}<span> day streak</span></p>
        <p className="hint" style={{ margin: 0 }}>
          {days === 0 ? "Play today's quiz to start a streak." : done ? "Today's quiz is done. See you tomorrow!" : "Play today's quiz to keep it alive."}
        </p>
      </div>
      <div className="streak-stats">
        <span><b>{streak.best}</b> best</span>
        <span><b>{streak.total}</b> played</span>
      </div>
    </div>
  );
}
