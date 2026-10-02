import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { pg } from "@/lib/db";
import { daysLeft, formatRequestDate, requestPath, requestTitle, type TutorRequest } from "@/lib/tutorRequest";
import { isMissingRelation } from "@/lib/tutorRequestData";
import RequestActions from "@/app/tutor-requests/[param]/RequestActions";

export const dynamic = "force-dynamic";

type Row = TutorRequest & { requester_id: string; status: string };

export default async function AdminRequestsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/");

  let rows: Row[] = [];
  let available = true;
  try {
    rows = ((await pg(
      "/tutor_request?status=eq.open&select=id,requester_id,subject,city,class,board,exam,mode,details,created_at,expires_at,status&order=created_at.desc&limit=100",
      { token: user.token }
    )) ?? []) as Row[];
  } catch (err) {
    if (!isMissingRelation(err)) throw err;
    available = false;
  }

  // Poster emails, so an admin can follow up on abuse (admins can read users).
  const ids = [...new Set(rows.map((r) => r.requester_id))];
  const emails = new Map<string, string>();
  if (ids.length > 0) {
    const users = (await pg(`/users?id=in.(${ids.join(",")})&select=id,email`, { token: user.token }).catch(() => [])) ?? [];
    for (const u of users) emails.set(u.id, u.email);
  }

  return (
    <div>
      <h1>Admin — tutor requests</h1>
      <p className="hint">Open requests, newest first. Removing one takes it off the site and is recorded in the audit log.</p>
      <div className="row" style={{ marginBottom: 16 }}>
        <Link href="/admin/users" className="btn secondary">Users</Link>
        <Link href="/admin/reports" className="btn secondary">Message reports</Link>
      </div>

      {!available && <div className="card"><p style={{ margin: 0 }}>Migration 0028 has not been applied yet.</p></div>}
      {available && rows.length === 0 && <div className="card"><p style={{ margin: 0 }}><b>No open requests.</b></p></div>}
      {rows.map((r) => (
        <div key={r.id} className="card">
          <p style={{ margin: 0 }}>
            <Link href={requestPath(r)}><b>{requestTitle(r)}</b></Link>
          </p>
          {r.details && <p style={{ margin: "6px 0 0" }}>{r.details}</p>}
          <p className="hint" style={{ margin: "6px 0 10px" }}>
            By {emails.get(r.requester_id) ?? "unknown"} · posted {formatRequestDate(r.created_at)} · {daysLeft(r.expires_at)} days left
          </p>
          <RequestActions requestId={r.id} kind="remove" />
        </div>
      ))}
    </div>
  );
}
