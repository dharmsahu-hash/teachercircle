// TeacherCircle Daily: a 5-question Maths quiz that is new every day, for
// three class bands. Pure and deterministic: the same date and level always
// give the same quiz, on the server, in the browser and in tests, so nothing
// is stored and nothing can run out.
//
// Every question is COMPUTED from random numbers (seeded by the date), so its
// answer cannot be wrong, there is no content to write or review, and there is
// no AI or database cost. tests/unit/dailyQuiz.test.ts recomputes every answer
// independently from each question's `params`.

export type QuizLevel = "5-6" | "7-8" | "9-10";

export const QUIZ_LEVELS: { level: QuizLevel; slug: string; label: string; short: string }[] = [
  { level: "5-6", slug: "class-5-6", label: "Class 5–6", short: "Classes 5 and 6" },
  { level: "7-8", slug: "class-7-8", label: "Class 7–8", short: "Classes 7 and 8" },
  { level: "9-10", slug: "class-9-10", label: "Class 9–10", short: "Classes 9 and 10" },
];

export const QUESTIONS_PER_QUIZ = 5;

// The first day a quiz exists. Archive pages start here, and a streak can
// never be longer than the days since this date (enforced in 0029 too).
export const DAILY_FIRST_DATE = "2026-10-01";

export function levelFromSlug(slug: string): (typeof QUIZ_LEVELS)[number] | null {
  return QUIZ_LEVELS.find((l) => l.slug === slug) ?? null;
}
export function levelFromCode(code: string): (typeof QUIZ_LEVELS)[number] | null {
  return QUIZ_LEVELS.find((l) => l.level === code) ?? null;
}

// ---------------------------------------------------------------- dates (IST)

const IST_OFFSET_MS = 5.5 * 3600 * 1000;

// "Today" for everyone is the date in India, not the visitor's time zone.
export function todayIST(now: number = Date.now()): string {
  return new Date(now + IST_OFFSET_MS).toISOString().slice(0, 10);
}

export function isDateString(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export function formatQuizDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

// ------------------------------------------------------------------ randomness

function hashString(str: string): number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}

export class Rng {
  private s: number;
  constructor(seed: string) {
    this.s = hashString(seed);
  }
  next(): number {
    // mulberry32
    this.s = (this.s + 0x6d2b79f5) | 0;
    let t = Math.imul(this.s ^ (this.s >>> 15), 1 | this.s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }
  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)];
  }
  shuffle<T>(items: readonly T[]): T[] {
    const a = [...items];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
}

// ------------------------------------------------------------------- formatting

export const fmtInt = (n: number): string => (n < 0 ? `−${Math.abs(n)}` : String(n));
const rupees = (n: number) => `₹${n.toLocaleString("en-IN")}`;
const gcd = (a: number, b: number): number => (b === 0 ? Math.abs(a) : gcd(b, a % b));
export const fraction = (n: number, d: number): string => {
  const g = gcd(n, d);
  const [a, b] = [n / g, d / g];
  return b === 1 ? String(a) : `${a}/${b}`;
};

// ----------------------------------------------------------------------- topics

type Raw = {
  text: string;
  answer: string;
  wrong: string[]; // plausible wrong answers (common mistakes); need not be unique
  explanation: string;
  params: Record<string, number>;
};
type Topic = { id: string; label: string; make: (r: Rng) => Raw };

const num = (n: number, unit = "") => (unit ? `${n} ${unit}` : String(n));

