import { queryTeacherPublic } from "./teacherPublic";
import { slugify } from "./slug";
import { cachedRead } from "./cachedRead";
import { classFromSlug, classSlug, EXAM_CODES, examLabel, teachesOnline } from "./levels";

// G1/G3 (docs/07-growth-review-2026-09-20.md): city + subject SEO landing
// pages, plus the hub page linking to them. `city` is free text (not a
// normalized column) and `subjects` is a text[], so "distinct city/subject
// values" is computed here in application code rather than via a Postgres
// DISTINCT/unnest — simpler than adding a new view, and entirely fine at
// this scale (tens, not millions, of listed teachers).
const SELECT =
  "user_id,name,bio,subjects,city,rate_per_hour,experience_years,avg_rating,review_count,is_subscribed,avatar_url,avatar_seed,self_attested_at,avg_response_hours,replied_conversation_count,teaching_mode,classes,boards,exams";

export type DirectoryTeacher = {
  user_id: string;
  name: string;
  bio: string | null;
  subjects: string[];
  city: string | null;
  rate_per_hour: number | null;
  experience_years: number | null;
  avg_rating: number;
  review_count: number;
  is_subscribed: boolean;
  avatar_url: string | null;
  avatar_seed: string | null;
  self_attested_at: string | null;
  avg_response_hours: number | null;
  replied_conversation_count: number | null;
  // Growth #2 / #3 (migration 0027). Optional so older callers and fixtures still type-check.
  teaching_mode?: string | null;
  classes?: string[] | null;
  boards?: string[] | null;
  exams?: string[] | null;
};

export { slugify };

// Cached (lib/cache.ts). The loader THROWS on failure so an error is never
// cached; the caller below turns it into an empty list for this request only.
const loadListedTeachers = cachedRead(["directory", "listed"], async () => (await queryTeacherPublic<DirectoryTeacher>(`select=${SELECT}`)).rows);

async function getAllListedTeachers(): Promise<DirectoryTeacher[]> {
  try {
    return await loadListedTeachers();
  } catch {
    return [];
  }
}

// Home page and sitemap only need a sliver of the listing; they share the
// same cached read instead of making their own queries.
export async function getListingStats(): Promise<{ teacherCount: number; cityCount: number }> {
  const teachers = await getAllListedTeachers();
  return { teacherCount: teachers.length, cityCount: new Set(teachers.map((t) => t.city).filter(Boolean)).size };
}

export async function getListedTeacherIds(): Promise<string[]> {
  return (await getAllListedTeachers()).map((t) => t.user_id);
}

export type Directory = {
  teachers: DirectoryTeacher[];
  cities: Map<string, string>; // slug -> real display name
  subjects: Map<string, string>;
  pairs: Set<string>; // "citySlug/subjectSlug" — only combinations with >= 1 real teacher
  // Growth #2: subjects taught by at least one online teacher.
  onlineSubjects: Map<string, string>;
  // Growth #3: exam code -> subjects taught by a teacher preparing for it.
  examSubjects: Map<string, Map<string, string>>;
  // Growth #3: "citySlug/subjectSlug/class-N" with >= 1 real teacher.
  cityClassPages: Set<string>;
};

// /tutors/online/... and /tutors/exam/... are fixed routes, so a teacher
// whose city field says "Online" or "Exam" must not also produce a city page
// with that slug.
export const RESERVED_CITY_SLUGS = new Set(["online", "exam"]);

// Pure: builds every landing-page index from the listed teachers. Every
// entry comes from a real listing, which is what keeps these pages from
// ever being empty ("thin") pages.
export function buildDirectory(teachers: DirectoryTeacher[]): Directory {
  const cities = new Map<string, string>();
  const subjects = new Map<string, string>();
  const pairs = new Set<string>();
  const onlineSubjects = new Map<string, string>();
  const examSubjects = new Map<string, Map<string, string>>();
  const cityClassPages = new Set<string>();

  for (const t of teachers) {
    let citySlug = t.city ? slugify(t.city) : "";
    if (RESERVED_CITY_SLUGS.has(citySlug)) citySlug = "";
    if (citySlug && !cities.has(citySlug)) cities.set(citySlug, t.city!.trim());
    const online = teachesOnline(t.teaching_mode);
    const classes = (t.classes ?? []).filter((c) => classFromSlug(classSlug(c)));

    for (const subject of t.subjects ?? []) {
      const subjectSlug = slugify(subject);
      if (!subjectSlug) continue;
      const name = subject.trim();
      if (!subjects.has(subjectSlug)) subjects.set(subjectSlug, name);
      if (citySlug) {
        pairs.add(`${citySlug}/${subjectSlug}`);
        for (const c of classes) cityClassPages.add(`${citySlug}/${subjectSlug}/${classSlug(c)}`);
      }
      if (online && !onlineSubjects.has(subjectSlug)) onlineSubjects.set(subjectSlug, name);
      for (const exam of t.exams ?? []) {
        if (!EXAM_CODES.includes(exam)) continue;
        const forExam = examSubjects.get(exam) ?? new Map<string, string>();
        if (!forExam.has(subjectSlug)) forExam.set(subjectSlug, name);
        examSubjects.set(exam, forExam);
      }
    }
  }

  return { teachers, cities, subjects, pairs, onlineSubjects, examSubjects, cityClassPages };
}

