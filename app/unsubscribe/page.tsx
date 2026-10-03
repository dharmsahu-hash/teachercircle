import { verifyUnsubscribe } from "@/lib/jobSecret";

export const metadata = { title: "Stop digest emails", robots: { index: false, follow: false } };

// Opened from the "Stop these emails" link. Shows a button; only pressing it
// opts out (so link-scanning mail software can't do it by accident).
export default function UnsubscribePage({ searchParams }: { searchParams: { t?: string; status?: string } }) {
  const status = searchParams.status;
  if (status === "done") {
    return (
      <div className="card">
        <h1>You&apos;re unsubscribed</h1>
        <p>We won&apos;t send you the daily requests email any more. You can turn it back on from your account page.</p>
      </div>
    );
  }
  const valid = typeof searchParams.t === "string" && !!verifyUnsubscribe(searchParams.t);
  if (!valid || status === "invalid" || status === "error") {
    return (
      <div className="card">
        <h1>This link didn&apos;t work</h1>
        <p>{status === "error" ? "Something went wrong. Please try again later." : "It may be incomplete or out of date."} You can change email settings any time from your account page.</p>
      </div>
    );
  }
  return (
    <div className="card">
      <h1>Stop the requests email?</h1>
      <p>You will no longer get an email when new student requests match your subjects.</p>
      <form method="post" action="/api/notifications/unsubscribe">
        <input type="hidden" name="t" value={searchParams.t} />
        <button type="submit" className="btn">Yes, stop these emails</button>
      </form>
    </div>
  );
}
