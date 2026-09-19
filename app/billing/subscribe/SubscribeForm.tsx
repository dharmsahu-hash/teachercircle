"use client";

import { useState } from "react";

type SubscribeResponse = {
  transactionId: string;
  upiDeepLink: string;
  qrImageUrl: string;
  amount: number;
  currency: string;
};

export default function SubscribeForm() {
  const [data, setData] = useState<SubscribeResponse | null>(null);
  const [utr, setUtr] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/subscribe", { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      setData(body);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function submitUtr(e: React.FormEvent) {
    e.preventDefault();
    if (!data) return;
    setError(null);
    try {
      const res = await fetch("/api/billing/submit-reference", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactionId: data.transactionId, utr }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      setSubmitted(true);
    } catch (err: any) {
      setError(err.message);
    }
  }

  if (!data) {
    return (
      <button onClick={start} disabled={busy}>
        {busy ? "Generating…" : "Subscribe — generate UPI QR"}
      </button>
    );
  }

  return (
    <div className="card">
      <p>
        Pay <b>{data.currency} {data.amount}</b> to the UPI ID configured in <code>.env</code>{" "}
        (<code>UPI_PAYEE_VPA</code>) — scan with any UPI app (Google Pay, PhonePe, BHIM…), or tap
        the link on a phone:
      </p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={data.qrImageUrl} alt="UPI payment QR code" width={220} height={220} />
      <p><a href={data.upiDeepLink}>{data.upiDeepLink}</a></p>

      {!submitted ? (
        <form onSubmit={submitUtr}>
          <label>UPI transaction reference (UTR) after paying</label>
          <input value={utr} onChange={(e) => setUtr(e.target.value)} required />
          <button type="submit">Submit for approval</button>
        </form>
      ) : (
        <p className="badge">Submitted — waiting on admin approval.</p>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
