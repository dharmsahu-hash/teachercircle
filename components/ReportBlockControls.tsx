"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ReportBlockControls({
  conversationId,
  otherUserId,
  otherLabel,
}: {
  conversationId: string;
  otherUserId: string;
  otherLabel: string;
}) {
  const router = useRouter();
  const [showReport, setShowReport] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reported, setReported] = useState(false);

  async function submitReport(e: React.FormEvent) {
    e.preventDefault();
    if (!reason.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/conversations/${conversationId}/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not submit report");
      setReported(true);
      setShowReport(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function block() {
    if (!confirm(`Block ${otherLabel}? You'll no longer be able to message each other.`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/blocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: otherUserId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not block user");
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="report-block-row">
      {reported ? (
        <span className="hint">Report submitted — thank you.</span>
      ) : showReport ? (
        <form onSubmit={submitReport} className="row" style={{ maxWidth: "none" }}>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="What's the issue?"
            style={{ flex: 1 }}
            autoFocus
          />
          <button type="submit" disabled={busy || !reason.trim()}>Submit</button>
          <button type="button" className="secondary" onClick={() => setShowReport(false)}>Cancel</button>
        </form>
      ) : (
        <div className="row">
          <button type="button" className="secondary" onClick={() => setShowReport(true)}>
            Report
          </button>
          <button type="button" className="danger" onClick={block} disabled={busy}>
            Block
          </button>
        </div>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
