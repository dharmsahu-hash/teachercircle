"use client";

import { useEffect, useState } from "react";
import { daysBetween, isDateString, todayIST } from "@/lib/dailyQuiz";

const KEY = "tc_exam";

// A personal countdown: the student enters their own exam date (so it is never
// wrong about an official date) and sees the days left. Browser storage only,
// no server cost.
export default function ExamCountdown() {
  const [saved, setSaved] = useState<{ date: string; name: string } | null>(null);
  const [date, setDate] = useState("");
  const [name, setName] = useState("");
  const [editing, setEditing] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) ?? "null");
      if (raw && isDateString(raw.date)) setSaved({ date: raw.date, name: String(raw.name ?? "").slice(0, 40) });
    } catch {
      // ignore
    }
    setReady(true);
  }, []);

  function save() {
    if (!isDateString(date)) return;
    const value = { date, name: name.trim().slice(0, 40) };
    try {
      localStorage.setItem(KEY, JSON.stringify(value));
    } catch {
      // ignore
    }
    setSaved(value);
    setEditing(false);
  }
  function clear() {
    try {
      localStorage.removeItem(KEY);
    } catch {
      // ignore
    }
    setSaved(null);
    setDate("");
    setName("");
  }

  if (!ready) return <div className="card" aria-hidden="true" style={{ minHeight: 64 }} />;

  if (saved && !editing) {
    const left = daysBetween(todayIST(), saved.date);
    return (
      <div className="card exam-countdown">
        <div>
          <p className="streak-number" style={{ margin: 0 }}>
            {left > 0 ? left : left === 0 ? "Today" : "Done"}
            <span>{left > 0 ? ` day${left === 1 ? "" : "s"} to go` : left === 0 ? " is exam day. All the best!" : " — your exam has passed"}</span>
          </p>
          <p className="hint" style={{ margin: 0 }}>{saved.name || "Your exam"} · {new Date(`${saved.date}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}</p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button type="button" className="secondary" onClick={() => { setDate(saved.date); setName(saved.name); setEditing(true); }}>Change</button>
          <button type="button" className="secondary" onClick={clear}>Remove</button>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <b>Exam countdown</b>
      <p className="hint" style={{ margin: "2px 0 10px" }}>Add your exam date and see how many days are left. It stays on this device.</p>
      <div className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div style={{ flex: "1 1 160px" }}>
          <label htmlFor="exam-name">Exam (optional)</label>
          <input id="exam-name" value={name} maxLength={40} placeholder="e.g. Class 10 boards" onChange={(e) => setName(e.target.value)} />
        </div>
        <div style={{ flex: "0 1 170px" }}>
          <label htmlFor="exam-date">Date</label>
          <input id="exam-date" type="date" min={todayIST()} value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <button type="button" onClick={save} disabled={!isDateString(date)}>Start countdown</button>
      </div>
    </div>
  );
}
