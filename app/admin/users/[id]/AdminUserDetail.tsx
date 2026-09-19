"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type TeacherProfile = {
  name?: string;
  bio?: string;
  city?: string;
  rate_per_hour?: number;
  is_listed?: boolean;
} | null;

export default function AdminUserDetail({
  targetUserId,
  role,
  deleted,
  teacherProfile,
}: {
  targetUserId: string;
  role: string | null;
  deleted: boolean;
  teacherProfile: TeacherProfile;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(teacherProfile?.name ?? "");
  const [city, setCity] = useState(teacherProfile?.city ?? "");
  const [bio, setBio] = useState(teacherProfile?.bio ?? "");
  const [rate, setRate] = useState(teacherProfile?.rate_per_hour ?? "");

  async function call(path: string, body?: unknown) {
    setError(null);
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || "Action failed");
      return false;
    }
    router.refresh();
    return true;
  }

  if (role === "teacher" && !teacherProfile) {
    return (
      <div className="card">
        <p className="hint">
          This teacher hasn&apos;t created a profile yet — FR-21 lets admin set one up on
          their behalf.
        </p>
        <label>Name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} />
        <label>City</label>
        <input value={city} onChange={(e) => setCity(e.target.value)} />
        <button onClick={() => call(`/api/admin/users/${targetUserId}/create-teacher`, { name, city })}>
          Create profile
        </button>
        {error && <p className="error">{error}</p>}
      </div>
    );
  }

  return (
    <div className="card">
      {role === "teacher" && teacherProfile && (
        <>
          <label>Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} />
          <label>City</label>
          <input value={city} onChange={(e) => setCity(e.target.value)} />
          <label>Bio</label>
          <textarea value={bio} onChange={(e) => setBio(e.target.value)} />
          <label>Hourly rate</label>
          <input type="number" value={rate} onChange={(e) => setRate(e.target.value)} />
          <button
            onClick={() =>
              call(`/api/admin/users/${targetUserId}/update`, {
                name,
                city,
                bio,
                rate_per_hour: rate ? Number(rate) : null,
              })
            }
          >
            Save changes
          </button>
        </>
      )}

      <div className="row" style={{ marginTop: 16 }}>
        {!deleted ? (
          <button className="danger" onClick={() => call(`/api/admin/users/${targetUserId}/delete`)}>
            Soft-delete this profile
          </button>
        ) : (
          <button onClick={() => call(`/api/admin/users/${targetUserId}/restore`)}>
            Restore this profile
          </button>
        )}
      </div>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
