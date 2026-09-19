"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Profile = {
  name?: string;
  bio?: string;
  city?: string;
  pincode?: string;
  subjects?: string[];
  rate_per_hour?: number;
  experience_years?: number;
  contact_email?: string;
  contact_phone?: string;
  is_listed?: boolean;
} | null;

export default function TeacherProfileForm({ initial }: { initial: Profile }) {
  const router = useRouter();
  const [form, setForm] = useState({
    name: initial?.name ?? "",
    bio: initial?.bio ?? "",
    city: initial?.city ?? "",
    pincode: initial?.pincode ?? "",
    subjects: (initial?.subjects ?? []).join(", "),
    rate_per_hour: initial?.rate_per_hour ?? "",
    experience_years: initial?.experience_years ?? "",
    contact_email: initial?.contact_email ?? "",
    contact_phone: initial?.contact_phone ?? "",
    is_listed: initial?.is_listed ?? true,
  });
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(false);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/teacher/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSaved(true);
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function deleteAccount() {
    if (!confirm("Delete your account? This unlists your profile and cannot be undone from the UI.")) return;
    const res = await fetch("/api/account/delete", { method: "POST" });
    if (res.ok) {
      router.replace("/");
      router.refresh();
    }
  }

  return (
    <>
      <form onSubmit={save}>
        <label>Name</label>
        <input value={form.name} onChange={(e) => set("name", e.target.value)} required />

        <label>Subjects (comma-separated)</label>
        <input
          value={form.subjects}
          onChange={(e) => set("subjects", e.target.value)}
          placeholder="Maths, Physics, Chemistry"
        />

        <label>City</label>
        <input value={form.city} onChange={(e) => set("city", e.target.value)} />

        <label>Pincode</label>
        <input value={form.pincode} onChange={(e) => set("pincode", e.target.value)} />

        <label>Hourly rate</label>
        <input
          type="number"
          value={form.rate_per_hour}
          onChange={(e) => set("rate_per_hour", e.target.value)}
        />

        <label>Years of experience</label>
        <input
          type="number"
          value={form.experience_years}
          onChange={(e) => set("experience_years", e.target.value)}
        />

        <label>Bio</label>
        <textarea value={form.bio} onChange={(e) => set("bio", e.target.value)} />

        <label>Contact email (shown after someone connects)</label>
        <input value={form.contact_email} onChange={(e) => set("contact_email", e.target.value)} />

        <label>Contact phone (shown after someone connects)</label>
        <input value={form.contact_phone} onChange={(e) => set("contact_phone", e.target.value)} />

        <label className="row">
          <input
            type="checkbox"
            checked={form.is_listed}
            onChange={(e) => set("is_listed", e.target.checked)}
          />
          Visible in search
        </label>

        {error && <p className="error">{error}</p>}
        <div className="row">
          <button type="submit" disabled={busy}>{busy ? "Saving…" : "Save profile"}</button>
          {saved && <span className="badge">Saved</span>}
        </div>
      </form>

      <h2>Danger zone</h2>
      <button className="danger" onClick={deleteAccount}>Delete my account</button>
    </>
  );
}
