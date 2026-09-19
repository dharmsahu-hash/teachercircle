import Link from "next/link";
import Logo from "./Logo";

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="site-footer">
      <div className="footer-inner">
        <div className="footer-col">
          <div className="brand">
            <Logo size={22} />
            <span>TeacherCircle</span>
          </div>
          <p className="hint">
            Free teacher discovery for India. Students and parents search by subject and
            city; teachers list for free and connect directly — no agency in between.
          </p>
        </div>
        <div className="footer-col">
          <p className="footer-heading">For students &amp; parents</p>
          <Link href="/search">Find a teacher</Link>
          <Link href="/login">Create an account</Link>
        </div>
        <div className="footer-col">
          <p className="footer-heading">For teachers</p>
          <Link href="/login">List yourself for free</Link>
          <Link href="/teacher/profile">Manage your profile</Link>
        </div>
        <div className="footer-col">
          <p className="footer-heading">About</p>
          <Link href="/about">About TeacherCircle</Link>
        </div>
      </div>
      <div className="footer-bottom">
        <span>© {year} TeacherCircle — a Knowledgewala product.</span>
      </div>
    </footer>
  );
}
