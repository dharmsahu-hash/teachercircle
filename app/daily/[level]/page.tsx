import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import QuizPlayer from "@/components/QuizPlayer";
import StreakPanel from "@/components/StreakPanel";
import { getSessionUser } from "@/lib/auth";
import { formatQuizDate, generateQuiz, levelFromSlug, QUIZ_LEVELS, todayIST } from "@/lib/dailyQuiz";
import { getMyStreak } from "@/lib/dailyData";
import { getAppBaseUrl } from "@/lib/url";

export const dynamic = "force-dynamic";

// A shared score (?score=4&streak=5) gets its own preview picture on WhatsApp.
function sharedPreview(searchParams: { score?: string; streak?: string }, slug: string): string | null {
  const score = Number(searchParams.score);
  const streak = Number(searchParams.streak ?? 0);
  if (!Number.isInteger(score) || score < 0 || score > 5) return null;
  const s = Number.isInteger(streak) && streak >= 0 && streak <= 999 ? streak : 0;
  return `${getAppBaseUrl()}/daily/og?level=${slug}&score=${score}&streak=${s}`;
}

export function generateMetadata({ params, searchParams }: { params: { level: string }; searchParams: { score?: string; streak?: string } }): Metadata {
  const level = levelFromSlug(params.level);
  if (!level) return { title: "Quiz not found", robots: { index: false } };
  const title = `${level.label} Maths daily quiz — ${formatQuizDate(todayIST())}`;
  const description = `Today's free 5-question Maths quiz for ${level.short}. New every day. Keep your streak and challenge a friend.`;
  const url = `${getAppBaseUrl()}/daily/${level.slug}`;
  const image = sharedPreview(searchParams, level.slug);
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: "website", ...(image ? { images: [{ url: image, width: 1200, height: 630 }] } : {}) },
    twitter: { card: image ? "summary_large_image" : "summary", title, description, ...(image ? { images: [image] } : {}) },
  };
}

export default async function DailyLevelPage({ params }: { params: { level: string } }) {
  const level = levelFromSlug(params.level);
  if (!level) notFound();
  const date = todayIST();
  const quiz = generateQuiz(date, level.level);
  const user = await getSessionUser().catch(() => null);
  const serverStreak = user ? await getMyStreak(user.token).catch(() => null) : null;
  const topics = [...new Set(quiz.questions.map((q) => q.topicLabel))];

  return (
    <div style={{ maxWidth: 680 }}>
      <p className="hint" style={{ marginBottom: 4 }}><Link href="/daily">← TeacherCircle Daily</Link></p>
      <h1>{level.label} Maths quiz</h1>
      <p className="hint" style={{ marginTop: 0 }}>{formatQuizDate(date)} · today&apos;s topics: {topics.join(", ")}</p>

      <StreakPanel signedIn={Boolean(user)} serverStreak={serverStreak} />
      <QuizPlayer quiz={quiz} levelSlug={level.slug} levelLabel={level.label} isToday signedIn={Boolean(user)} />

      <h2>Other levels</h2>
      <div className="pills">
        {QUIZ_LEVELS.filter((l) => l.slug !== level.slug).map((l) => (
          <Link key={l.slug} href={`/daily/${l.slug}`} className="pill pill-link">{l.label}</Link>
        ))}
      </div>
    </div>
  );
}
