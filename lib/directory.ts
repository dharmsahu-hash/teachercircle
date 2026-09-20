import { pg } from "./db";

// G1/G3 (docs/07-growth-review-2026-09-20.md): city + subject SEO landing
// pages, plus the hub page linking to them. `city` is free text (not a
// normalized column) and `subjects` is a text[], so "distinct city/subject
// values" is computed here in application code rather than via a Postgres
// DISTINCT/unnest — simpler than adding a new view, and entirely fine at
// this scale (tens, not millions, of listed teachers).
const SELECT =
  "user_id,name,bio,subjects,city,rate_per_hour,experience_years,avg_rating,review_count,is_subscribed,avatar_url,avatar_seed,self_attested_at,avg_response_hours,replied_conversation_count";

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
};

export function slugify(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function getAllListedTeachers(): Promise<DirectoryTeacher[]> {
  return (await pg(`/teacher_public?select=${SELECT}`).catch(() => [])) ?? [];
}

export type Directory = {
  teachers: DirectoryTeacher[];
  cities: Map<string, string>; // slug -> real display name
  subjects: Map<string, string>;
  pairs: Set<string>; // "citySlug/subjectSlug" — only combinations with >= 1 real teacher
};

export async function getDirectory(): Promise<Directory> {
  const teachers = await getAllListedTeachers();
  const cities = new Map<string, string>();
  const subjects = new Map<string, string>();
  const pairs = new Set<string>();

  for (const t of teachers) {
    const citySlug = t.city ? slugify(t.city) : "";
    if (citySlug && !cities.has(citySlug)) cities.set(citySlug, t.city!.trim());

    for (const subject of t.subjects ?? []) {
      const subjectSlug = slugify(subject);
      if (!subjectSlug) continue;
      if (!subjects.has(subjectSlug)) subjects.set(subjectSlug, subject.trim());
      if (citySlug) pairs.add(`${citySlug}/${subjectSlug}`);
    }
  }

  return { teachers, cities, subjects, pairs };
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
