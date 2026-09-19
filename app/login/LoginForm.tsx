"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginForm() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmationSent, setConfirmationSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong");
      if (data.confirmationRequired) {
        setConfirmationSent(true);
        return;
      }
      router.replace("/");
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (confirmationSent) {
    return <p className="hint">Check your email for a confirmation link, then come back and sign in.</p>;
  }

  return (
    <form onSubmit={submit}>
      <label htmlFor="email">Email</label>
      <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />

      <label htmlFor="password">Password</label>
      <input
        id="password"
        type="password"
        required
        minLength={8}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      {mode === "signup" && (
        <p className="hint" style={{ marginTop: -8 }}>
          At least 8 characters, mixing in uppercase, lowercase, numbers, or symbols.
        </p>
      )}

      {error && <p className="error">{error}</p>}

      <div className="row">
        <button type="submit" disabled={busy}>
          {mode === "signup" ? "Create account" : "Sign in"}
        </button>
        <button
          type="button"
          className="secondary"
          onClick={() => setMode(mode === "signup" ? "login" : "signup")}
        >
          {mode === "signup" ? "I already have an account" : "New here? Sign up"}
        </button>
      </div>
    </form>
  );
}
