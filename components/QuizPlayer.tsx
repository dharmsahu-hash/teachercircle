"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { QUIZ_LEVELS, todayIST, type Quiz } from "@/lib/dailyQuiz";
import { applyCompletion, mergeStreaks, parseStreak, visibleStreak, type StreakState } from "@/lib/streak";
import { loadDone, loadStreak, markDone, saveStreak } from "@/lib/streakStorage";

const LETTERS = ["A", "B", "C", "D"];

// One quiz, one question at a time, with instant feedback. Scoring happens in
// the browser (no server cost). Only a signed-in player's finished TODAY quiz
// is sent to the server, which re-scores it from the answers.
export default function QuizPlayer({
  quiz,
  levelSlug,
  levelLabel,
  isToday,
  signedIn,
}: {
  quiz: Quiz;
  levelSlug: string;
  levelLabel: string;
  isToday: boolean;
  signedIn: boolean;
}) {
  const total = quiz.questions.length;
  const [step, setStep] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [answers, setAnswers] = useState<number[]>([]);
  const [finished, setFinished] = useState(false);
  const [alreadyDone, setAlreadyDone] = useState<number | null>(null); // score from an earlier visit today
  const [streak, setStreak] = useState<StreakState | null>(null);
  const [saveNote, setSaveNote] = useState<string | null>(null);

  // Came back after finishing today's quiz? Show the result, not the quiz.
  useEffect(() => {
    if (!isToday) return;
    const earlier = loadDone()[`${quiz.date}/${quiz.level}`];
    if (typeof earlier === "number") {
      setAlreadyDone(earlier);
      setFinished(true);
    }
    setStreak(loadStreak());
  }, [isToday, quiz.date, quiz.level]);

  const q = quiz.questions[step];
  const score = useMemo(() => answers.filter((a, i) => a === quiz.questions[i]?.answerIndex).length, [answers, quiz]);
  const finalScore = alreadyDone ?? score;

  function pick(i: number) {
    if (picked !== null) return;
    setPicked(i);
  }

  async function next() {
    if (picked === null) return;
    const all = [...answers, picked];
    setAnswers(all);
    if (step + 1 < total) {
      setStep(step + 1);
      setPicked(null);
      return;
    }
    setFinished(true);
    const finished = all.filter((a, i) => a === quiz.questions[i].answerIndex).length;
    if (!isToday) return;

    const today = todayIST();
    let updated = applyCompletion(loadStreak(), today);
    markDone(quiz.date, quiz.level, finished);
    saveStreak(updated);
    setStreak(updated);

    if (signedIn) {
      try {
        const res = await fetch("/api/daily/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ level: quiz.level, answers: all }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.saved) {
          updated = mergeStreaks(updated, parseStreak(data.streak), today);
          saveStreak(updated);
          setStreak(updated);
          setSaveNote("Saved to your account.");
        }
      } catch {
        // offline: the streak is still kept in this browser
      }
    }
  }

  const weakTopics = useMemo(() => {
    const labels = quiz.questions.filter((qq, i) => answers[i] !== undefined && answers[i] !== qq.answerIndex).map((qq) => qq.topicLabel);
    return [...new Set(labels)];
  }, [answers, quiz]);

  const shareUrl = typeof window !== "undefined" ? `${window.location.origin}/daily/${levelSlug}` : `/daily/${levelSlug}`;
  const days = streak ? visibleStreak(streak, todayIST()) : 0;
  const shareText =
    `I scored ${finalScore}/${total} on today's TeacherCircle Daily Maths quiz (${levelLabel})` +
    (days > 1 ? ` and I'm on a ${days}-day streak` : "") +
    `. Can you beat me?`;
  const shareLink = `${shareUrl}?score=${finalScore}&streak=${days}&utm_source=whatsapp&utm_medium=share`;
  const whatsapp = `https://wa.me/?text=${encodeURIComponent(`${shareText} ${shareLink}`)}`;

  if (finished) {
    const note =
      finalScore === total ? "Perfect score! 🎉" : finalScore >= 3 ? "Nicely done. 👏" : "Good try. Practice makes it easier every day.";
    return (
      <div className="card quiz-card" aria-live="polite">
        <p className="quiz-kicker">{isToday ? "Today's quiz" : "Practice"} · {levelLabel}</p>
        <p className="score-big">{finalScore} <span>/ {total}</span></p>
        <p style={{ margin: "0 0 12px" }}>{note}</p>

        {isToday && days > 0 && (
          <p className="streak-line">
            <span aria-hidden="true">🔥</span> <b>{days}-day streak.</b> Come back tomorrow to keep it going.
            {saveNote && <span className="hint"> {saveNote}</span>}
          </p>
        )}
        {isToday && !signedIn && (
          <div className="invite-card card" style={{ margin: "12px 0" }}>
            <b>Keep your streak safe</b>
            <p className="hint" style={{ margin: "4px 0 10px" }}>
              Create a free account to save your streak on every device, and to post a request for a Maths tutor.
            </p>
            <Link href="/login" className="btn">Sign up free</Link>
          </div>
        )}

        <div className="row" style={{ gap: 8, flexWrap: "wrap", margin: "12px 0" }}>
          <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="btn whatsapp-btn">Challenge a friend on WhatsApp</a>
        </div>

        {weakTopics.length > 0 && (
          <div className="card" style={{ margin: "12px 0" }}>
            <b>Need a hand with {weakTopics.slice(0, 3).join(", ")}?</b>
            <p className="hint" style={{ margin: "4px 0 10px" }}>A good teacher can fix this quickly. Teachers on TeacherCircle are free to contact.</p>
            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              <Link href="/search?subject=Maths" className="btn">Find a Maths tutor</Link>
              <Link href="/tutor-requests/new?subject=Maths" className="btn secondary">Post a request</Link>
            </div>
          </div>
        )}

        {answers.length === total && (
          <details className="quiz-review">
            <summary>Review my answers</summary>
            {quiz.questions.map((qq, i) => (
              <div key={qq.n} className="quiz-review-item">
                <p style={{ margin: 0 }}><b>{qq.n}. {qq.text}</b></p>
                <p style={{ margin: "2px 0" }} className={answers[i] === qq.answerIndex ? "ok" : "bad"}>
                  {answers[i] === qq.answerIndex ? "✓ Correct: " : `✗ You chose ${qq.options[answers[i]] ?? "nothing"}. Correct: `}
                  {qq.options[qq.answerIndex]}
                </p>
                <p className="hint" style={{ margin: 0 }}>{qq.explanation}</p>
              </div>
            ))}
          </details>
        )}

        <p className="hint" style={{ margin: "16px 0 6px" }}>Try another level:</p>
        <div className="pills">
          {QUIZ_LEVELS.filter((l) => l.slug !== levelSlug).map((l) => (
            <Link key={l.slug} href={`/daily/${l.slug}`} className="pill pill-link">{l.label}</Link>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="card quiz-card">
      <div className="quiz-progress" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={step}>
        <div style={{ width: `${(step / total) * 100}%` }} />
      </div>
      <p className="quiz-kicker">Question {step + 1} of {total} · {q.topicLabel}</p>
      <h2 className="quiz-question">{q.text}</h2>
      <div className="quiz-options" role="group" aria-label="Answer choices">
        {q.options.map((opt, i) => {
          const state = picked === null ? "" : i === q.answerIndex ? " correct" : i === picked ? " wrong" : " dim";
          return (
            <button key={i} type="button" className={`quiz-option${state}`} disabled={picked !== null} onClick={() => pick(i)}>
              <span className="quiz-letter">{LETTERS[i]}</span>
              <span>{opt}</span>
            </button>
          );
        })}
      </div>
      {picked !== null && (
        <div aria-live="polite">
          <p className={picked === q.answerIndex ? "quiz-feedback ok" : "quiz-feedback bad"}>
            {picked === q.answerIndex ? "Correct! " : `Not quite. The answer is ${q.options[q.answerIndex]}. `}
            <span className="quiz-explain">{q.explanation}</span>
          </p>
          <button type="button" onClick={next}>{step + 1 < total ? "Next question" : "See my score"}</button>
        </div>
      )}
    </div>
  );
}
