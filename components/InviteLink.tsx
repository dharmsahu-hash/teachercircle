"use client";

import { useState } from "react";

export default function InviteLink({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API can be blocked (permissions, non-HTTPS); the link
      // text is still selectable/copyable by hand, so this isn't fatal.
    }
  }

  return (
    <div className="row" style={{ gap: 8 }}>
      <input readOnly value={link} onFocus={(e) => e.target.select()} style={{ flex: 1 }} />
      <button type="button" className="secondary" onClick={copy}>
        {copied ? "Copied!" : "Copy link"}
      </button>
    </div>
  );
}
