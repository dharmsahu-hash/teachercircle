import Link from "next/link";
import type { Metadata } from "next";
import RequestCard from "@/components/RequestCard";
import { getSessionUser } from "@/lib/auth";
import { listMyRequests, listOpenRequests } from "@/lib/tutorRequestData";
import { getAppBaseUrl } from "@/lib/url";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Tutor requests — families looking for a teacher",
  description:
    "Families across India post what kind of tutor they need: subject, city, class and board. Teachers can reply directly on TeacherCircle, free.",
  alternates: { canonical: `${getAppBaseUrl()}/tutor-requests` },
};

export default async function TutorRequestsPage({ searchParams }: { searchParams: { city?: string; subject?: string } }) {
  const city = searchParams.city?.trim() ?? "";
  const subject = searchParams.subject?.trim() ?? "";
  const [{ rows, available }, user] = await Promise.all([
    listOpenRequests({ city, subject }),
    getSessionUser().catch(() => null),
  ]);
  const mine = user && (user.role === "student" || user.role === "parent") ? await listMyRequests(user.token) : [];

  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1>Tutor requests</h1>
          <p className="hint">Families looking for a teacher. Teachers: reply to any request, free.</p>
        </div>
        <Link href="/tutor-requests/new" className="btn">Post a request</Link>
      </div>

      {!available ? (
        <div className="card"><p style={{ margin: 0 }}>Tutor requests are being set up and will be available shortly.</p></div>
      ) : (
        <>
          {mine.length > 0 && (
            <>
              <h2>Your requests</h2>
              {mine.map((r) => <RequestCard key={r.id} request={r} status={r.status} />)}
            </>
          )}

          <h2>Open requests</h2>
          <form method="get" className="search-bar" style={{ marginBottom: 16 }}>
            <div className="search-field"><input name="subject" placeholder="Subject" defaultValue={subject} /></div>
            <div className="search-field"><input name="city" placeholder="City" defaultValue={city} /></div>
            <button type="submit" className="secondary">Filter</button>
          </form>
          {rows.length === 0 ? (
            <div className="card">
              <p style={{ margin: 0 }}>
                {city || subject ? "No open requests match." : "No open requests right now."}{" "}
                <Link href="/tutor-requests/new">Post one</Link> and teachers can reply.
              </p>
            </div>
          ) : (
            rows.map((r) => <RequestCard key={r.id} request={r} />)
          )}
        </>
      )}
    </div>
  );
}
