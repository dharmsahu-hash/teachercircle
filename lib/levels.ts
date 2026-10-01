// Teaching mode, classes, boards and exams on a teacher profile (growth
// ideas #2 and #3). A fixed vocabulary, not free text: these values become
// landing-page slugs (/tutors/online/maths, /tutors/exam/neet/physics,
// /tutors/kanpur/maths/class-10), and free text would split one real page
// into "cbse", "C.B.S.E", "Cbse board". db/migrations/0027 enforces the same
// lists with CHECK constraints — keep the two in sync.

export const TEACHING_MODES = ["home", "online", "both"] as const;
export type TeachingMode = (typeof TEACHING_MODES)[number];

export const MODE_LABELS: Record<TeachingMode, string> = {
  home: "Home tuition",
  online: "Online",
  both: "Home tuition and online",
};

export const CLASSES = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"] as const;

export const BOARDS = [
  { code: "cbse", label: "CBSE" },
  { code: "icse", label: "ICSE / ISC" },
  { code: "state", label: "State board" },
  { code: "ib", label: "IB" },
  { code: "igcse", label: "IGCSE / Cambridge" },
  { code: "nios", label: "NIOS" },
] as const;

export const EXAMS = [
  { code: "jee", label: "JEE" },
  { code: "neet", label: "NEET" },
  { code: "cuet", label: "CUET" },
  { code: "olympiad", label: "Olympiads" },
  { code: "ntse", label: "NTSE" },
  { code: "nda", label: "NDA" },
  { code: "ielts", label: "IELTS" },
] as const;

export const BOARD_CODES = BOARDS.map((b) => b.code) as string[];
export const EXAM_CODES = EXAMS.map((e) => e.code) as string[];

export function boardLabel(code: string): string {
  return BOARDS.find((b) => b.code === code)?.label ?? code.toUpperCase();
}
export function examLabel(code: string): string {
  return EXAMS.find((e) => e.code === code)?.label ?? code.toUpperCase();
}

export function teachesOnline(mode: string | null | undefined): boolean {
  return mode === "online" || mode === "both";
}
export function teachesAtHome(mode: string | null | undefined): boolean {
  return !mode || mode === "home" || mode === "both";
}

// "class-10" <-> "10" for URLs.
export function classSlug(c: string): string {
  return `class-${c}`;
}
export function classFromSlug(slug: string): string | null {
  const m = slug.match(/^class-(\d{1,2})$/);
  return m && (CLASSES as readonly string[]).includes(m[1]) ? m[1] : null;
}

// ["9","10","11","12","5"] -> "Classes 5, 9–12" — compact for cards.
export function classesLabel(classes: string[] | null | undefined): string | null {
  const nums = [...new Set((classes ?? []).map(Number).filter((n) => n >= 1 && n <= 12))].sort((a, b) => a - b);
  if (nums.length === 0) return null;
  const parts: string[] = [];
  let start = nums[0];
  let prev = nums[0];
  for (const n of [...nums.slice(1), Infinity]) {
    if (n === prev + 1) {
      prev = n;
      continue;
    }
    parts.push(start === prev ? `${start}` : `${start}–${prev}`);
    start = prev = n;
  }
  return `${nums.length === 1 ? "Class" : "Classes"} ${parts.join(", ")}`;
}
