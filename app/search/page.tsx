import Link from "next/link";
import { pg } from "@/lib/db";
import Avatar from "@/components/Avatar";
import { SearchIcon, LocationIcon } from "@/components/icons";
import { responseTimeLabel } from "@/lib/responseTime";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Find a teacher",
  description:
    "Search teachers by subject and city across India. Read real feedback from students and parents, and connect directly — free for teachers, no agency in between.",
};

const POPULAR_SUBJECTS = ["Maths", "Physics", "Chemistry", "Biology", "English", "Computer Science"];

type Teacher = {
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

export default async function SearchPage({
  searchParams,
}: {
  searchParams: { subject?: string; city?: string };
}) {
  const subject = searchParams.subject?.trim();
  const city = searchParams.city?.trim();

  const filters: string[] = [];
  if (subject) filters.push(`subjects=cs.%7B${encodeURIComponent(subject)}%7D`);
  if (city) filters.push(`city=ilike.*${encodeURIComponent(city)}*`);
  filters.push("order=avg_rating.desc,review_count.desc");
  filters.push(
    "select=user_id,name,bio,subjects,city,rate_per_hour,experience_years,avg_rating,review_count,is_subscribed,avatar_url,avatar_seed,self_attested_at,avg_response_hours,replied_conversation_count"
  );

  const teachers: Teacher[] = (await pg(`/teacher_public?${filters.join("&")}`)) ?? [];

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
        <div className="pills" style={{ marginTop: 14 }}>
          {POPULAR_SUBJECTS.map((s) => (
            <Link key={s} href={`/search?subject=${encodeURIComponent(s)}`} className="pill pill-link">
              {s}
            </Link>
          ))}
        </div>
      </div>

      <h2>{teachers.length} teacher{teachers.length === 1 ? "" : "s"} found</h2>
      {teachers.length === 0 && (
        <p className="hint">No teachers match yet — try a different subject or city.</p>
      )}
      <div className="teacher-grid">
        {teachers.map((t) => (
          <Link href={`/teacher/${t.user_id}`} key={t.user_id} className="teacher-card card">
            <div className="row" style={{ gap: 12, alignItems: "flex-start" }}>
              <Avatar avatarUrl={t.avatar_url} avatarSeed={t.avatar_seed} label={t.name} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="row" style={{ justifyContent: "space-between", gap: 8 }}>
                  <b>{t.name}</b>
                  {t.is_subscribed && <span className="badge">Featured</span>}
                </div>
                <p className="hint" style={{ margin: "4px 0 6px" }}>
                  {t.city ?? "—"}
                  {t.rate_per_hour ? ` · ₹${t.rate_per_hour}/hr` : ""}
                </p>
                <div className="pills">
                  {t.subjects?.slice(0, 4).map((s) => (
                    <span key={s} className="pill">{s}</span>
                  ))}
                </div>
                <p className="stars" style={{ margin: "8px 0 0" }}>
                  {t.review_count > 0 ? `★ ${t.avg_rating} (${t.review_count})` : "No feedback yet"}
                </p>
                {t.self_attested_at && (
                  <p className="hint" style={{ margin: "4px 0 0", fontSize: 12 }}>
                    ✓ Self-confirmed profile
                  </p>
                )}
                {responseTimeLabel(t.avg_response_hours, t.replied_conversation_count) && (
                  <p className="hint" style={{ margin: "2px 0 0", fontSize: 12 }}>
                    {responseTimeLabel(t.avg_response_hours, t.replied_conversation_count)}
                  </p>
                )}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
