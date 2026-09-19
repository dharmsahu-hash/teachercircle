import LoginForm from "./LoginForm";
import { getAppBaseUrl } from "@/lib/url";

export default function LoginPage() {
  const googleEnabled = Boolean(process.env.GOOGLE_CLIENT_ID);
  const gotrueUrlBrowser = process.env.GOTRUE_URL_BROWSER || "http://localhost:9999";
  const redirectTo = encodeURIComponent(`${getAppBaseUrl()}/auth/callback`);
  const googleHref = `${gotrueUrlBrowser}/authorize?provider=google&redirect_to=${redirectTo}`;

  return (
    <div>
      <h1>Sign in</h1>
      <p className="hint">
        Google is the primary sign-in path in production. Locally, without Google
        credentials configured, use email + password below — it exercises the exact
        same account/role/profile flow.
      </p>

      <div className="card">
        <a
          href={googleHref}
          className="btn secondary"
          aria-disabled={!googleEnabled}
          title={googleEnabled ? undefined : "Set GOOGLE_CLIENT_ID/SECRET in .env to enable this"}
        >
          Continue with Google{!googleEnabled && " (not configured)"}
        </a>
      </div>

      <h2>Email &amp; password</h2>
      <LoginForm />
    </div>
  );
}