export async function getDirectory(): Promise<Directory> {
  return buildDirectory(await getAllListedTeachers());
}

const teachesSubject = (t: DirectoryTeacher, subjectSlug: string) =>
  (t.subjects ?? []).some((s) => slugify(s) === subjectSlug);

// /tutors/online — every online teacher, plus the subjects with a page.
export async function getOnlinePage() {
  const { teachers, onlineSubjects } = await getDirectory();
  const matches = teachers.filter((t) => teachesOnline(t.teaching_mode));
  if (matches.length === 0) return null;
  return { teachers: matches, subjects: onlineSubjects };
}

// /tutors/online/<subject>
export async function getOnlineSubjectPage(subjectSlug: string) {
  const { teachers, onlineSubjects } = await getDirectory();
  const subjectName = onlineSubjects.get(subjectSlug);
  if (!subjectName) return null;
  const matches = teachers.filter((t) => teachesOnline(t.teaching_mode) && teachesSubject(t, subjectSlug));
  return { subjectName, teachers: matches };
}

// /tutors/exam/<exam>
export async function getExamPage(exam: string) {
  const { teachers, examSubjects } = await getDirectory();
  const subjectsForExam = examSubjects.get(exam);
  if (!subjectsForExam) return null;
  const matches = teachers.filter((t) => (t.exams ?? []).includes(exam));
  return { exam, examName: examLabel(exam), teachers: matches, subjects: subjectsForExam };
}

// /tutors/exam/<exam>/<subject>
export async function getExamSubjectPage(exam: string, subjectSlug: string) {
  const { teachers, examSubjects } = await getDirectory();
  const subjectName = examSubjects.get(exam)?.get(subjectSlug);
  if (!subjectName) return null;
  const matches = teachers.filter((t) => (t.exams ?? []).includes(exam) && teachesSubject(t, subjectSlug));
  return { exam, examName: examLabel(exam), subjectName, teachers: matches };
}

// /tutors/<city>/<subject>/class-<n>
export async function getCitySubjectClassPage(citySlug: string, subjectSlug: string, level: string) {
  const { teachers, cities, subjects, cityClassPages } = await getDirectory();
  const cls = classFromSlug(level);
  if (!cls || !cityClassPages.has(`${citySlug}/${subjectSlug}/${level}`)) return null;
  const matches = teachers.filter(
    (t) => t.city && slugify(t.city) === citySlug && teachesSubject(t, subjectSlug) && (t.classes ?? []).includes(cls)
  );
  return { cityName: cities.get(citySlug)!, subjectName: subjects.get(subjectSlug)!, cls, teachers: matches };
}

// City pages are guaranteed non-thin by construction: `cities` only ever
// contains slugs derived from a real teacher's own city field, so this
// always returns at least one match once cityName resolves.
export async function getCityPage(citySlug: string) {
  const { teachers, cities } = await getDirectory();
  const cityName = cities.get(citySlug);
  if (!cityName) return null;

  const matches = teachers.filter((t) => t.city && slugify(t.city) === citySlug);
  const subjectsInCity = new Map<string, string>();
  for (const t of matches) {
    for (const s of t.subjects ?? []) {
      const slug = slugify(s);
      if (slug && !subjectsInCity.has(slug)) subjectsInCity.set(slug, s.trim());
    }
  }
  return { cityName, teachers: matches, subjectsInCity };
}

// Unlike getCityPage, city and subject are collected independently across
// *all* teachers — a city existing and a subject existing don't imply any
// teacher in that city teaches that subject. `pairs` is the actual join;
// checking it first is what keeps this from ever rendering a thin/empty
// page (G1's own stated caveat), not just filtering afterward.
export async function getCitySubjectPage(citySlug: string, subjectSlug: string) {
  const { teachers, cities, subjects, pairs } = await getDirectory();
  if (!pairs.has(`${citySlug}/${subjectSlug}`)) return null;

  const cityName = cities.get(citySlug)!;
  const subjectName = subjects.get(subjectSlug)!;
  const matches = teachers.filter(
    (t) => t.city && slugify(t.city) === citySlug && (t.subjects ?? []).some((s) => slugify(s) === subjectSlug)
  );
  return { cityName, subjectName, teachers: matches };
}