const LEVEL_5_6: Topic[] = [
  {
    id: "add-carry",
    label: "Addition",
    make: (r) => {
      const a = r.int(150, 899), b = r.int(150, 899), s = a + b;
      return { text: `What is ${a} + ${b}?`, answer: String(s), wrong: [s - 10, s + 10, s - 100, s + 100, s + 1].map(String), explanation: `${a} + ${b} = ${s}. Add the ones, tens and hundreds, carrying when a column passes 9.`, params: { a, b } };
    },
  },
  {
    id: "sub-borrow",
    label: "Subtraction",
    make: (r) => {
      const a = r.int(400, 999), b = r.int(101, a - 100), d = a - b;
      return { text: `What is ${a} − ${b}?`, answer: String(d), wrong: [d + 10, d - 10, d + 100, d - 100, d + 1].map(String), explanation: `${a} − ${b} = ${d}. Borrow from the next place when a digit on top is smaller.`, params: { a, b } };
    },
  },
  {
    id: "multiply",
    label: "Multiplication",
    make: (r) => {
      const a = r.int(23, 98), b = r.int(3, 9), p = a * b;
      return { text: `What is ${a} × ${b}?`, answer: String(p), wrong: [p + 10, p - 10, a * (b + 1), a * (b - 1), p + a - 1].map(String), explanation: `${a} × ${b} = ${p}.`, params: { a, b } };
    },
  },
  {
    id: "fraction-of",
    label: "Fractions",
    make: (r) => {
      const d = r.pick([2, 3, 4, 5, 6, 8, 10]), n = r.int(1, d - 1), k = r.int(2, 12), total = d * k, ans = n * k;
      return { text: `What is ${n}/${d} of ${total}?`, answer: String(ans), wrong: [k, total - ans, k * (n + 1), k * (n - 1), ans + d].map(String), explanation: `Divide ${total} by ${d} to get ${k}, then multiply by ${n}: ${ans}.`, params: { n, d, total } };
    },
  },
  {
    id: "percent-of",
    label: "Percentages",
    make: (r) => {
      const p = r.pick([10, 20, 25, 50, 75]), base = 20 * r.int(2, 20), ans = (p * base) / 100;
      return { text: `What is ${p}% of ${base}?`, answer: String(ans), wrong: [ans * 10, base - ans, ans * 2, p * base, ans + p].map(String), explanation: `${p}% means ${p} out of every 100. ${p}% of ${base} = ${p} × ${base} ÷ 100 = ${ans}.`, params: { p, base } };
    },
  },
  {
    id: "rect-perimeter",
    label: "Perimeter",
    make: (r) => {
      const l = r.int(6, 40), w = r.int(3, l - 1), ans = 2 * (l + w);
      return { text: `A rectangle is ${l} cm long and ${w} cm wide. What is its perimeter?`, answer: num(ans, "cm"), wrong: [l * w, l + w, 2 * l * w, ans + 2, ans - 2].map((n) => num(n, "cm")), explanation: `Perimeter = 2 × (length + width) = 2 × (${l} + ${w}) = ${ans} cm.`, params: { l, w } };
    },
  },
  {
    id: "rect-area",
    label: "Area",
    make: (r) => {
      const l = r.int(6, 30), w = r.int(3, l - 1), ans = l * w;
      return { text: `A rectangle is ${l} cm long and ${w} cm wide. What is its area?`, answer: num(ans, "cm²"), wrong: [2 * (l + w), l + w, ans + l, ans - w, 2 * ans].map((n) => num(n, "cm²")), explanation: `Area = length × width = ${l} × ${w} = ${ans} cm².`, params: { l, w } };
    },
  },
  {
    id: "lcm",
    label: "LCM",
    make: (r) => {
      const [a, b] = r.pick([[4, 6], [6, 8], [4, 10], [6, 9], [8, 12], [9, 12], [10, 15], [12, 18], [6, 15], [8, 10]]);
      const ans = (a * b) / gcd(a, b);
      return { text: `What is the LCM (lowest common multiple) of ${a} and ${b}?`, answer: String(ans), wrong: [gcd(a, b), a * b, Math.max(a, b), ans * 2, ans + a].map(String), explanation: `List multiples of each number. The smallest one they share is ${ans}.`, params: { a, b } };
    },
  },
  {
    id: "hcf",
    label: "HCF",
    make: (r) => {
      const g = r.int(2, 9);
      let p = r.int(2, 9), q = r.int(2, 9);
      while (p === q || gcd(p, q) !== 1) { p = r.int(2, 9); q = r.int(2, 9); }
      const a = g * p, b = g * q;
      return { text: `What is the HCF (highest common factor) of ${a} and ${b}?`, answer: String(g), wrong: [(a * b) / g, p, q, g + 1, g * 2].map(String), explanation: `The largest number that divides both ${a} and ${b} is ${g}.`, params: { a, b } };
    },
  },
  {
    id: "bodmas",
    label: "BODMAS",
    make: (r) => {
      const a = r.int(2, 20), b = r.int(2, 9), c = r.int(2, 9), d = r.int(1, a + b * c - 1), ans = a + b * c - d;
      return { text: `What is ${a} + ${b} × ${c} − ${d}?`, answer: String(ans), wrong: [(a + b) * c - d, ans + d, a + b * (c - d), ans + 2, ans - 2].map(String), explanation: `Multiply first (BODMAS): ${b} × ${c} = ${b * c}. Then ${a} + ${b * c} − ${d} = ${ans}.`, params: { a, b, c, d } };
    },
  },
];

