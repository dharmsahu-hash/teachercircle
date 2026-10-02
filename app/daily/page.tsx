import Link from "next/link";
import type { Metadata } from "next";
import ExamCountdown from "@/components/ExamCountdown";
import StreakPanel from "@/components/StreakPanel";
import { getSessionUser } from "@/lib/auth";
import { addDays, DAILY_FIRST_DATE, formatQuizDate, QUIZ_LEVELS, TOPICS, todayIST } from "@/lib/dailyQuiz";
import { getMyStreak } from "@/lib/dailyData";
import { getAppBaseUrl } from "@/lib/url";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "TeacherCircle Daily — free Maths quiz for Classes 5 to 10",
  description:
    "Five quick Maths questions, a new quiz every day, for Classes 5–6, 7–8 and 9–10. Keep your streak going, challenge friends on WhatsApp, and find a teacher if you get stuck.",
  alternates: { canonical: `${getAppBaseUrl()}/daily` },
};

export default async function DailyPage() {
  const user = await getSessionUser().catch(() => null);
  const serverStreak = user ? await getMyStreak(user.token).catch(() => null) : null;
  const today = todayIST();
  // Recent archive: up to the last 6 finished days.
  const recent = Array.from({ length: 6 }, (_, i) => addDays(today, -(i + 1))).filter((d) => d >= DAILY_FIRST_DATE);

  return (
    <div style={{ maxWidth: 820 }}>
      <h1>TeacherCircle Daily</h1>
      <p className="request-lead" style={{ marginBottom: 14 }}>
        Five quick Maths questions. Two minutes. A brand-new quiz every day. Build a streak, challenge your friends,
        and get a teacher&apos;s help if a topic feels hard.
      </p>

      <StreakPanel signedIn={Boolean(user)} serverStreak={serverStreak} />

      <h2>Today&apos;s quizzes <span className="hint" style={{ fontWeight: 400 }}>· {formatQuizDate(today)}</span></h2>
      <div className="level-grid">
        {QUIZ_LEVELS.map((l) => (
          <Link key={l.slug} href={`/daily/${l.slug}`} className="card level-card">
            <b>{l.label}</b>
            <span className="hint">{[...new Set(TOPICS[l.level].map((t) => t.label))].slice(0, 5).join(", ")} and more</span>
            <span className="level-go">Play today&apos;s quiz →</span>
          </Link>
        ))}
      </div>

      <h2>Your exam countdown</h2>
      <ExamCountdown />

      <h2>How it works</h2>
      <ul className="plain-list">
        <li><b>New every day.</b> The quiz changes at midnight, India time, for every class band.</li>
        <li><b>Keep the streak.</b> Finish one quiz a day to grow your streak. Miss a day and it starts again.</li>
        <li><b>Learn from mistakes.</b> Every answer comes with a short explanation.</li>
        <li><b>Stuck on a topic?</b> <Link href="/search?subject=Maths">Find a Maths teacher</Link> or{" "}
          <Link href="/tutor-requests/new?subject=Maths">post a tutor request</Link>. It&apos;s free to contact teachers.</li>
      </ul>

      {recent.length > 0 && (
        <>
          <h2>Previous quizzes, with answers</h2>
          <div className="archive-grid">
            {recent.map((d) => (
              <div key={d} className="archive-row">
                <span>{formatQuizDate(d)}</span>
                <span className="pills">
                  {QUIZ_LEVELS.map((l) => (
                    <Link key={l.slug} href={`/daily/${l.slug}/${d}`} className="pill pill-link">{l.label}</Link>
                  ))}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
