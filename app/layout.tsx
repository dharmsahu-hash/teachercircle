import "./globals.css";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="page-shell">
          <Header />
          <div className="container">{children}</div>
          <Footer />
        </div>
      </body>
    </html>
  );
}
