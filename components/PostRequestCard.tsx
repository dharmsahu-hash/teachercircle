import Link from "next/link";

// Shown on an empty search (growth #1): the person looking right now is
// exactly who should post a request, with their subject and city prefilled.
export default function PostRequestCard({ subject, city }: { subject?: string | null; city?: string | null }) {
  const params = new URLSearchParams();
  if (subject) params.set("subject", subject);
  if (city) params.set("city", city);
  const qs = params.toString();
  const what = [subject, "tutor"].filter(Boolean).join(" ");
  return (
    <div className="card invite-card">
      <h3 style={{ margin: "0 0 4px" }}>
        Need {what.startsWith("A") || what.startsWith("E") || what.startsWith("I") || what.startsWith("O") ? "an" : "a"} {what}
        {city ? ` in ${city}` : ""}?
      </h3>
      <p className="hint" style={{ margin: "0 0 14px" }}>
        Post a free request. Teachers who can help will reply to you directly. Your contact details stay private.
      </p>
      <Link href={`/tutor-requests/new${qs ? `?${qs}` : ""}`} className="btn">
        Post a tutor request
      </Link>
    </div>
  );
}
