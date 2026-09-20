import { NextResponse } from "next/server";

// AdSense requires this exact file at the site root to confirm you're an
// authorized seller of ad space on this domain — without it, ad revenue can
// be paid to whoever else's ads.txt claims this domain instead of you.
// A dynamic route (matching the existing app/sitemap.ts / app/robots.ts
// pattern in this repo) instead of a static public/ads.txt file, so it
// always reflects NEXT_PUBLIC_ADSENSE_CLIENT_ID rather than needing to be
// hand-edited to match whatever that env var is set to.
export async function GET() {
  const clientId = process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID;
  if (!clientId) return new NextResponse("", { headers: { "Content-Type": "text/plain" } });

  const pubId = clientId.replace(/^ca-/, "");
  const body = `google.com, ${pubId}, DIRECT, f08c47fec0942fa0\n`;
  return new NextResponse(body, { headers: { "Content-Type": "text/plain" } });
}
