"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ResolveButton({ reportId }: { reportId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function resolve() {
    setBusy(true);
    try {
      await fetch(`/api/admin/reports/${reportId}/resolve`, { method: "POST" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button className="secondary" onClick={resolve} disabled={busy}>
      {busy ? "…" : "Mark resolved"}
    </button>
  );
}
