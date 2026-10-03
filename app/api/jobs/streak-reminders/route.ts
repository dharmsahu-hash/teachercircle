import { NextRequest, NextResponse } from "next/server";
import { getJobSecret, isJobRequest } from "@/lib/jobSecret";
import { runStreakReminders } from "@/lib/notifyJobs";

export const dynamic = "force-dynamic";

// Evening streak-at-risk push. Started by the scheduled GitHub Action.
async function handle(req: NextRequest) {
  const secret = getJobSecret();
  if (!secret || !isJobRequest(req.headers.get("authorization"), secret)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }
  try {
    return NextResponse.json({ ok: true, ...(await runStreakReminders(secret)) });
  } catch {
    return NextResponse.json({ ok: false, error: "Reminders failed. Is migration 0030 applied and job_secret set?" }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
