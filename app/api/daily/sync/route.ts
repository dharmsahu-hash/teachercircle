import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { pgRpc, publicErrorMessage } from "@/lib/db";
import { parseStreak } from "@/lib/streak";
import { isMissingRelation } from "@/lib/tutorRequestData";
import { dailySyncSchema, parseJsonBody } from "@/lib/validation";

// Once, when a player signs in: bring the streak kept in this browser into
// the account. merge_daily_streak() keeps the longer live streak and refuses
// one longer than the quiz has existed.
export async function POST(req: NextRequest) {
  const user = await requireSession().catch(() => null);
  if (!user) return NextResponse.json({ error: "Please sign in to save your streak." }, { status: 401 });

  const parsed = await parseJsonBody(req, dailySyncSchema);
  if (!parsed.ok) return parsed.response;
  const { current, best, last } = parsed.data;

  try {
    const row = await pgRpc("merge_daily_streak", { p_current: current, p_best: best, p_last: last ?? null }, user.token);
    return NextResponse.json({ ok: true, saved: true, streak: parseStreak(row) });
  } catch (err) {
    if (isMissingRelation(err)) return NextResponse.json({ ok: true, saved: false });
    return NextResponse.json({ error: publicErrorMessage(err, "Could not save your streak.") }, { status: 400 });
  }
}
