"use client";

import { useState } from "react";
import { avatarDataUri } from "@/lib/avatar";

type Props = {
  avatarUrl?: string | null;
  avatarSeed?: string | null;
  label: string;
  size?: "sm" | "lg";
};

// Single place that decides what image (if any) represents a user, reused by
// the header, search results, and teacher/account pages so the precedence
// rule lives in one spot: an explicitly chosen free avatar wins over an
// auto-imported one (e.g. a Google photo), which wins over plain initials.
// A client component (not just presentational) because a Google photo URL
// can rot — found for real running this against Dharmendra's own account:
// the `lh3.googleusercontent.com` URL still loads the <img> tag but returns
// naturalWidth/Height 0, i.e. a broken image with no server-visible error to
// catch — only `onError` on the client sees that and can fall back cleanly.
export default function Avatar({ avatarUrl, avatarSeed, label, size = "sm" }: Props) {
  const [imgFailed, setImgFailed] = useState(false);
  const className = `avatar${size === "lg" ? " avatar-lg" : ""}`;
  const px = size === "lg" ? 64 : 32;

  if (avatarSeed) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={avatarDataUri(avatarSeed, px)} alt="" className={className} width={px} height={px} />;
  }
  if (avatarUrl && !imgFailed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt=""
        className={className}
        width={px}
        height={px}
        onError={() => setImgFailed(true)}
      />
    );
  }
  return <span className={`${className} avatar-placeholder`}>{label[0]?.toUpperCase() ?? "?"}</span>;
}
