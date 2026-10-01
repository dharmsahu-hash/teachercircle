"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BOARDS, CLASSES, EXAMS, MODE_LABELS, TEACHING_MODES, type TeachingMode } from "@/lib/levels";

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
  self_attested_at?: string | null;
  teaching_mode?: TeachingMode;
  classes?: string[];
  boards?: string[];
  exams?: string[];
} | null;

// Toggle chips for a fixed list (classes, boards, exams).
function ChipGroup({
  options,
  selected,
  onToggle,
  label,
}: {
  options: { value: string; label: string }[];
  selected: string[];
  onToggle: (value: string) => void;
  label: string;
}) {
  return (
    <div className="chip-group" role="group" aria-label={label}>
      {options.map((o) => {
        const on = selected.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            className={`chip${on ? " selected" : ""}`}
            aria-pressed={on}
            onClick={() => onToggle(o.value)}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

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
    self_attested: Boolean(initial?.self_attested_at),
    teaching_mode: (initial?.teaching_mode ?? "home") as TeachingMode,
    classes: initial?.classes ?? [],
    boards: initial?.boards ?? [],
    exams: initial?.exams ?? [],
  });
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(false);
  }

  function toggle(key: "classes" | "boards" | "exams", value: string) {
    const list = form[key];
    set(key, list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
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

        <label>How do you teach?</label>
        <div className="chip-group" role="radiogroup" aria-label="Teaching mode">
          {TEACHING_MODES.map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={form.teaching_mode === m}
              className={`chip${form.teaching_mode === m ? " selected" : ""}`}
              onClick={() => set("teaching_mode", m)}
            >
              {MODE_LABELS[m]}
            </button>
          ))}
        </div>
        <p className="hint" style={{ marginTop: 6 }}>
          Online teachers also appear on national pages like &quot;Online Maths tutors&quot;, not only in their city.
        </p>

        <label>Classes you teach</label>
        <ChipGroup
          label="Classes"
          options={CLASSES.map((c) => ({ value: c, label: c }))}
          selected={form.classes}
          onToggle={(v) => toggle("classes", v)}
        />

        <label>Boards</label>
        <ChipGroup
          label="Boards"
          options={BOARDS.map((b) => ({ value: b.code, label: b.label }))}
          selected={form.boards}
          onToggle={(v) => toggle("boards", v)}
        />

        <label>Exam preparation</label>
        <ChipGroup
          label="Exams"
          options={EXAMS.map((e) => ({ value: e.code, label: e.label }))}
          selected={form.exams}
          onToggle={(v) => toggle("exams", v)}
        />
        <p className="hint" style={{ marginTop: 6 }}>
          Optional. These help parents searching for, say, &quot;Class 10 Maths tutor&quot; or &quot;NEET Physics tutor&quot; find you.
        </p>

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

        <label className="row">
          <input
            type="checkbox"
            checked={form.self_attested}
            onChange={(e) => set("self_attested", e.target.checked)}
          />
          I confirm the information on this profile is accurate
        </label>
        <p className="hint" style={{ marginTop: -8 }}>
          This is a self-declaration, not a background or identity check — it just tells
          students and parents you've reviewed your own listing.
        </p>

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
