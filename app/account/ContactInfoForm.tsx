"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { isValidFullName, isValidPhone } from "@/lib/contact";

export default function ContactInfoForm({
  initialFullName,
  initialPhone,
}: {
  initialFullName: string | null;
  initialPhone: string | null;
}) {
  const router = useRouter();
  const [fullName, setFullName] = useState(initialFullName ?? "");
  const [phone, setPhone] = useState(initialPhone ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);

    if (!isValidFullName(fullName)) {
      setError("Please enter your name");
      return;
    }
    if (!isValidPhone(phone)) {
      setError("Please enter a valid phone number");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/account/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName, phone: phone || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not save");
      setSaved(true);
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <label>Full name</label>
      <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Your name" />
      <label>Phone (optional)</label>
      <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 90000 00000" />
      {error && <p className="error">{error}</p>}
      {saved && <p className="badge">Saved</p>}
      <button type="submit" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
    </form>
  );
}
