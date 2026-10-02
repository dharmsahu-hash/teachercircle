"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

// The buttons on a request page: a teacher replies, the poster closes, an
// admin removes. Each calls its own API route; the database re-checks who
// the caller is.
export default function RequestActions({
  requestId,
  kind,
  existingConversationId,
}: {
  requestId: string;
  kind: "respond" | "close" | "remove";
  existingConversationId?: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(path: string, then: (data: any) => void) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(path, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Something went wrong");
      then(data);
    } catch (err: any) {
      setError(err.message);
      setBusy(false);
    }
  }

  if (kind === "respond") {
    if (existingConversationId) {
      return (
        <Link href={`/messages/${existingConversationId}`} className="btn">
          You replied · Open conversation
        </Link>
      );
    }
    return (
      <div>
        <button
          disabled={busy}
          onClick={() => run(`/api/tutor-requests/${requestId}/respond`, (d) => router.push(`/messages/${d.conversationId}`))}
        >
          {busy ? "Opening…" : "I can teach this — reply"}
        </button>
        {error && <p className="error">{error}</p>}
      </div>
    );
  }

  const isRemove = kind === "remove";
  return (
    <div>
      <button
        className={isRemove ? "danger" : "secondary"}
        disabled={busy}
        onClick={() => {
          if (!confirm(isRemove ? "Remove this request from the site?" : "Close this request? It will no longer be public.")) return;
          run(isRemove ? `/api/admin/tutor-requests/${requestId}/remove` : `/api/tutor-requests/${requestId}/close`, () => {
            router.push("/tutor-requests");
            router.refresh();
          });
        }}
      >
        {busy ? "Working…" : isRemove ? "Remove request" : "Close request (I found a tutor)"}
      </button>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
