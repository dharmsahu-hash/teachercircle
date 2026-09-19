"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function UnblockButton({ otherUserId, otherLabel }: { otherUserId: string; otherLabel: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function unblock() {
    if (!confirm(`Unblock ${otherLabel}? You'll be able to message each other again.`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/blocks/${otherUserId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not unblock user");
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="report-block-row">
      <button type="button" className="secondary" onClick={unblock} disabled={busy}>
        Unblock
      </button>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
