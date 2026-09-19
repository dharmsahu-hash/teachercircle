import "./globals.css";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

export const metadata = { title: "TeacherCircle" };

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
