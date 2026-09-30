"use client";

import { useEffect } from "react";

// A ?ref= link has to be saved before the browser leaves for Google.
// Role selection reads tc_ref once a session exists.
export default function CaptureReferral() {
  useEffect(() => {
    try {
      const ref = new URLSearchParams(window.location.search).get("ref");
      if (ref) localStorage.setItem("tc_ref", ref);
    } catch {
      // Private browsing / blocked storage — the referral is just missed.
    }
  }, []);

  return null;
}
