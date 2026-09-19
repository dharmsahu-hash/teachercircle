import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { pg } from "@/lib/db";
import Avatar from "@/components/Avatar";

export const dynamic = "force-dynamic";

type Teacher = {
  user_id: string;
  name: string;
  subjects: string[];
  city: string | null;
  rate_per_hour: number | null;
  avg_rating: number;
  review_count: number;
  is_subscribed: boolean;
  avatar_url: string | null;
  avatar_seed: string | null;
  self_attested_at: string | null;
};

export default async function FavoritesPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const favorites = await pg(`/favorite_teacher?user_id=eq.${user.id}&select=teacher_id&order=created_at.desc`, {
    token: user.token,
  });
  const teacherIds: string[] = (favorites ?? []).map((f: any) => f.teacher_id);

  let teachers: Teacher[] = [];
  if (teacherIds.length > 0) {
    const rows =
      (await pg(
        `/teacher_public?user_id=in.(${teacherIds.join(",")})&select=user_id,name,subjects,city,rate_per_hour,avg_rating,review_count,is_subscribed,avatar_url,avatar_seed,self_attested_at`,
        { token: user.token }
      )) ?? [];
    const byId = new Map(rows.map((t: Teacher) => [t.user_id, t]));
    teachers = teacherIds.map((id) => byId.get(id)).filter(Boolean) as Teacher[];
  }

  return (
    <div>
      <h1>Saved teachers</h1>
      <p className="hint" style={{ marginBottom: 20 }}>
        Teachers you've saved for later — click ☆ Save on any profile to add one here.
      </p>
      {teachers.length === 0 && (
        <p className="hint">
          Nothing saved yet. <Link href="/search">Find a teacher</Link> and save one to see it here.
        </p>
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
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
