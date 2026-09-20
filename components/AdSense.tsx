import Script from "next/script";

// Same pattern as GoogleAnalytics: absent (not broken) until
// NEXT_PUBLIC_ADSENSE_CLIENT_ID is set. This one script is also how Google
// verifies site ownership during AdSense review — no separate meta tag
// needed once this is live and the env var is set to your real
// ca-pub-XXXXXXXXXXXXXXXX client ID.
//
// Deliberately Auto Ads, not hand-placed ad units: Google's own placement
// algorithm picks where ads go and adapts over time, which is the
// lowest-maintenance, typically highest-yield setup for a small site with no
// existing ad-layout experience to draw on. Revisit with manual placements
// only if Auto Ads' choices turn out to hurt UX or conversion in practice.
export default function AdSense() {
  const clientId = process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID;
  if (!clientId) return null;

  return (
    <Script
      async
      src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${clientId}`}
      crossOrigin="anonymous"
      strategy="afterInteractive"
    />
  );
}
