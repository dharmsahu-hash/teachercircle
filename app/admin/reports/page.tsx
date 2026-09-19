import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { pg } from "@/lib/db";
import ResolveButton from "./ResolveButton";

export const dynamic = "force-dynamic";

export default async function AdminReportsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/");

  const reports =
    (await pg(`/message_report?resolved_at=is.null&select=*&order=created_at.asc`, {
      token: user.token,
    })) ?? [];

  const enriched = await Promise.all(
    reports.map(async (r: any) => {
      const [reporterRows, convoRows] = await Promise.all([
        pg(`/users?id=eq.${r.reporter_id}&select=email`, { token: user.token }),
        pg(`/conversation?id=eq.${r.conversation_id}&select=teacher_id,requester_id`, { token: user.token }),
      ]);
      const convo = convoRows?.[0];
      let teacherEmail = "unknown";
      let requesterEmail = "unknown";
      if (convo) {
        const [teacherRows, requesterRows] = await Promise.all([
          pg(`/users?id=eq.${convo.teacher_id}&select=email`, { token: user.token }),
          pg(`/users?id=eq.${convo.requester_id}&select=email`, { token: user.token }),
        ]);
        teacherEmail = teacherRows?.[0]?.email ?? "unknown";
        requesterEmail = requesterRows?.[0]?.email ?? "unknown";
      }
      const messages =
        (await pg(
          `/message?conversation_id=eq.${r.conversation_id}&select=body,sender_id,created_at&order=created_at.asc&limit=20`,
          { token: user.token }
        )) ?? [];
      return {
        ...r,
        teacher_id: convo?.teacher_id ?? null,
        requester_id: convo?.requester_id ?? null,
        reporterEmail: reporterRows?.[0]?.email ?? "unknown",
        teacherEmail,
        requesterEmail,
        messages,
      };
    })
  );

  return (
    <div>
      <h1>Message reports</h1>
      <p className="hint">Unresolved reports, oldest first.</p>
      {enriched.length === 0 && <p className="hint">Nothing pending.</p>}
      {enriched.map((r) => (
        <div key={r.id} className="card">
          <p>
            <b>Reported by:</b> {r.reporterEmail}
            <br />
            <b>Conversation:</b> {r.teacherEmail} &harr; {r.requesterEmail}
            <br />
            <b>Reason:</b> {r.reason}
            <br />
            <span className="hint">{new Date(r.created_at).toLocaleString()}</span>
          </p>
          <div className="message-thread" style={{ maxHeight: 200 }}>
            {r.messages.map((m: any, i: number) => (
              <div key={i} className="message-bubble message-theirs">
                <p style={{ margin: 0 }}>{m.body}</p>
                <span className="hint" style={{ fontSize: 11 }}>
                  {m.sender_id === r.teacher_id ? r.teacherEmail : r.requesterEmail} —{" "}
                  {new Date(m.created_at).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 10 }}>
            <ResolveButton reportId={r.id} />
          </div>
        </div>
      ))}
    </div>
  );
}
