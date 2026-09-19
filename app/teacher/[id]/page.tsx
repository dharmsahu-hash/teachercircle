import { pg } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import Avatar from "@/components/Avatar";
import ConnectAndReview from "./ConnectAndReview";

export const dynamic = "force-dynamic";

type Review = { rating: number; comment: string | null; created_at: string };

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
  const rows = await pg(
    `/teacher_public?user_id=eq.${params.id}&select=user_id,name,bio,subjects,city,rate_per_hour,experience_years,avg_rating,review_count,is_subscribed,avatar_url,avatar_seed`
  );
  const teacher = Array.isArray(rows) ? rows[0] : null;

  if (!teacher) {
    return <p>This profile isn&apos;t listed (it may have been paused or removed).</p>;
  }

  const reviews: Review[] =
    (await pg(`/review?teacher_id=eq.${params.id}&select=rating,comment,created_at&order=created_at.desc`)) ?? [];

  const user = await getSessionUser().catch(() => null);

  return (
    <div>
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
        </div>
      </div>

      {teacher.bio && <p style={{ marginTop: 16 }}>{teacher.bio}</p>}

      <ConnectAndReview
        teacherId={teacher.user_id}
        signedIn={Boolean(user)}
        role={user?.role ?? null}
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
