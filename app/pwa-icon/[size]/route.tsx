import { ImageResponse } from "next/og";

// Edge runtime for the same reason as app/daily/og/route.tsx.
export const runtime = "edge";

// App icon for the manifest and notifications: /pwa-icon/192 or /pwa-icon/512.
export async function GET(_req: Request, { params }: { params: { size: string } }) {
  const size = params.size === "512" ? 512 : params.size === "192" ? 192 : 0;
  if (!size) return new Response("Not found", { status: 404 });
  const res = new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#0d6e61", color: "white", fontSize: size * 0.6, fontWeight: 800 }}>
        TC
      </div>
    ),
    { width: size, height: size }
  );
  res.headers.set("Cache-Control", "public, max-age=31536000, immutable");
  return res;
}
