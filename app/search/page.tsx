import Link from "next/link";
import { queryTeacherPublic } from "@/lib/teacherPublic";
import { SearchIcon, LocationIcon } from "@/components/icons";
import TeacherCard from "@/components/TeacherCard";
import InviteTeacherCard from "@/components/InviteTeacherCard";
import { getSessionUser } from "@/lib/auth";
import { CLASSES, EXAMS, EXAM_CODES } from "@/lib/levels";

// Numbers only for price/rating filters; anything else is ignored rather
// than passed to PostgREST.
const num = (v?: string) => (v && /^d+(.d+)?$/.test(v.trim()) ? v.trim() : undefined);
import type { DirectoryTeacher } from "@/lib/directory";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Find a teacher",
  description:
    "Search teachers by subject and city across India. Read real feedback from students and parents, and connect directly — free for teachers, no agency in between.",
};

const POPULAR_SUBJECTS = ["Maths", "Physics", "Chemistry", "Biology", "English", "Computer Science"];
const PAGE_SIZE = 12;

export default async function SearchPage({
  searchParams,
}: {
  searchParams: {
    subject?: string;
    city?: string;
    minPrice?: string;
    maxPrice?: string;
    minRating?: string;
    mode?: string;
    cls?: string;
    exam?: string;
    page?: string;
  };
}) {
  const subject = searchParams.subject?.trim();
  const city = searchParams.city?.trim();
  const minPrice = num(searchParams.minPrice);
  const maxPrice = num(searchParams.maxPrice);
  const minRating = num(searchParams.minRating);
  // Growth #2 / #3 filters: only values from the fixed vocabulary.
  const mode = searchParams.mode === "online" || searchParams.mode === "home" ? searchParams.mode : undefined;
  const cls = (CLASSES as readonly string[]).includes(searchParams.cls ?? "") ? searchParams.cls : undefined;
  const exam = EXAM_CODES.includes(searchParams.exam ?? "") ? searchParams.exam : undefined;
  const page = Math.max(1, Number(searchParams.page) || 1);

  const filters: string[] = [];
  if (subject) filters.push(`subjects=cs.%7B${encodeURIComponent(subject)}%7D`);
  if (city) filters.push(`city=ilike.*${encodeURIComponent(city)}*`);
  if (minPrice) filters.push(`rate_per_hour=gte.${encodeURIComponent(minPrice)}`);
  if (maxPrice) filters.push(`rate_per_hour=lte.${encodeURIComponent(maxPrice)}`);
  if (minRating) filters.push(`avg_rating=gte.${encodeURIComponent(minRating)}`);
  if (mode === "online") filters.push("teaching_mode=in.(online,both)");
  if (mode === "home") filters.push("teaching_mode=in.(home,both)");
  if (cls) filters.push(`classes=cs.%7B${cls}%7D`);
  if (exam) filters.push(`exams=cs.%7B${exam}%7D`);
  filters.push("order=avg_rating.desc,review_count.desc");
  filters.push(
    "select=user_id,name,bio,subjects,city,rate_per_hour,experience_years,avg_rating,review_count,is_subscribed,avatar_url,avatar_seed,self_attested_at,avg_response_hours,replied_conversation_count,teaching_mode,classes,boards,exams"
  );
  // Fetch one extra row to know whether a next page exists, without needing
  // a separate exact-count query (Prefer: count=exact) or protocol changes
  // to lib/db.ts's pg() — cheap, and PostgREST already supports limit/offset
  // as plain query params.
  filters.push(`limit=${PAGE_SIZE + 1}`);
  filters.push(`offset=${(page - 1) * PAGE_SIZE}`);

  const { rows, levelsAvailable } = await queryTeacherPublic<DirectoryTeacher>(filters.join("&"));
  const teachers = rows.slice(0, PAGE_SIZE);
  const hasNextPage = rows.length > PAGE_SIZE;
  // Only needed for the invite card on an empty result.
  const viewer = teachers.length === 0 ? await getSessionUser().catch(() => null) : null;

  function pageHref(p: number) {
    const params = new URLSearchParams();
    if (subject) params.set("subject", subject);
    if (city) params.set("city", city);
    if (minPrice) params.set("minPrice", minPrice);
    if (maxPrice) params.set("maxPrice", maxPrice);
    if (minRating) params.set("minRating", minRating);
    if (mode) params.set("mode", mode);
    if (cls) params.set("cls", cls);
    if (exam) params.set("exam", exam);
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return qs ? `/search?${qs}` : "/search";
  }

  return (
    <div>
      <div className="search-hero">
        <h1>Find a teacher</h1>
        <p className="hint" style={{ marginBottom: 20 }}>
          Search by subject and city — no sign-up needed to browse.
        </p>
        <form method="get" className="search-bar">
          <div className="search-field">
            <SearchIcon size={18} />
            <input name="subject" placeholder="Subject (e.g. Maths)" defaultValue={subject} />
          </div>
          <div className="search-field">
            <LocationIcon size={18} />
            <input name="city" placeholder="City" defaultValue={city} />
          </div>
          <button type="submit">Search</button>
        </form>
        <div className="search-bar" style={{ marginTop: 10 }}>
          <div className="search-field">
            <input name="minPrice" type="number" min={0} placeholder="Min ₹/hr" defaultValue={minPrice} form="filters-form" />
          </div>
          <div className="search-field">
            <input name="maxPrice" type="number" min={0} placeholder="Max ₹/hr" defaultValue={maxPrice} form="filters-form" />
          </div>
          <div className="search-field">
            <select name="minRating" defaultValue={minRating ?? ""} form="filters-form">
              <option value="">Any rating</option>
              <option value="4">4★ &amp; up</option>
              <option value="3">3★ &amp; up</option>
              <option value="2">2★ &amp; up</option>
            </select>
          </div>
          <div className="search-field">
            <select name="mode" defaultValue={mode ?? ""} form="filters-form" aria-label="How they teach">
              <option value="">Home or online</option>
              <option value="online">Online</option>
              <option value="home">Home tuition</option>
            </select>
          </div>
          <div className="search-field">
            <select name="cls" defaultValue={cls ?? ""} form="filters-form" aria-label="Class">
              <option value="">Any class</option>
              {CLASSES.map((c) => (
                <option key={c} value={c}>Class {c}</option>
              ))}
            </select>
          </div>
          <div className="search-field">
            <select name="exam" defaultValue={exam ?? ""} form="filters-form" aria-label="Exam">
              <option value="">Any exam</option>
              {EXAMS.map((e) => (
                <option key={e.code} value={e.code}>{e.label}</option>
              ))}
            </select>
          </div>
          <button type="submit" className="secondary" form="filters-form">Apply filters</button>
        </div>
        <form id="filters-form" method="get" hidden>
          <input type="hidden" name="subject" defaultValue={subject ?? ""} />
          <input type="hidden" name="city" defaultValue={city ?? ""} />
        </form>
        <div className="pills" style={{ marginTop: 14 }}>
          {POPULAR_SUBJECTS.map((s) => (
            <Link key={s} href={`/search?subject=${encodeURIComponent(s)}`} className="pill pill-link">
              {s}
            </Link>
          ))}
        </div>
      </div>

      {!levelsAvailable && (mode || cls || exam) && (
        <p className="hint">Online, class and exam filters are temporarily unavailable, so these results are not filtered by them.</p>
      )}
      <h2>
        {teachers.length} teacher{teachers.length === 1 ? "" : "s"}
        {page === 1 && !hasNextPage ? " found" : " on this page"}
      </h2>
      {teachers.length === 0 && (
        <>
          <p className="hint">No teachers match yet — try a different subject or city.</p>
          {page === 1 && (subject || city) && (
            <InviteTeacherCard subject={subject} city={city} inviterId={viewer?.id ?? null} />
          )}
        </>
      )}
      <div className="teacher-grid">
        {teachers.map((t) => (
          <TeacherCard key={t.user_id} teacher={t} />
        ))}
      </div>
      {(page > 1 || hasNextPage) && (
        <div className="row" style={{ justifyContent: "center", gap: 12, marginTop: 24 }}>
          {page > 1 ? (
            <Link href={pageHref(page - 1)} className="btn secondary">← Previous</Link>
          ) : (
            <span />
          )}
          <span className="hint">Page {page}</span>
          {hasNextPage ? (
            <Link href={pageHref(page + 1)} className="btn secondary">Next →</Link>
          ) : (
            <span />
          )}
        </div>
      )}
    </div>
  );
}
