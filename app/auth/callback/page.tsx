"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, "");
    const params = new URLSearchParams(hash);
    const access_token = params.get("access_token");
    const refresh_token = params.get("refresh_token");
    const expires_in = params.get("expires_in");
    const err = params.get("error_description");

    if (err) {
      setError(err);
      return;
    }
    if (!access_token) {
      setError("No token returned from Google — check GOOGLE_CLIENT_ID/SECRET and the redirect URI.");
      return;
    }

    fetch("/api/auth/set-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ access_token, refresh_token, expires_in }),
    }).then((res) => {
      if (res.ok) {
        router.replace("/");
        router.refresh();
      } else {
        setError("Could not complete sign-in.");
      }
    });
  }, [router]);

  return <p>{error ?? "Signing you in…"}</p>;
}
