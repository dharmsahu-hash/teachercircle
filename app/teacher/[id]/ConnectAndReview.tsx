"use client";

import { useState } from "react";
import Link from "next/link";
import { containsAbusiveLanguage, ABUSIVE_LANGUAGE_ERROR } from "@/lib/profanity";
import MessageThread from "@/components/MessageThread";
import ReportBlockControls from "@/components/ReportBlockControls";

type Contact = { contact_email: string | null; contact_phone: string | null };

export default function ConnectAndReview({
  teacherId,
  signedIn,
  role,
  userId,
}: {
  teacherId: string;
  signedIn: boolean;
  role: string | null;
  userId: string | null;
}) {
  const [contact, setContact] = useState<Contact | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [reviewSaved, setReviewSaved] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);

  async function connect() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/connect/${teacherId}`, { method: "POST" });
      const data = await res.json();
      if (res.status === 402) {
        setError(
          `You've used your free connections for this month (${data.freeRemaining ?? 0} remaining). ` +
          `A subscription unlocks more — see /billing/subscribe.`
        );
        return;
      }
      if (!res.ok) throw new Error(data.error || "Could not connect");
      setContact(data.contact);
      // Best-effort — a message thread is a nice-to-have alongside the
      // contact reveal above, not something a failure here should block.
      fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teacherId }),
      })
        .then((r) => r.json())
        .then((d) => d.conversationId && setConversationId(d.conversationId))
        .catch(() => {});
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function submitReview(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    // Client-side pre-check for instant feedback; the API route enforces the
    // same rule server-side regardless (never trust the client alone).
    if (containsAbusiveLanguage(comment)) {
      setError(ABUSIVE_LANGUAGE_ERROR);
      return;
    }
    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teacherId, rating, comment }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setReviewSaved(true);
    } catch (err: any) {
      setError(err.message);
    }
  }

  if (!signedIn) {
    return (
      <p className="hint">
        <Link href="/login">Sign in</Link> to connect with this teacher and leave feedback.
      </p>
    );
  }

  if (role === "teacher") {
    return <p className="hint">Sign in as a student or parent to connect with teachers.</p>;
  }

  return (
    <div className="card">
      {!contact ? (
        <button onClick={connect} disabled={busy}>
          {busy ? "Connecting…" : "Connect — reveal contact info"}
        </button>
      ) : (
        <div>
          <b>Contact info:</b>
          <p>{contact.contact_email || "No email on file"}</p>
          <p>{contact.contact_phone || "No phone on file"}</p>
        </div>
      )}
      {error && <p className="error">{error}</p>}

      {contact && conversationId && userId && (
        <div style={{ marginTop: 16 }}>
          <h3 style={{ margin: "0 0 8px" }}>Message this teacher</h3>
          <MessageThread conversationId={conversationId} currentUserId={userId} />
          <div style={{ marginTop: 8 }}>
            <ReportBlockControls conversationId={conversationId} otherUserId={teacherId} otherLabel="this teacher" />
          </div>
        </div>
      )}

      {contact && !reviewSaved && (
        <form onSubmit={submitReview} style={{ marginTop: 16 }}>
          <label>Leave feedback for this teacher</label>
          <select value={rating} onChange={(e) => setRating(Number(e.target.value))}>
            {[5, 4, 3, 2, 1].map((n) => (
              <option key={n} value={n}>{n} star{n > 1 ? "s" : ""}</option>
            ))}
          </select>
          <label>Comment (optional) — keep it respectful, no abusive language</label>
          <textarea value={comment} onChange={(e) => setComment(e.target.value)} />
          <button type="submit">Submit feedback</button>
        </form>
      )}
      {reviewSaved && <p className="badge">Feedback saved — thank you!</p>}
    </div>
  );
}
