export const metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return (
    <div>
      <h1>Privacy Policy</h1>
      <p className="hint">Last updated: 2026-09-20.</p>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>What we collect</h2>
        <p>
          When you create an account, we store your email address, the role you chose
          (student, parent, or teacher), and whatever you add to your profile (name,
          subjects, city, rate, bio, contact details — teachers only). If you connect
          with a teacher, message them, leave feedback, report a conversation, or save
          a teacher to your favorites, we store that too, so the app can show it back to
          you and the other person involved.
        </p>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Cookies and similar technology</h2>
        <p>
          We use a session cookie to keep you signed in. We also use Google Analytics
          to understand how the site is used (pages visited, general traffic patterns)
          and Google AdSense to show ads and earn revenue that keeps this site free for
          teachers to list on. Both use cookies or similar identifiers on your device.
        </p>
        <p>
          Google may use this data, including data about your visits to this and other
          sites, to provide, measure, and improve ads, and may show you personalized
          ads based on your visits here and elsewhere. You can learn more about how
          Google uses this information at{" "}
          <a href="https://policies.google.com/technologies/partner-sites" target="_blank" rel="noopener noreferrer">
            policies.google.com/technologies/partner-sites
          </a>
          , and control the ads you see (including opting out of personalized ads) at{" "}
          <a href="https://adssettings.google.com" target="_blank" rel="noopener noreferrer">
            adssettings.google.com
          </a>
          .
        </p>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Email</h2>
        <p>
          We send account-related emails (confirmation, message notifications) through
          our email provider, Brevo. We don't send marketing email, and we don't sell
          your email address to anyone.
        </p>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>What we don't do</h2>
        <p>
          We don't sell your personal data. Teacher contact details (email, phone) are
          only ever shown to someone who has actually connected with that teacher
          in-app — never listed publicly or handed to a third party.
        </p>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Your choices</h2>
        <p>
          You can update your profile at any time from your account page. You can
          delete your account from the same place — this removes your listing from
          search immediately. You can also opt out of personalized advertising using
          the Google link above, and block cookies in your browser (some parts of the
          site, like staying signed in, won't work without them).
        </p>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Questions</h2>
        <p>
          This is a small, independently-run service, not a large company with a
          dedicated privacy team. If you have a question or a request about your data,
          reach out through the contact details on the{" "}
          <a href="https://knowledgewala.com" target="_blank" rel="noopener noreferrer">
            Knowledgewala
          </a>{" "}
          site.
        </p>
      </div>
    </div>
  );
}
