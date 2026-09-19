"use client";

import { useRouter } from "next/navigation";

export default function ApproveButton({ transactionId }: { transactionId: string }) {
  const router = useRouter();

  async function approve() {
    const res = await fetch(`/api/admin/payments/${transactionId}/approve`, { method: "POST" });
    if (res.ok) {
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      alert(data.error || "Approve failed");
    }
  }

  return <button onClick={approve}>Approve</button>;
}
