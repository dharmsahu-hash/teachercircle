"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function LoginForm() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmationSent, setConfirmationSent] = useState(false);
  // Shown after signup and when sign-in fails because the email is not
  // confirmed yet (GoTrue: "Email not confirmed").
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent">("idle");
  const [resendError, setResendError] = useState<string | null>(null);
  const needsConfirmation = Boolean(error && /not confirmed/i.test(error));

  async function resendConfirmation() {
    setResendError(null);
    setResendState("sending");
    try {
      const res = await fetch("/api/auth/resend-confirmation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not send the email");
      setResendState("sent");
    } catch (err: any) {
      setResendError(err.message);
      setResendState("idle");
    }
  }

  const resendBlock = (
    <div style={{ marginTop: 12 }}>
      {resendState === "sent" ? (
        <p className="hint">A new confirmation link is on its way to {email}. Check spam too.</p>
      ) : (
        <button type="button" className="secondary" disabled={resendState === "sending"} onClick={resendConfirmation}>
          {resendState === "sending" ? "Sending…" : "Resend confirmation email"}
        </button>
      )}
      {resendError && <p className="error">{resendError}</p>}
    </div>
  );

  // G5 referral (docs/07-growth-review-2026-09-20.md): a ?ref=<inviterId>
  // link lands here. Stashed in localStorage, not just read from the URL,
  // because production requires email confirmation — the user leaves this
  // page, clicks a link in their inbox, and lands back on a fresh page load
  // (see RoleForm.tsx, where it's actually applied once they have a session).
  useEffect(() => {
    try {
      const ref = new URLSearchParams(window.location.search).get("ref");
      if (ref) localStorage.setItem("tc_ref", ref);
    } catch {
      // Private browsing / blocked storage — the referral is just missed, no worse than not existing.
    }
  }, []);

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
    return (
      <div>
        <p className="hint">Check your email for a confirmation link, then come back and sign in.</p>
        {resendBlock}
      </div>
    );
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
      {needsConfirmation && email && resendBlock}

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
