"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function FavoriteButton({ teacherId, initiallySaved }: { teacherId: string; initiallySaved: boolean }) {
  const router = useRouter();
  const [saved, setSaved] = useState(initiallySaved);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    try {
      if (saved) {
        await fetch(`/api/favorites/${teacherId}`, { method: "DELETE" });
      } else {
        await fetch("/api/favorites", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ teacherId }),
        });
      }
      setSaved(!saved);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button type="button" className="secondary" onClick={toggle} disabled={busy}>
      {saved ? "★ Saved" : "☆ Save"}
    </button>
  );
}
