// Transactional email via Brevo's HTTP API — distinct from the SMTP
// credentials configured in Supabase's dashboard for Auth emails
// (confirmation/reset); those never touch our own code. This is for
// app-triggered notifications (new message, etc.) that Supabase Auth has no
// reason to know about.
//
// Deliberately silent (no-op, not an error) when BREVO_API_KEY is unset —
// local dev and the test suite never configure it, and a missing
// notification must never block the action that triggered it (sending a
// message still succeeds even if the email fails or isn't configured).

const BREVO_API_KEY = process.env.BREVO_API_KEY;
const SENDER_EMAIL = process.env.EMAIL_SENDER_ADDRESS || "no-reply@teachercircle.app";
const SENDER_NAME = process.env.EMAIL_SENDER_NAME || "TeacherCircle";

export async function sendEmail(to: string, subject: string, htmlContent: string): Promise<void> {
  if (!BREVO_API_KEY) return;

  try {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "Content-Type": "application/json", "api-key": BREVO_API_KEY },
      body: JSON.stringify({
        sender: { email: SENDER_EMAIL, name: SENDER_NAME },
        to: [{ email: to }],
        subject,
        htmlContent,
      }),
    });
    if (!res.ok) {
      // Never include the recipient address in logs — SEC-3-style PII
      // discipline applied here even though this project has no formal rule
      // requiring it, because there's no reason not to.
      console.error(`Brevo send failed: ${res.status} ${await res.text()}`);
    }
  } catch (err) {
    console.error("Brevo send error", err instanceof Error ? err.message : err);
  }
}
