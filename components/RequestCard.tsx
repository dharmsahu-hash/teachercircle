import Link from "next/link";
import { MODE_LABELS } from "@/lib/levels";
import { daysLeft, requestPath, requestTitle, type TutorRequest } from "@/lib/tutorRequest";

// One "I need a tutor" post in a list. Never shows who posted it.
export default function RequestCard({ request: r, status }: { request: TutorRequest; status?: string }) {
  const replies = Number(r.response_count ?? 0);
  return (
    <Link href={requestPath(r)} className="card request-card">
      <div className="row" style={{ justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
        <b>{requestTitle(r)}</b>
        {status && status !== "open" && <span className="badge">{status === "closed" ? "Closed" : "Removed"}</span>}
      </div>
      {r.details && <p className="request-details">{r.details}</p>}
      <p className="hint" style={{ margin: "6px 0 0" }}>
        {MODE_LABELS[r.mode]}
        {status === undefined || status === "open" ? ` · ${daysLeft(r.expires_at)} days left` : ""}
        {replies > 0 ? ` · ${replies} ${replies === 1 ? "teacher has" : "teachers have"} replied` : ""}
      </p>
    </Link>
  );
}
