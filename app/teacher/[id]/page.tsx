import { pg } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { getAppBaseUrl } from "@/lib/url";
import Avatar from "@/components/Avatar";
import ConnectAndReview from "./ConnectAndReview";
import { responseTimeLabel } from "@/lib/responseTime";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

type Review = { rating: number; comment: string | null; created_at: string };
type TeacherRow = {
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

async function getTeacher(id: string): Promise<TeacherRow | null> {
  const rows = await pg(
    `/teacher_public?user_id=eq.${id}&select=user_id,name,bio,subjects,city,rate_per_hour,experience_years,avg_rating,review_count,is_subscribed,avatar_url,avatar_seed,self_attested_at,avg_response_hours,replied_conversation_count`
  );
  return Array.isArray(rows) ? rows[0] ?? null : null;
}

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const teacher = await getTeacher(params.id);
  if (!teacher) return { title: "Teacher not found" };

  const subjectList = teacher.subjects?.join(", ") || "tuition";
  const title = `${teacher.name} — ${subjectList}${teacher.city ? ` in ${teacher.city}` : ""}`;
  const description =
    teacher.bio?.slice(0, 155) ||
    `${teacher.name} teaches ${subjectList}${teacher.city ? ` in ${teacher.city}` : ""} on TeacherCircle. ${
      teacher.review_count > 0 ? `Rated ${teacher.avg_rating} from ${teacher.review_count} reviews.` : "Connect directly to get started."
    }`;
  const url = `${getAppBaseUrl()}/teacher/${teacher.user_id}`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: "profile" },
    twitter: { card: "summary", title, description },
  };
}

function timeAgo(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days < 1) return "today";
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`;
  const years = Math.floor(months / 12);
  return `${years} year${years === 1 ? "" : "s"} ago`;
}

export default async function TeacherPublicPage({ params }: { params: { id: string } }) {
  const teacher = await getTeacher(params.id);

  if (!teacher) {
    return <p>This profile isn&apos;t listed (it may have been paused or removed).</p>;
  }

  // Structured data for search engines (schema.org Person + optional
  // AggregateRating) — helps a listing show up as a rich result rather than
  // a bare blue link. No PII beyond what's already public on this page.
  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: teacher.name,
    description: teacher.bio ?? undefined,
    knowsAbout: teacher.subjects,
    address: teacher.city ? { "@type": "PostalAddress", addressLocality: teacher.city } : undefined,
    image: teacher.avatar_url ?? undefined,
    url: `${getAppBaseUrl()}/teacher/${teacher.user_id}`,
  };
  if (teacher.review_count > 0) {
    jsonLd.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: teacher.avg_rating,
      reviewCount: teacher.review_count,
    };
  }

  const reviews: Review[] =
    (await pg(`/review?teacher_id=eq.${params.id}&select=rating,comment,created_at&order=created_at.desc`)) ?? [];

  const user = await getSessionUser().catch(() => null);

  return (
    <div>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="card row" style={{ alignItems: "flex-start", gap: 16 }}>
        <Avatar avatarUrl={teacher.avatar_url} avatarSeed={teacher.avatar_seed} label={teacher.name} size="lg" />
        <div>
          <h1 style={{ margin: 0 }}>
            {teacher.name} {teacher.is_subscribed && <span className="badge">Featured</span>}
          </h1>
          <p className="hint" style={{ margin: "4px 0" }}>
            {teacher.city ?? "—"}
            {teacher.rate_per_hour ? ` · ₹${teacher.rate_per_hour}/hr` : ""}
            {teacher.experience_years ? ` · ${teacher.experience_years} yrs experience` : ""}
          </p>
          <div className="pills">
            {teacher.subjects?.map((s: string) => (
              <span key={s} className="pill">{s}</span>
            ))}
          </div>
          <p className="stars" style={{ margin: "8px 0 0" }}>
            {teacher.review_count > 0 ? `★ ${teacher.avg_rating} (${teacher.review_count} feedback)` : "No feedback yet"}
          </p>
          {teacher.self_attested_at && (
            <p className="hint" style={{ margin: "6px 0 0", fontSize: 13 }} title="Self-declared by the teacher, not a background or identity check">
              ✓ Self-confirmed profile
            </p>
          )}
          {responseTimeLabel(teacher.avg_response_hours, teacher.replied_conversation_count) && (
            <p className="hint" style={{ margin: "2px 0 0", fontSize: 13 }}>
              {responseTimeLabel(teacher.avg_response_hours, teacher.replied_conversation_count)}
            </p>
          )}
        </div>
      </div>

      {teacher.bio && <p style={{ marginTop: 16 }}>{teacher.bio}</p>}

      <ConnectAndReview
        teacherId={teacher.user_id}
        signedIn={Boolean(user)}
        role={user?.role ?? null}
        userId={user?.id ?? null}
      />

      <h2>Feedback from students &amp; parents</h2>
      {reviews.length === 0 && (
        <p className="hint">No feedback yet — be the first to connect and share yours.</p>
      )}
      {reviews.map((r, i) => (
        <div key={i} className="review">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <span className="stars">{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</span>
            <span className="hint" style={{ fontSize: 12 }}>{timeAgo(r.created_at)}</span>
          </div>
          {r.comment && <p style={{ margin: "4px 0 0" }}>{r.comment}</p>}
        </div>
      ))}
    </div>
  );
}
