import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { addDays, DAILY_FIRST_DATE, formatQuizDate, generateQuiz, isDateString, levelFromSlug, QUIZ_LEVELS, todayIST } from "@/lib/dailyQuiz";
import { getAppBaseUrl } from "@/lib/url";

export const dynamic = "force-dynamic";

const LETTERS = ["A", "B", "C", "D"];

// Resolves the URL to a quiz that is finished (a past day, from the first
// quiz on). Today redirects to the live quiz; the future and anything
// malformed is a 404.
function resolve(params: { level: string; date: string }) {
  const level = levelFromSlug(params.level);
  if (!level || !isDateString(params.date) || params.date < DAILY_FIRST_DATE) return null;
  const today = todayIST();
  if (params.date > today) return null;
  return { level, date: params.date, today };
}

export function generateMetadata({ params }: { params: { level: string; date: string } }): Metadata {
  const r = resolve(params);
  if (!r || r.date === r.today) return { title: "Quiz not found", robots: { index: false } };
  const title = `${r.level.label} Maths quiz with answers — ${formatQuizDate(r.date)}`;
  const description = `The ${formatQuizDate(r.date)} TeacherCircle Daily Maths quiz for ${r.level.short}, with every answer explained.`;
  const url = `${getAppBaseUrl()}/daily/${r.level.slug}/${r.date}`;
  return { title, description, alternates: { canonical: url }, openGraph: { title, description, url, type: "article" } };
}

export default function DailyArchivePage({ params }: { params: { level: string; date: string } }) {
  const r = resolve(params);
  if (!r) notFound();
  if (r.date === r.today) redirect(`/daily/${r.level.slug}`);

  const quiz = generateQuiz(r.date, r.level.level);
  const prev = addDays(r.date, -1);
  const next = addDays(r.date, 1);

  return (
    <div style={{ maxWidth: 720 }}>
      <p className="hint" style={{ marginBottom: 4 }}><Link href="/daily">← TeacherCircle Daily</Link></p>
      <h1>{r.level.label} Maths quiz — {formatQuizDate(r.date)}</h1>
      <p className="hint" style={{ marginTop: 0 }}>Questions and answers from this day. <Link href={`/daily/${r.level.slug}`}>Play today&apos;s quiz</Link> to build your streak.</p>

      {quiz.questions.map((q) => (
        <div key={q.n} className="card">
          <p className="quiz-kicker">Question {q.n} · {q.topicLabel}</p>
          <h2 className="quiz-question" style={{ marginTop: 0 }}>{q.text}</h2>
          <ol className="archive-options" type="A">
            {q.options.map((o, i) => (
              <li key={i} className={i === q.answerIndex ? "ok" : ""}>
                {LETTERS[i]}. {o}{i === q.answerIndex ? " ✓" : ""}
              </li>
            ))}
          </ol>
          <p style={{ margin: "8px 0 0" }}><b>Answer: {q.options[q.answerIndex]}.</b> <span className="hint">{q.explanation}</span></p>
        </div>
      ))}

      <div className="card invite-card">
        <b>Finding these hard?</b>
        <p className="hint" style={{ margin: "4px 0 10px" }}>A teacher can help you master the topics above. Contacting teachers on TeacherCircle is free.</p>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <Link href="/search?subject=Maths" className="btn">Find a Maths tutor</Link>
          <Link href="/tutor-requests/new?subject=Maths" className="btn secondary">Post a request</Link>
        </div>
      </div>

      <div className="pills" style={{ marginTop: 16 }}>
        {prev >= DAILY_FIRST_DATE && <Link href={`/daily/${r.level.slug}/${prev}`} className="pill pill-link">← {formatQuizDate(prev)}</Link>}
        {next < r.today && <Link href={`/daily/${r.level.slug}/${next}`} className="pill pill-link">{formatQuizDate(next)} →</Link>}
        {QUIZ_LEVELS.filter((l) => l.slug !== r.level.slug).map((l) => (
          <Link key={l.slug} href={`/daily/${l.slug}/${r.date}`} className="pill pill-link">{l.label} that day</Link>
        ))}
      </div>
    </div>
  );
}
