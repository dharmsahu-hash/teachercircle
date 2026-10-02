import { test, describe } from "node:test";
import assert from "node:assert";
import {
  addDays,
  DAILY_FIRST_DATE,
  daysBetween,
  fmtInt,
  generateQuiz,
  isDateString,
  levelFromSlug,
  QUESTIONS_PER_QUIZ,
  QUIZ_LEVELS,
  scoreAnswers,
  todayIST,
  TOPICS,
  TRIG_TABLE,
  type Question,
  type QuizLevel,
} from "../../lib/dailyQuiz";

const LEVELS = QUIZ_LEVELS.map((l) => l.level);
const DATES = Array.from({ length: 400 }, (_, i) => addDays(DAILY_FIRST_DATE, i));

// ---- independent re-derivation of each topic's answer, from its params -----
const lcm = (a: number, b: number) => { let m = Math.max(a, b); while (m % a || m % b) m++; return m; };
const hcf = (a: number, b: number) => { for (let d = Math.min(a, b); d > 0; d--) if (a % d === 0 && b % d === 0) return d; return 1; };

function expected(q: Question): number {
  const p = q.params;
  switch (q.topic) {
    case "add-carry": return p.a + p.b;
    case "sub-borrow": return p.a - p.b;
    case "multiply": return p.a * p.b;
    case "fraction-of": return (p.total / p.d) * p.n;
    case "percent-of": return (p.base / 100) * p.p;
    case "rect-perimeter": return 2 * (p.l + p.w);
    case "rect-area": return p.l * p.w;
    case "lcm": return lcm(p.a, p.b);
    case "hcf": return hcf(p.a, p.b);
    case "bodmas": return p.a + p.b * p.c - p.d;
    case "discount": return p.price - (p.price / 100) * p.d;
    case "ratio-share": return (p.n / (p.a + p.b)) * p.b;
    case "linear-eq": return (p.c - p.b) / p.a;
    case "square-root": return Math.sqrt(p.n);
    case "simple-interest": return (p.p / 100) * p.rate * p.t;
    case "average": return (p.n1 + p.n2 + p.n3 + p.n4 + p.n5) / 5;
    case "integers": return -p.a + p.b + p.c;
    case "exponents": { let v = 1; for (let i = 0; i < p.x + p.y; i++) v *= p.base; return v; }
    case "triangle-area": return (p.b * p.h) / 2;
    case "circle-area": return (22 / 7) * p.r * p.r;
    case "quadratic": { const b = -(p.p + p.q), c = p.p * p.q; return (-b + Math.sqrt(b * b - 4 * c)) / 2; }
    case "ap-nth": { let t = p.a; for (let i = 1; i < p.n; i++) t += p.d; return t; }
    case "ap-sum": { let t = p.a, sum = 0; for (let i = 0; i < p.n; i++) { sum += t; t += p.d; } return sum; }
    case "pythagoras": return Math.hypot(p.a, p.b);
    case "identity": { const disc = Math.sqrt(p.s * p.s - 4 * p.p); const a = (p.s + disc) / 2, b = (p.s - disc) / 2; return a * a + b * b; }
    case "distance": return Math.hypot(p.x2 - p.x1, p.y2 - p.y1);
    case "trig": {
      const expr = TRIG_TABLE[p.i].expr.replace(/×/g, "*").replace(/−/g, "-").replace(/(sin|cos|tan) (\d+)°/g, (_m, f, deg) => `Math.${f}(${deg}*Math.PI/180)`);
      return new Function(`return ${expr}`)() as number;
    }
    case "probability": return p.red / (p.red + p.blue + p.green);
    case "cylinder": return (22 / 7) * 49 * p.h;
    case "simultaneous": return (p.s + p.d) / 2;
    default: throw new Error(`no independent check for topic ${q.topic}`);
  }
}

// "₹1,200" -> 1200, "84 cm²" -> 84, "3/2" -> 1.5, "−5" -> -5
function parseAnswer(text: string): number {
  const t = text.replace(/−/g, "-").replace(/[₹,]/g, "").trim();
  const frac = t.match(/^(-?\d+)\/(\d+)$/);
  if (frac) return Number(frac[1]) / Number(frac[2]);
  return Number(t.match(/^-?\d+(\.\d+)?/)![0]);
}

describe("daily quiz generator: every answer is right (400 days x 3 levels)", () => {
  test("each question's marked answer matches an independent calculation", () => {
    let checked = 0;
    for (const level of LEVELS) {
      for (const date of DATES) {
        for (const q of generateQuiz(date, level).questions) {
          const got = parseAnswer(q.options[q.answerIndex]);
          const want = expected(q);
          assert.ok(Math.abs(got - want) < 1e-9, `${date} ${level} ${q.topic}: "${q.text}" marked ${q.options[q.answerIndex]} but ${want}`);
          checked++;
        }
      }
    }
    assert.strictEqual(checked, 400 * 3 * QUESTIONS_PER_QUIZ);
  });

  test("the question text really contains the numbers it was built from", () => {
    for (const date of DATES.slice(0, 60)) {
      for (const level of LEVELS) {
        for (const q of generateQuiz(date, level).questions) {
          for (const [key, value] of Object.entries(q.params)) {
            // (A zero is deliberately left out of the wording, e.g. "no green balls".)
            if (key === "i" || value <= 0 || ["n1", "n2", "n3", "n4", "n5"].includes(key)) continue;
            if (q.topic === "average" || q.topic === "trig") continue;
            const forms = [String(value), fmtInt(value), value.toLocaleString("en-IN")]; // "1700" and "₹1,700"
            assert.ok(forms.some((f) => q.text.includes(f) || q.explanation.includes(f)), `${q.topic} ${key}=${value} in "${q.text}"`);
          }
        }
      }
    }
  });
});

