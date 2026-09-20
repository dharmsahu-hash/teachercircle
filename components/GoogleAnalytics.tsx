import Script from "next/script";

// Silently absent — not a broken feature — until NEXT_PUBLIC_GA_MEASUREMENT_ID
// is actually set. Same "provisioned, not wired until configured" pattern as
// Meilisearch/Redis/MinIO elsewhere in this repo: local dev and any
// deployment without the env var stays completely untracked, on purpose.
export default function GoogleAnalytics() {
  const measurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
  if (!measurementId) return null;

  return (
    <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`} strategy="afterInteractive" />
      <Script id="ga4-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${measurementId}');
        `}
      </Script>
    </>
  );
}