const LEVEL_7_8: Topic[] = [
  {
    id: "discount",
    label: "Discounts",
    make: (r) => {
      const price = 100 * r.int(4, 20), d = r.pick([10, 15, 20, 25, 30]), off = (price * d) / 100, ans = price - off;
      return { text: `A jacket costs ${rupees(price)}. After a ${d}% discount, what do you pay?`, answer: rupees(ans), wrong: [off, price + off, price - d, ans + 50, ans - 50].map(rupees), explanation: `${d}% of ${rupees(price)} = ${rupees(off)}. ${rupees(price)} − ${rupees(off)} = ${rupees(ans)}.`, params: { price, d } };
    },
  },
  {
    id: "ratio-share",
    label: "Ratios",
    make: (r) => {
      const a = r.int(1, 5), b = r.int(a + 1, 7), unit = r.int(3, 15), n = (a + b) * unit, ans = unit * b;
      return { text: `${rupees(n)} is shared between Ria and Sam in the ratio ${a} : ${b}. How much does Sam get?`, answer: rupees(ans), wrong: [unit * a, n / 2, unit * (b + 1), unit * (b - 1), n - ans + unit].map(rupees), explanation: `${a} + ${b} = ${a + b} equal parts. One part = ${rupees(n)} ÷ ${a + b} = ${rupees(unit)}. Sam gets ${b} parts = ${rupees(ans)}.`, params: { a, b, n } };
    },
  },
  {
    id: "linear-eq",
    label: "Linear equations",
    make: (r) => {
      const x = r.int(2, 12), a = r.int(2, 9), b = r.int(1, 20), c = a * x + b;
      return { text: `Solve for x: ${a}x + ${b} = ${c}`, answer: String(x), wrong: [c - b, x + 1, x - 1, a + b, x + 2].map(String), explanation: `Subtract ${b} from both sides: ${a}x = ${c - b}. Divide by ${a}: x = ${x}.`, params: { a, b, c } };
    },
  },
  {
    id: "square-root",
    label: "Square roots",
    make: (r) => {
      const root = r.int(11, 25), n = root * root;
      return { text: `What is the square root of ${n}?`, answer: String(root), wrong: [root + 1, root - 1, root + 2, 2 * root, Math.floor(n / 2)].map(String), explanation: `${root} × ${root} = ${n}, so √${n} = ${root}.`, params: { n } };
    },
  },
  {
    id: "simple-interest",
    label: "Simple interest",
    make: (r) => {
      const p = 1000 * r.int(1, 10), rate = r.int(4, 12), t = r.int(2, 5), si = (p * rate * t) / 100;
      return { text: `Find the simple interest on ${rupees(p)} at ${rate}% per year for ${t} years.`, answer: rupees(si), wrong: [p + si, si * 10, si / 10, si + p / 10, si - rate * 10].map(rupees), explanation: `Simple interest = P × R × T ÷ 100 = ${p} × ${rate} × ${t} ÷ 100 = ${rupees(si)}.`, params: { p, rate, t } };
    },
  },
  {
    id: "average",
    label: "Averages",
    make: (r) => {
      for (let attempt = 0; attempt < 50; attempt++) {
        const m = r.int(20, 90);
        const xs = [0, 1, 2, 3].map(() => r.int(m - 12, m + 12));
        const last = 5 * m - xs.reduce((s, v) => s + v, 0);
        if (last < 5 || last > 150) continue;
        const all = [...xs, last];
        const sum = 5 * m;
        return { text: `What is the average of ${all.slice(0, 4).join(", ")} and ${last}?`, answer: String(m), wrong: [m + 1, m - 1, m + 2, m - 2, Math.round(sum / 4)].map(String), explanation: `Add the numbers: ${all.join(" + ")} = ${sum}. Divide by 5: ${sum} ÷ 5 = ${m}.`, params: { n1: all[0], n2: all[1], n3: all[2], n4: all[3], n5: all[4] } };
      }
      return { text: "What is the average of 10, 20 and 30?", answer: "20", wrong: ["10", "30", "60", "25"], explanation: "(10 + 20 + 30) ÷ 3 = 20.", params: { n1: 10, n2: 20, n3: 30, n4: 20, n5: 20 } };
    },
  },
  {
    id: "integers",
    label: "Integers",
    make: (r) => {
      const a = r.int(3, 15), b = r.int(3, 15), c = r.int(1, 10), ans = -a + b + c;
      return { text: `What is −${a} + ${b} − (−${c})?`, answer: fmtInt(ans), wrong: [-a + b - c, a + b - c, -a - b + c, a - b + c, -a - b - c].map(fmtInt), explanation: `Subtracting a negative adds: −${a} + ${b} + ${c} = ${fmtInt(ans)}.`, params: { a, b, c } };
    },
  },
  {
    id: "exponents",
    label: "Exponents",
    make: (r) => {
      const base = r.pick([2, 3, 5]), x = r.int(2, 4), y = r.int(2, 3), ans = base ** (x + y);
      return { text: `What is ${base}^${x} × ${base}^${y}?`, answer: String(ans), wrong: [base ** (x * y), base ** x + base ** y, base ** (x + y + 1), base ** (x + y - 1), base * (x + y)].map(String), explanation: `When you multiply powers of the same base, add the exponents: ${base}^${x + y} = ${ans}.`, params: { base, x, y } };
    },
  },
  {
    id: "triangle-area",
    label: "Triangle area",
    make: (r) => {
      const b = 2 * r.int(3, 15), h = r.int(4, 20), ans = (b * h) / 2;
      return { text: `A triangle has a base of ${b} cm and a height of ${h} cm. What is its area?`, answer: num(ans, "cm²"), wrong: [b * h, b + h, ans + h, ans - b, 2 * b * h].map((n) => num(n, "cm²")), explanation: `Area = ½ × base × height = ½ × ${b} × ${h} = ${ans} cm².`, params: { b, h } };
    },
  },
  {
    id: "circle-area",
    label: "Circles",
    make: (r) => {
      const k = r.int(1, 3), rad = 7 * k, ans = 154 * k * k;
      return { text: `A circle has a radius of ${rad} cm. What is its area? (Use π = 22/7)`, answer: num(ans, "cm²"), wrong: [44 * k, 22 * k, 49 * k * k, 308 * k * k, ans + 22].map((n) => num(n, "cm²")), explanation: `Area = π × r² = 22/7 × ${rad} × ${rad} = ${ans} cm².`, params: { r: rad } };
    },
  },
];

