import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { pgRpc, publicErrorMessage } from "@/lib/db";
import { generateQuiz, scoreAnswers, todayIST } from "@/lib/dailyQuiz";
import { parseStreak } from "@/lib/streak";
import { isMissingRelation } from "@/lib/tutorRequestData";
import { dailyCompleteSchema, parseJsonBody } from "@/lib/validation";

// A signed-in player finished today's quiz. The score is computed HERE from
// the answers (the quiz is regenerated from the date), never taken from the
// browser, and record_daily_quiz() only counts today's quiz once a day, so a
// streak cannot be inflated. Anonymous players never call this: their streak
// lives in their browser.
export async function POST(req: NextRequest) {
  const user = await requireSession().catch(() => null);
  if (!user) return NextResponse.json({ error: "Please sign in to save your streak." }, { status: 401 });

  const parsed = await parseJsonBody(req, dailyCompleteSchema);
  if (!parsed.ok) return parsed.response;
  const { level, answers } = parsed.data;

  const today = todayIST();
  const { score } = scoreAnswers(generateQuiz(today, level), answers);
  try {
    const row = await pgRpc("record_daily_quiz", { p_date: today, p_score: score, p_level: level }, user.token);
    return NextResponse.json({ ok: true, saved: true, score, streak: parseStreak(row) });
  } catch (err) {
    // Migration 0029 not applied yet: the quiz still works, the streak just stays in the browser.
    if (isMissingRelation(err)) return NextResponse.json({ ok: true, saved: false, score });
    return NextResponse.json({ error: publicErrorMessage(err, "Could not save your streak.") }, { status: 400 });
  }
}
