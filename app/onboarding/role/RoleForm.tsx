"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const ROLES = [
  { value: "student", label: "I'm a student", desc: "Looking for a teacher myself" },
  { value: "parent", label: "I'm a parent", desc: "Looking for a teacher for my child" },
  { value: "teacher", label: "I'm a teacher", desc: "I want to list my profile" },
];

export default function RoleForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function choose(role: string) {
    setBusy(true);
    setError(null);
    try {
      let ref: string | null = null;
      try {
        ref = localStorage.getItem("tc_ref");
      } catch {
        // Ignore — no referral to apply is a normal case, not an error.
      }
      const res = await fetch("/api/auth/role", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, ref }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      try {
        localStorage.removeItem("tc_ref");
      } catch {
        // Not critical — worst case a stale ref is retried on a future
        // signup, and set_referred_by() rejects it harmlessly once already set.
      }
      router.replace(role === "teacher" ? "/teacher/profile" : "/search");
      router.refresh();
    } catch (err: any) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div>
      {ROLES.map((r) => (
        <div key={r.value} className="card row" style={{ justifyContent: "space-between" }}>
          <div>
            <b>{r.label}</b>
            <p className="hint" style={{ margin: 0 }}>{r.desc}</p>
          </div>
          <button disabled={busy} onClick={() => choose(r.value)}>Choose</button>
        </div>
      ))}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