const TRIG: { expr: string; answer: string }[] = [
  { expr: "sin 30° + cos 60°", answer: "1" },
  { expr: "tan 45° + sin 30°", answer: "3/2" },
  { expr: "sin 90° − cos 60°", answer: "1/2" },
  { expr: "cos 0° + sin 30°", answer: "3/2" },
  { expr: "2 × sin 30° × cos 60°", answer: "1/2" },
  { expr: "tan 45° × cos 60°", answer: "1/2" },
  { expr: "sin 30° × cos 60° + tan 45°", answer: "5/4" },
  { expr: "sin 30° × cos 60°", answer: "1/4" },
];
export const TRIG_TABLE = TRIG;

const TRIPLES: [number, number, number][] = [[3, 4, 5], [5, 12, 13], [8, 15, 17], [7, 24, 25], [20, 21, 29]];

const LEVEL_9_10: Topic[] = [
  {
    id: "quadratic",
    label: "Quadratic equations",
    make: (r) => {
      const p = r.int(2, 9), q = r.int(1, p - 1);
      return { text: `What is the larger root of x² − ${p + q}x + ${p * q} = 0?`, answer: String(p), wrong: [q, p + q, p * q, p - q, p + 1].map(String), explanation: `x² − ${p + q}x + ${p * q} = (x − ${p})(x − ${q}) = 0, so the roots are ${p} and ${q}. The larger is ${p}.`, params: { p, q } };
    },
  },
  {
    id: "ap-nth",
    label: "Arithmetic progressions",
    make: (r) => {
      const a = r.int(2, 15), d = r.int(2, 9), n = r.int(8, 20), ans = a + (n - 1) * d;
      return { text: `The first term of an AP is ${a} and the common difference is ${d}. What is its ${n}th term?`, answer: String(ans), wrong: [a + n * d, a + (n + 1) * d, a + (n - 2) * d, a * d + n, ans + d].map(String), explanation: `nth term = a + (n − 1)d = ${a} + ${n - 1} × ${d} = ${ans}.`, params: { a, d, n } };
    },
  },
  {
    id: "ap-sum",
    label: "AP sums",
    make: (r) => {
      const n = 2 * r.int(4, 10), a = r.int(1, 10), d = r.int(1, 6), ans = (n / 2) * (2 * a + (n - 1) * d);
      return { text: `Find the sum of the first ${n} terms of the AP that starts at ${a} with common difference ${d}.`, answer: String(ans), wrong: [n * (2 * a + (n - 1) * d), (n / 2) * (2 * a + n * d), (n / 2) * (a + (n - 1) * d), ans + n, ans - d].map(String), explanation: `Sum = n/2 × (2a + (n − 1)d) = ${n}/2 × (${2 * a} + ${(n - 1) * d}) = ${ans}.`, params: { n, a, d } };
    },
  },
  {
    id: "pythagoras",
    label: "Pythagoras theorem",
    make: (r) => {
      const [x, y, z] = r.pick(TRIPLES), k = r.int(1, 3), a = x * k, b = y * k, c = z * k;
      return { text: `A right-angled triangle has legs of ${a} cm and ${b} cm. How long is the hypotenuse?`, answer: num(c, "cm"), wrong: [a + b, c + 1, c - 1, Math.abs(b - a), c * 2].map((n) => num(n, "cm")), explanation: `c² = ${a}² + ${b}² = ${a * a} + ${b * b} = ${c * c}, so c = ${c} cm.`, params: { a, b } };
    },
  },
  {
    id: "identity",
    label: "Algebraic identities",
    make: (r) => {
      const s = r.int(5, 15), p = r.int(2, Math.floor((s * s) / 4)), ans = s * s - 2 * p;
      return { text: `If a + b = ${s} and ab = ${p}, what is a² + b²?`, answer: String(ans), wrong: [s * s - p, s * s + 2 * p, s * s, 2 * p, ans + 2].map(String), explanation: `(a + b)² = a² + 2ab + b², so a² + b² = ${s}² − 2 × ${p} = ${s * s} − ${2 * p} = ${ans}.`, params: { s, p } };
    },
  },
  {
    id: "distance",
    label: "Coordinate geometry",
    make: (r) => {
      const [x, y, z] = r.pick(TRIPLES), k = r.int(1, 2), dx = x * k, dy = y * k, c = z * k;
      const x1 = r.int(-5, 5), y1 = r.int(-5, 5), x2 = x1 + dx, y2 = y1 + dy;
      return { text: `Find the distance between the points (${fmtInt(x1)}, ${fmtInt(y1)}) and (${fmtInt(x2)}, ${fmtInt(y2)}).`, answer: String(c), wrong: [dx + dy, c + 1, c - 1, dx * dy, c * 2].map(String), explanation: `Distance = √(${dx}² + ${dy}²) = √${dx * dx + dy * dy} = ${c}.`, params: { x1, y1, x2, y2 } };
    },
  },
  {
    id: "trig",
    label: "Trigonometry",
    make: (r) => {
      const item = r.pick(TRIG);
      const wrong = ["0", "1/2", "1", "3/2", "5/4", "1/4", "2"].filter((v) => v !== item.answer);
      return { text: `Find the value of ${item.expr}.`, answer: item.answer, wrong, explanation: `Use sin 30° = ½, cos 60° = ½, tan 45° = 1, sin 90° = 1 and cos 0° = 1. ${item.expr} = ${item.answer}.`, params: { i: TRIG.indexOf(item) } };
    },
  },
  {
    id: "probability",
    label: "Probability",
    make: (r) => {
      const red = r.int(1, 6), blue = r.int(1, 6), green = r.int(0, 5), total = red + blue + green;
      const balls = `${red} red, ${blue} blue${green > 0 ? ` and ${green} green` : ""}`;
      return { text: `A bag holds ${balls} balls. One ball is picked at random. What is the probability it is red?`, answer: fraction(red, total), wrong: [fraction(blue, total), fraction(total - red, total), fraction(red, blue), fraction(red, total + 1), fraction(red + 1, total)], explanation: `Probability = favourable ÷ total = ${red}/${total}${fraction(red, total) !== `${red}/${total}` ? ` = ${fraction(red, total)}` : ""}.`, params: { red, blue, green } };
    },
  },
  {
    id: "cylinder",
    label: "Mensuration",
    make: (r) => {
      const h = r.int(2, 15), ans = 154 * h;
      return { text: `A cylinder has a radius of 7 cm and a height of ${h} cm. What is its volume? (Use π = 22/7)`, answer: num(ans, "cm³"), wrong: [44 * h, 22 * h, 308 * h, 154 * (h + 1), ans + 7].map((n) => num(n, "cm³")), explanation: `Volume = π r² h = 22/7 × 7 × 7 × ${h} = ${ans} cm³.`, params: { h } };
    },
  },
  {
    id: "simultaneous",
    label: "Linear equations",
    make: (r) => {
      const x = r.int(2, 15), y = r.int(1, x - 1), s = x + y, d = x - y;
      return { text: `If x + y = ${s} and x − y = ${d}, what is x?`, answer: String(x), wrong: [y, s, d, 2 * x, x + 1].map(String), explanation: `Add the two equations: 2x = ${s} + ${d} = ${s + d}, so x = ${x}.`, params: { s, d } };
    },
  },
];

