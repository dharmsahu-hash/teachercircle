"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Preset = { seed: string; dataUri: string };

export default function AvatarPicker({ presets, currentSeed }: { presets: Preset[]; currentSeed: string | null }) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function choose(seed: string) {
    setPending(seed);
    setError(null);
    try {
      const res = await fetch("/api/account/avatar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seed }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Could not update avatar");
      }
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setPending(null);
    }
  }

  return (
    <div>
      <div className="avatar-grid">
        {presets.map((p) => (
          <button
            key={p.seed}
            type="button"
            className={`avatar-option${p.seed === currentSeed ? " avatar-option-selected" : ""}`}
            disabled={pending !== null}
            onClick={() => choose(p.seed)}
            aria-label={`Use ${p.seed} avatar`}
            aria-pressed={p.seed === currentSeed}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.dataUri} alt="" width={48} height={48} />
          </button>
        ))}
      </div>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
