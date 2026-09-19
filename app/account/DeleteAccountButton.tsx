"use client";

import { useRouter } from "next/navigation";

export default function DeleteAccountButton() {
  const router = useRouter();

  async function handleDelete() {
    if (!confirm("Delete your account? This cannot be undone from the UI.")) return;
    const res = await fetch("/api/account/delete", { method: "POST" });
    if (res.ok) {
      router.replace("/");
      router.refresh();
    }
  }

  return <button className="danger" onClick={handleDelete}>Delete my account</button>;
}
