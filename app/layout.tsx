import "./globals.css";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import GoogleAnalytics from "@/components/GoogleAnalytics";
import AdSense from "@/components/AdSense";
import { getAppBaseUrl } from "@/lib/url";
import type { Metadata } from "next";

const description =
  "Find a teacher near you in India. Search by subject and city, read real feedback from students and parents, and connect directly — no agency in between, free for teachers.";

export const metadata: Metadata = {
  metadataBase: new URL(getAppBaseUrl()),
  title: { default: "TeacherCircle", template: "%s — TeacherCircle" },
  description,
  openGraph: { title: "TeacherCircle", description, type: "website" },
  twitter: { card: "summary", title: "TeacherCircle", description },
};

// Runs before paint so a stored dark-mode choice doesn't flash light first.
// Inline (not a module) specifically so it blocks — moving this to
// useEffect in ThemeToggle would run after the first paint instead.
const themeInitScript = `
(function () {
  try {
    var t = localStorage.getItem("tc_theme");
    if (t === "light" || t === "dark") document.documentElement.dataset.theme = t;
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <AdSense />
      </head>
      <body>
        <div className="page-shell">
          <Header />
          <div className="container">{children}</div>
          <Footer />
        </div>
        <GoogleAnalytics />
      </body>
    </html>
  );
}
