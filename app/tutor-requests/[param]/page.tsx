import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { getSessionUser } from "@/lib/auth";
import { pg } from "@/lib/db";
import { getDirectory } from "@/lib/directory";
import { MODE_LABELS } from "@/lib/levels";
import { slugify } from "@/lib/slug";
import { daysLeft, formatRequestDate, requestIdFromParam, requestPath, requestSummary, requestTitle } from "@/lib/tutorRequest";
import { getOpenRequest } from "@/lib/tutorRequestData";
import { getAppBaseUrl } from "@/lib/url";
import RequestActions from "./RequestActions";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: { param: string } }): Promise<Metadata> {
  const id = requestIdFromParam(params.param);
  const { request } = id ? await getOpenRequest(id) : { request: null };
  if (!request) return { title: "Request not found", robots: { index: false } };
  const title = requestTitle(request);
  const description = requestSummary(request);
  const url = `${getAppBaseUrl()}${requestPath(request)}`;
  return { title, description, alternates: { canonical: url }, openGraph: { title, description, url, type: "article" } };
}

export default async function TutorRequestPage({ params }: { params: { param: string } }) {
  const id = requestIdFromParam(params.param);
  if (!id) notFound();
  const { request, available } = await getOpenRequest(id);
  if (!available) {
    return (
      <div className="card">
        <p style={{ margin: 0 }}>Tutor requests are being set up and will be available shortly.</p>
      </div>
    );
  }
  if (!request) notFound();

  // A stale or hand-typed slug resolves, then moves to the canonical URL.
  const canonical = requestPath(request);
  if (`/tutor-requests/${params.param}` !== canonical) redirect(canonical);

  const user = await getSessionUser().catch(() => null);
  const replies = Number(request.response_count ?? 0);

  // Who is looking? RLS answers it: the table only returns a row to its
  // owner (and admins); a teacher's own response row is visible to them.
  let isOwner = false;
  let myConversationId: string | null = null;
  if (user && user.role !== "admin") {
    const own = await pg(`/tutor_request?id=eq.${request.id}&select=id`, { token: user.token }).catch(() => []);
    isOwner = Boolean(own?.[0]);
    if (user.role === "teacher") {
      const mine = await pg(`/tutor_request_response?request_id=eq.${request.id}&select=conversation_id`, {
        token: user.token,
      }).catch(() => []);
      myConversationId = mine?.[0]?.conversation_id ?? null;
    }
  }

  // Link into the directory when teachers are already listed for this need.
  const { pairs, onlineSubjects } = await getDirectory();
  const subjectSlug = slugify(request.subject);
  const citySlug = request.city ? slugify(request.city) : "";
  const directoryLinks: { href: string; label: string }[] = [];
  if (citySlug && pairs.has(`${citySlug}/${subjectSlug}`)) {
    directoryLinks.push({ href: `/tutors/${citySlug}/${subjectSlug}`, label: `${request.subject} teachers in ${request.city}` });
  }
  if (request.mode !== "home" && onlineSubjects.has(subjectSlug)) {
    directoryLinks.push({ href: `/tutors/online/${subjectSlug}`, label: `Online ${request.subject} teachers` });
  }

  return (
    <div style={{ maxWidth: 720 }}>
      <p className="hint" style={{ marginBottom: 4 }}>
        <Link href="/tutor-requests">← All tutor requests</Link>
      </p>
      <h1>{requestTitle(request)}</h1>
      <p className="hint" style={{ marginTop: 0 }}>
        Posted {formatRequestDate(request.created_at)} · open for {daysLeft(request.expires_at)} more days
        {replies > 0 ? ` · ${replies} ${replies === 1 ? "teacher has" : "teachers have"} replied` : ""}
      </p>

      <dl className="teacher-facts">
        <dt>Wants</dt>
        <dd>{MODE_LABELS[request.mode]}</dd>
        {request.city && (
          <>
            <dt>City</dt>
            <dd>{request.city}</dd>
          </>
        )}
      </dl>
      {request.details && <p className="request-lead">{request.details}</p>}

      <div className="card">
        {user?.role === "admin" ? (
          <RequestActions requestId={request.id} kind="remove" />
        ) : isOwner ? (
          <>
            <p style={{ marginTop: 0 }}>
              This is your request. Teachers who reply appear in your <Link href="/messages">messages</Link>.
            </p>
            <RequestActions requestId={request.id} kind="close" />
          </>
        ) : user?.role === "teacher" ? (
          <>
            <p style={{ marginTop: 0 }}>Can you help? Reply to start a conversation with this family. Free for teachers.</p>
            <RequestActions requestId={request.id} kind="respond" existingConversationId={myConversationId} />
          </>
        ) : user ? (
          <p style={{ margin: 0 }}>
            Need a tutor too? <Link href="/tutor-requests/new">Post your own request</Link>.
          </p>
        ) : (
          <>
            <p style={{ marginTop: 0 }}>Are you a teacher? Sign in to reply to this family. Listing and replying are free.</p>
            <Link href="/login" className="btn">
              Sign in as a teacher
            </Link>
          </>
        )}
      </div>

      {directoryLinks.length > 0 && (
        <>
          <h2>Teachers already listed</h2>
          <div className="pills">
            {directoryLinks.map((l) => (
              <Link key={l.href} href={l.href} className="pill pill-link">
                {l.label}
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