export const TOPICS: Record<QuizLevel, Topic[]> = { "5-6": LEVEL_5_6, "7-8": LEVEL_7_8, "9-10": LEVEL_9_10 };

// ------------------------------------------------------------------------ quiz

export type Question = {
  n: number; // 1-based
  topic: string; // topic id
  topicLabel: string;
  text: string;
  options: string[]; // 4, all different
  answerIndex: number;
  explanation: string;
  params: Record<string, number>;
};
export type Quiz = { date: string; level: QuizLevel; questions: Question[] };

// 4 unique options: the answer plus 3 different plausible wrong ones. The
// topic's own mistakes come first; plain neighbours of a numeric answer fill
// any gap, so there are always enough.
function buildOptions(raw: Raw, r: Rng): { options: string[]; answerIndex: number } {
  const seen = new Set<string>([raw.answer]);
  const wrong: string[] = [];
  for (const w of r.shuffle(raw.wrong)) {
    if (w && !/^-|NaN|Infinity|^₹-|^0( |$)/.test(w) && !seen.has(w)) {
      seen.add(w);
      wrong.push(w);
    }
    if (wrong.length === 3) break;
  }
  const asNumber = Number(raw.answer.replace(/[^\d]/g, ""));
  for (let step = 1; wrong.length < 3 && step < 60 && Number.isFinite(asNumber); step++) {
    const unit = raw.answer.replace(/^[₹\d,\s]+/, "").trim();
    const prefix = raw.answer.startsWith("₹") ? "₹" : "";
    for (const candidate of [asNumber + step, asNumber - step]) {
      const text = prefix ? rupees(candidate) : unit ? `${candidate} ${unit}` : String(candidate);
      if (candidate > 0 && !seen.has(text) && wrong.length < 3) {
        seen.add(text);
        wrong.push(text);
      }
    }
  }
  const options = r.shuffle([raw.answer, ...wrong.slice(0, 3)]);
  return { options, answerIndex: options.indexOf(raw.answer) };
}

export function generateQuiz(date: string, level: QuizLevel): Quiz {
  const topics = TOPICS[level];
  const picker = new Rng(`${date}|${level}|topics`);
  const chosen = picker.shuffle(topics).slice(0, QUESTIONS_PER_QUIZ);
  const questions = chosen.map((topic, i): Question => {
    const rng = new Rng(`${date}|${level}|${topic.id}`);
    const raw = topic.make(rng);
    const { options, answerIndex } = buildOptions(raw, rng);
    return { n: i + 1, topic: topic.id, topicLabel: topic.label, text: raw.text, options, answerIndex, explanation: raw.explanation, params: raw.params };
  });
  return { date, level, questions };
}

export function scoreAnswers(quiz: Quiz, answers: number[]): { score: number; correct: boolean[] } {
  const correct = quiz.questions.map((q, i) => answers[i] === q.answerIndex);
  return { score: correct.filter(Boolean).length, correct };
}
