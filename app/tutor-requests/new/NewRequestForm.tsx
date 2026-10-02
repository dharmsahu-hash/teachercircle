"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BOARDS, CLASSES, EXAMS, MODE_LABELS, TEACHING_MODES, type TeachingMode } from "@/lib/levels";

const POPULAR_SUBJECTS = ["Maths", "Physics", "Chemistry", "Biology", "English", "Computer Science"];

export default function NewRequestForm({ initialSubject, initialCity }: { initialSubject: string; initialCity: string }) {
  const router = useRouter();
  const [form, setForm] = useState({
    subject: initialSubject,
    mode: "home" as TeachingMode,
    city: initialCity,
    cls: "",
    board: "",
    exam: "",
    details: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/tutor-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not post your request");
      router.push(data.path);
      router.refresh();
    } catch (err: any) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <label htmlFor="subject">Subject</label>
      <input
        id="subject"
        list="popular-subjects"
        value={form.subject}
        onChange={(e) => set("subject", e.target.value)}
        placeholder="e.g. Maths"
        maxLength={50}
        required
      />
      <datalist id="popular-subjects">
        {POPULAR_SUBJECTS.map((s) => <option key={s} value={s} />)}
      </datalist>

      <label>How would you like to learn?</label>
      <div className="chip-group" role="radiogroup" aria-label="Teaching mode">
        {TEACHING_MODES.map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={form.mode === m}
            className={`chip${form.mode === m ? " selected" : ""}`}
            onClick={() => set("mode", m)}
          >
            {MODE_LABELS[m]}
          </button>
        ))}
      </div>

      <label htmlFor="city">City{form.mode === "online" ? " (optional)" : ""}</label>
      <input id="city" value={form.city} onChange={(e) => set("city", e.target.value)} placeholder="e.g. Indore" maxLength={80} required={form.mode !== "online"} />

      <label htmlFor="cls">Class (optional)</label>
      <select id="cls" value={form.cls} onChange={(e) => set("cls", e.target.value)}>
        <option value="">Any / not applicable</option>
        {CLASSES.map((c) => <option key={c} value={c}>Class {c}</option>)}
      </select>

      <label htmlFor="board">Board (optional)</label>
      <select id="board" value={form.board} onChange={(e) => set("board", e.target.value)}>
        <option value="">Any / not applicable</option>
        {BOARDS.map((b) => <option key={b.code} value={b.code}>{b.label}</option>)}
      </select>

      <label htmlFor="exam">Exam preparation (optional)</label>
      <select id="exam" value={form.exam} onChange={(e) => set("exam", e.target.value)}>
        <option value="">None</option>
        {EXAMS.map((x) => <option key={x.code} value={x.code}>{x.label}</option>)}
      </select>

      <label htmlFor="details">Anything else teachers should know (optional)</label>
      <textarea
        id="details"
        value={form.details}
        onChange={(e) => set("details", e.target.value)}
        maxLength={500}
        placeholder="e.g. Weak in algebra, 3 evenings a week, board exams in March."
      />
      <p className="hint" style={{ marginTop: -8 }}>
        {form.details.length}/500. This is public, so <b>don&apos;t include phone numbers, emails or links</b>.
        Teachers reply to you through TeacherCircle messages.
      </p>

      {error && <p className="error">{error}</p>}
      <div className="row">
        <button type="submit" disabled={busy}>{busy ? "Posting…" : "Post my request"}</button>
      </div>
    </form>
  );
}
