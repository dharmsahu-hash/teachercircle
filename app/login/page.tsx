import LoginForm from "./LoginForm";

export default function LoginPage() {
  const googleEnabled = Boolean(process.env.GOOGLE_CLIENT_ID);
  const gotrueUrlBrowser = process.env.GOTRUE_URL_BROWSER || "http://localhost:9999";
  const appHostname = process.env.APP_HOSTNAME || "localhost:3000";
  // Hardcoded http:// here silently built a wrong https-required redirect_to
  // on Vercel — found only by re-reading this before going live, not from a
  // test (nothing exercises this string against a real Google/Supabase
  // round-trip). localhost is the only case that's genuinely plain HTTP.
  const scheme = appHostname.startsWith("localhost") ? "http" : "https";
  const redirectTo = encodeURIComponent(`${scheme}://${appHostname}/auth/callback`);
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
