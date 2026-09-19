"use client";

import { useEffect, useState } from "react";
import { containsAbusiveLanguage, ABUSIVE_LANGUAGE_ERROR } from "@/lib/profanity";

type Message = { id: string; sender_id: string; body: string; created_at: string };

export default function MessageThread({
  conversationId,
  currentUserId,
}: {
  conversationId: string;
  currentUserId: string;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/conversations/${conversationId}/messages`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setMessages(Array.isArray(data) ? data : []);
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmed = body.trim();
    if (!trimmed) return;
    // Client-side pre-check for instant feedback; the API route enforces
    // the same rule server-side regardless.
    if (containsAbusiveLanguage(trimmed)) {
      setError(ABUSIVE_LANGUAGE_ERROR);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not send message");
      setMessages((m) => [...m, data]);
      setBody("");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {loaded && messages.length === 0 && <p className="hint">No messages yet — say hello.</p>}
      <div className="message-thread">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`message-bubble ${m.sender_id === currentUserId ? "message-mine" : "message-theirs"}`}
          >
            <p style={{ margin: 0 }}>{m.body}</p>
            <span className="hint" style={{ fontSize: 11 }}>
              {new Date(m.created_at).toLocaleString()}
            </span>
          </div>
        ))}
      </div>
      <form onSubmit={send} style={{ marginTop: 12 }}>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write a message…"
        />
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={busy || !body.trim()}>
          {busy ? "Sending…" : "Send"}
        </button>
      </form>
    </div>
  );
}
