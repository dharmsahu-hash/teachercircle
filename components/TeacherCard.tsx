import Link from "next/link";
import Avatar from "./Avatar";
import { responseTimeLabel } from "@/lib/responseTime";
import type { DirectoryTeacher } from "@/lib/directory";

// Extracted from app/search/page.tsx so the new G1 city/subject landing
// pages (docs/07-growth-review-2026-09-20.md) render an identical card
// instead of a second hand-copied version drifting from the original.
export default function TeacherCard({ teacher: t }: { teacher: DirectoryTeacher }) {
  return (
    <Link href={`/teacher/${t.user_id}`} className="teacher-card card">
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
  );
}
