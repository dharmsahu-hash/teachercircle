"use client";

import { useEffect, useState } from "react";
import { currentSubscription, disablePush, enablePush, pushSupport, type PushSupport } from "@/lib/pushClient";

type Prefs = { emailDigest: boolean; pushRequests: boolean; pushMessages: boolean; pushQuiz: boolean; devices: number };

// Account page card: alerts on this device + what to be told about.
export default function NotificationSettings({ role, vapidPublicKey }: { role: string | null; vapidPublicKey: string | null }) {
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [available, setAvailable] = useState(true);
  const [support, setSupport] = useState<PushSupport>("unsupported");
  const [thisDevice, setThisDevice] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    setSupport(pushSupport());
    currentSubscription().then((s) => setThisDevice(!!s)).catch(() => undefined);
    fetch("/api/notifications/prefs")
      .then((r) => r.json())
      .then((d) => {
        if (d.available === false) setAvailable(false);
        else if (d.prefs) setPrefs(d.prefs);
      })
      .catch(() => setAvailable(false));
  }, []);

  async function save(next: Prefs) {
    setPrefs(next);
    const res = await fetch("/api/notifications/prefs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emailDigest: next.emailDigest, pushRequests: next.pushRequests, pushMessages: next.pushMessages, pushQuiz: next.pushQuiz }),
    });
    setMsg(res.ok ? "Saved." : "Could not save. Please try again.");
  }

  async function toggleDevice() {
    setBusy(true);
    setMsg(null);
    try {
      if (thisDevice) {
        await disablePush();
        setThisDevice(false);
        setMsg("Alerts are off on this device.");
      } else if (vapidPublicKey) {
        const err = await enablePush(vapidPublicKey);
        if (err) setMsg(err);
        else {
          setThisDevice(true);
          setSupport(pushSupport());
          setMsg("Alerts are on for this device.");
        }
      }
    } catch {
      setMsg("Something went wrong turning alerts on. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!available) return null;
  const isTeacher = role === "teacher";

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Alerts</h2>
      {!vapidPublicKey ? (
        <p className="hint">Phone and browser alerts are not switched on yet.</p>
      ) : support === "unsupported" ? (
        <p className="hint">This browser can&apos;t show alerts. Try Chrome, Edge or Firefox.</p>
      ) : support === "ios-install" ? (
        <p className="hint">On iPhone, tap Share, then &quot;Add to Home Screen&quot;, open TeacherCircle from there and come back here to turn alerts on.</p>
      ) : support === "denied" ? (
        <p className="hint">Alerts are blocked for this site. Allow notifications in your browser&apos;s site settings, then reload.</p>
      ) : (
        <p>
          <button type="button" className="btn" disabled={busy} onClick={toggleDevice}>
            {thisDevice ? "Turn off alerts on this device" : "Turn on alerts on this device"}
          </button>
        </p>
      )}

      {prefs && (
        <>
          <p className="hint" style={{ marginBottom: 6 }}>Tell me about:</p>
          {isTeacher && (
            <label style={{ display: "block", margin: "6px 0" }}>
              <input type="checkbox" checked={prefs.pushRequests} onChange={(e) => save({ ...prefs, pushRequests: e.target.checked })} /> New student requests that match me
            </label>
          )}
          <label style={{ display: "block", margin: "6px 0" }}>
            <input type="checkbox" checked={prefs.pushMessages} onChange={(e) => save({ ...prefs, pushMessages: e.target.checked })} /> New messages
          </label>
          <label style={{ display: "block", margin: "6px 0" }}>
            <input type="checkbox" checked={prefs.pushQuiz} onChange={(e) => save({ ...prefs, pushQuiz: e.target.checked })} /> Daily quiz streak reminders
          </label>
          {isTeacher && (
            <label style={{ display: "block", margin: "6px 0" }}>
              <input type="checkbox" checked={prefs.emailDigest} onChange={(e) => save({ ...prefs, emailDigest: e.target.checked })} /> Email me when new matching requests arrive (at most once a day, never on quiet days)
            </label>
          )}
        </>
      )}
      {msg && <p className="hint" role="status">{msg}</p>}
    </div>
  );
}
