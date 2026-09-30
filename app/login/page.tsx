import { headers } from "next/headers";
import CaptureReferral from "./CaptureReferral";
import LoginForm from "./LoginForm";
import { PASSWORD_AUTH_UI_ENABLED, isGoogleSignInEnabled } from "@/lib/featureToggles";
import { getAppBaseUrl } from "@/lib/url";

export default function LoginPage() {
  const googleEnabled = isGoogleSignInEnabled();
  const showPassword = PASSWORD_AUTH_UI_ENABLED || !googleEnabled;
  const gotrueUrlBrowser = process.env.GOTRUE_URL_BROWSER || "http://localhost:9999";
  const requestHost = headers().get("x-forwarded-host") || headers().get("host");
  const redirectTo = encodeURIComponent(`${getAppBaseUrl(requestHost)}/auth/callback`);
  const apiKey = process.env.SUPABASE_API_KEY;
  const googleHref =
    `${gotrueUrlBrowser}/authorize?provider=google&redirect_to=${redirectTo}` +
    (apiKey ? `&apikey=${encodeURIComponent(apiKey)}` : "");

  return (
    <div>
      <CaptureReferral />
      <h1>Sign in</h1>
      <p className="hint">
        {googleEnabled
          ? "Use your Gmail account. No confirmation email is sent."
          : "Google is the primary sign-in path. Until it is configured, use email and password below."}
      </p>

      <div className="card">
        <a
          href={googleEnabled ? googleHref : undefined}
          className="btn secondary"
          aria-disabled={!googleEnabled}
          title={googleEnabled ? undefined : "Turn on the Google provider in Supabase, or set GOOGLE_CLIENT_ID"}
        >
          Continue with Gmail{!googleEnabled && " (not configured)"}
        </a>
      </div>

      {showPassword && (
        <>
          <h2>Email &amp; password</h2>
          <LoginForm />
        </>
      )}
    </div>
  );
}
