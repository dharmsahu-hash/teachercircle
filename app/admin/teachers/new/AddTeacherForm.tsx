"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AddTeacherForm() {
  const router = useRouter();
  const [form, setForm] = useState({
    email: "",
    name: "",
    city: "",
    subjects: "",
    rate_per_hour: "",
    experience_years: "",
    contact_email: "",
    contact_phone: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/teachers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      router.push(`/admin/users/${data.userId}`);
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <label>Email</label>
      <input type="email" required value={form.email} onChange={(e) => set("email", e.target.value)} />

      <label>Name</label>
      <input required value={form.name} onChange={(e) => set("name", e.target.value)} />

      <label>Subjects (comma-separated)</label>
      <input value={form.subjects} onChange={(e) => set("subjects", e.target.value)} placeholder="Maths, Physics" />

      <label>City</label>
      <input value={form.city} onChange={(e) => set("city", e.target.value)} />

      <label>Hourly rate</label>
      <input type="number" value={form.rate_per_hour} onChange={(e) => set("rate_per_hour", e.target.value)} />

      <label>Years of experience</label>
      <input type="number" value={form.experience_years} onChange={(e) => set("experience_years", e.target.value)} />

      <label>Contact email (shown to students after connect — defaults to email above)</label>
      <input value={form.contact_email} onChange={(e) => set("contact_email", e.target.value)} />

      <label>Contact phone</label>
      <input value={form.contact_phone} onChange={(e) => set("contact_phone", e.target.value)} />

      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={busy}>{busy ? "Adding…" : "Add teacher"}</button>
    </form>
  );
}
