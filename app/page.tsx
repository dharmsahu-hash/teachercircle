import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { pg } from "@/lib/db";

// Every page in this app reflects live DB/session state — there is no
// benefit to static generation here, and forcing dynamic rendering also
// means `next build` never tries to hit Postgres/PostgREST at build time.
export const dynamic = "force-dynamic";

const FEATURES = [
  { icon: "🔎", title: "Search by subject & city", text: "Filter to exactly the teacher you need, no sign-up required to browse." },
  { icon: "🤝", title: "Connect directly", text: "No agency in between — reach out and talk to the teacher yourself." },
  { icon: "⭐", title: "Real feedback", text: "Ratings and comments from students & parents who actually connected." },
];

export default async function HomePage() {
  const user = await getSessionUser().catch(() => null);
  if (user && user.role === null) redirect("/onboarding/role");

  const listings: { city: string | null }[] =
    (await pg(`/teacher_public?select=city`).catch(() => [])) ?? [];
  const teacherCount = listings.length;
  const cityCount = new Set(listings.map((l) => l.city).filter(Boolean)).size;

  return (
    <div>
      <div className="hero">
        <h1>Find a teacher nearby. Connect directly.</h1>
        <p className="hint">
          Students and parents search by subject and city, read real feedback, and reach
          out directly — no agency in between. Teachers list for free.
        </p>
        <div className="row">
          <Link href="/search" className="btn">Search teachers</Link>
          {!user && <Link href="/login" className="btn secondary">Sign up</Link>}
        </div>
      </div>

      {teacherCount > 0 && (
        <div className="stats-strip">
          <div>
            <div className="stat-value">{teacherCount}+</div>
            <div className="stat-label">Teachers listed</div>
          </div>
          <div>
            <div className="stat-value">{cityCount}+</div>
            <div className="stat-label">Cities covered</div>
          </div>
          <div>
            <div className="stat-value">Free</div>
            <div className="stat-label">Always, for teachers</div>
          </div>
        </div>
      )}

      <div className="features">
        {FEATURES.map((f) => (
          <div key={f.title} className="feature-card">
            <div className="feature-icon">{f.icon}</div>
            <h3>{f.title}</h3>
            <p>{f.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
