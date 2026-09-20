// A plain <a> to wa.me — no client interactivity needed, so this can render
// straight from a server component. WhatsApp specifically (not a generic
// "share" API) because it's the dominant sharing channel in India, unlike
// most Western markets — this turns "I found a good tutor" into a real,
// trackable referral channel outside Google's algorithm entirely.
// utm_source/utm_medium let Analytics attribute traffic to shares
// specifically, once GA is configured.
export default function WhatsAppShare({ url, text }: { url: string; text: string }) {
  const shareUrl = `${url}${url.includes("?") ? "&" : "?"}utm_source=whatsapp&utm_medium=share`;
  const message = `${text} ${shareUrl}`;
  const href = `https://wa.me/?text=${encodeURIComponent(message)}`;

  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="secondary btn">
      Share on WhatsApp
    </a>
  );
}