describe("daily quiz structure", () => {
  test("5 questions per quiz, all on different topics, with 4 different options and a valid answer index", () => {
    for (const level of LEVELS) {
      for (const date of DATES) {
        const quiz = generateQuiz(date, level);
        assert.strictEqual(quiz.questions.length, QUESTIONS_PER_QUIZ);
        assert.strictEqual(new Set(quiz.questions.map((q) => q.topic)).size, QUESTIONS_PER_QUIZ, `${date} ${level} repeats a topic`);
        for (const q of quiz.questions) {
          assert.strictEqual(q.options.length, 4);
          assert.strictEqual(new Set(q.options).size, 4, `${date} ${level} ${q.topic}: ${q.options.join(" | ")}`);
          assert.ok(q.answerIndex >= 0 && q.answerIndex <= 3);
          assert.ok(q.explanation.length > 10);
          for (const text of [q.text, q.explanation, ...q.options]) assert.ok(!/NaN|undefined|Infinity|\[object/.test(text), text);
          for (const o of q.options) assert.ok(!/^[-−]|^₹[-−]/.test(o) || q.topic === "integers", `negative option "${o}" in ${q.topic}`);
        }
      }
    }
  });

  test("the same date and level always give the same quiz (so server, browser and archive agree)", () => {
    for (const level of LEVELS) assert.deepStrictEqual(generateQuiz("2026-11-15", level), generateQuiz("2026-11-15", level));
  });

  test("different days give different quizzes, and every topic comes up", () => {
    for (const level of LEVELS) {
      const quizzes = new Set(DATES.slice(0, 40).map((d) => JSON.stringify(generateQuiz(d, level).questions.map((q) => q.text))));
      assert.ok(quizzes.size >= 38, `${level} only ${quizzes.size} different quizzes in 40 days`);
      const seen = new Set<string>();
      for (const d of DATES.slice(0, 60)) generateQuiz(d, level).questions.forEach((q) => seen.add(q.topic));
      assert.strictEqual(seen.size, TOPICS[level as QuizLevel].length, `${level} never used some topics`);
    }
  });

  test("the right answer is spread over all four positions", () => {
    const positions = new Set<number>();
    for (const d of DATES.slice(0, 30)) generateQuiz(d, "7-8").questions.forEach((q) => positions.add(q.answerIndex));
    assert.deepStrictEqual([...positions].sort(), [0, 1, 2, 3]);
  });

  test("levels are different quizzes on the same day", () => {
    const [a, b] = ["5-6", "9-10"].map((l) => generateQuiz("2026-12-01", l as QuizLevel).questions.map((q) => q.text).join());
    assert.notStrictEqual(a, b);
  });
});

describe("scoring", () => {
  const quiz = generateQuiz("2026-10-05", "7-8");
  test("counts correct answers", () => {
    const all = quiz.questions.map((q) => q.answerIndex);
    assert.strictEqual(scoreAnswers(quiz, all).score, 5);
    const none = quiz.questions.map((q) => (q.answerIndex + 1) % 4);
    assert.strictEqual(scoreAnswers(quiz, none).score, 0);
    assert.deepStrictEqual(scoreAnswers(quiz, [all[0], none[1], all[2], none[3], all[4]]).correct, [true, false, true, false, true]);
  });
  test("missing or junk answers score zero, never throw", () => {
    assert.strictEqual(scoreAnswers(quiz, []).score, 0);
    assert.strictEqual(scoreAnswers(quiz, [9, -1, NaN, 1.5, null as unknown as number]).score, 0);
  });
});

describe("dates (India time)", () => {
  test("todayIST switches at 18:30 UTC (midnight in India)", () => {
    assert.strictEqual(todayIST(Date.UTC(2026, 9, 2, 18, 29, 59)), "2026-10-02");
    assert.strictEqual(todayIST(Date.UTC(2026, 9, 2, 18, 30, 0)), "2026-10-03");
    assert.strictEqual(todayIST(Date.UTC(2026, 11, 31, 20, 0, 0)), "2027-01-01");
  });
  test("isDateString accepts real dates only", () => {
    for (const ok of ["2026-10-01", "2028-02-29"]) assert.ok(isDateString(ok), ok);
    for (const bad of ["2026-02-30", "2026-13-01", "2026-1-1", "26-10-01", "", "2026-10-01T00:00", "abcd-ef-gh"]) assert.ok(!isDateString(bad), bad);
  });
  test("addDays and daysBetween cross month and year ends", () => {
    assert.strictEqual(addDays("2026-12-31", 1), "2027-01-01");
    assert.strictEqual(addDays("2026-03-01", -1), "2026-02-28");
    assert.strictEqual(daysBetween("2026-10-01", "2026-10-02"), 1);
    assert.strictEqual(daysBetween("2026-12-30", "2027-01-02"), 3);
  });
  test("level slugs", () => {
    assert.strictEqual(levelFromSlug("class-7-8")?.level, "7-8");
    assert.strictEqual(levelFromSlug("class-11-12"), null);
  });
});
