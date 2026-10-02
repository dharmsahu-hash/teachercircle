// Pure helpers for "I need a tutor" posts (growth idea #1): page titles, URLs
// and the check that keeps contact details out of public posts. Kept free of
// database and Next imports so they can be unit tested directly.

import { boardLabel, examLabel, type TeachingMode } from "./levels";
import { slugify } from "./slug";

export type TutorRequest = {
  id: string;
  subject: string;
  city: string | null;
  class: string | null;
  board: string | null;
  exam: string | null;
  mode: TeachingMode;
  details: string | null;
  created_at: string;
  expires_at: string;
  response_count?: number | string | null;
};

// "Maths" -> "Maths"; "maths " -> "Maths"; "NEET physics" stays as typed
// apart from the first letter, so acronyms survive.
export function normalizeSubject(subject: string): string {
  const s = subject.trim().replace(/\s+/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// "for CBSE Class 10", "for NEET", "for Class 9 ICSE" -> the level suffix of a title.
export function levelSuffix(r: Pick<TutorRequest, "class" | "board" | "exam">): string {
  const parts = [
    r.exam ? examLabel(r.exam) : null,
    r.board ? boardLabel(r.board) : null,
    r.class ? `Class ${r.class}` : null,
  ].filter(Boolean);
  return parts.length ? ` for ${parts.join(" ")}` : "";
}

// "Maths tutor needed in Indore for CBSE Class 10" /
// "Physics tutor needed online for NEET"
export function requestTitle(r: Pick<TutorRequest, "subject" | "city" | "mode" | "class" | "board" | "exam">): string {
  const where = r.city ? (r.mode === "online" ? `online (${r.city})` : `in ${r.city}`) : "online";
  return `${r.subject} tutor needed ${where}${levelSuffix(r)}`;
}

const UUID_TAIL = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

// /tutor-requests/maths-tutor-indore-class-10-<uuid>
export function requestPath(r: Pick<TutorRequest, "id" | "subject" | "city" | "class">): string {
  const words = [r.subject, "tutor", r.city ?? "online", r.class ? `class ${r.class}` : ""].join(" ");
  const slug = slugify(words).slice(0, 60).replace(/-+$/, "");
  return `/tutor-requests/${slug}-${r.id}`;
}

// The id is always the trailing UUID, so a stale or mistyped slug still
// resolves (the page then redirects to the canonical URL).
export function requestIdFromParam(param: string): string | null {
  return UUID_TAIL.exec(param)?.[1].toLowerCase() ?? null;
}

// Posts are public, so phone numbers, emails, links and social handles are
// refused: replies go through in-app messages, where a block/report exists.
// Deliberately generous (a false positive costs one edit; a false negative
// publishes a stranger's number to the whole web).
export function containsContactInfo(text: string): boolean {
  if (!text) return false;
  if (/[^\s@]+@[^\s@]+\.[^\s@]+/.test(text)) return true; // email
  if (/\b(?:https?:\/\/|www\.)\S+/i.test(text)) return true; // link
  if (/\b[\w-]+\.(?:com|in|org|net|co|io|me|ly)\b/i.test(text)) return true; // bare domain
  if (/\b(?:whats\s?app|telegram|instagram|insta|snapchat|call me|contact me)\b/i.test(text)) return true;
  if (/(?:^|\s)@\w{3,}/.test(text)) return true; // @handle
  // A phone number: 8+ digits once separators are ignored, also when spaced
  // out or written with words between groups of digits ("98765 43210").
  const digits = text.replace(/[\s().+-]/g, "");
  if (/\d{8,}/.test(digits)) return true;
  if (/\b\d{5}\s*\d{5}\b/.test(text)) return true;
  return false;
}

export const CONTACT_INFO_ERROR =
  "Please don't put phone numbers, emails or links in a public request. Teachers will reply to you through TeacherCircle messages.";

export function daysLeft(expiresAt: string, now: number = Date.now()): number {
  return Math.max(0, Math.ceil((Date.parse(expiresAt) - now) / 86_400_000));
}

// Meta description / page lead: factual, from the post itself.
export function requestSummary(r: TutorRequest): string {
  const bits = [requestTitle(r) + "."];
  if (r.mode === "both") bits.push("Open to home tuition or online classes.");
  else if (r.mode === "online") bits.push("Online classes preferred.");
  else bits.push("Home tuition preferred.");
  if (r.details) bits.push(r.details.length > 140 ? `${r.details.slice(0, 137)}...` : r.details);
  return bits.join(" ");
}

export function formatRequestDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}
