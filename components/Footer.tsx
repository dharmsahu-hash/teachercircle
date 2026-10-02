import Link from "next/link";
import Logo from "./Logo";
import { ArrowRightIcon } from "./icons";

const COLUMNS: { heading: string; links: { href: string; label: string }[] }[] = [
  {
    heading: "Students & parents",
    links: [
      { href: "/search", label: "Find a teacher" },
      { href: "/tutors", label: "Browse by city" },
      { href: "/tutor-requests/new", label: "Post a tutor request" },
      { href: "/login", label: "Create an account" },
    ],
  },
  {
    heading: "Teachers",
    links: [
      { href: "/login", label: "List yourself for free" },
      { href: "/teacher/profile", label: "Manage your profile" },
      { href: "/tutor-requests", label: "Open tutor requests" },
      { href: "/blog/get-more-students-as-a-home-tutor", label: "Get more students" },
    ],
  },
  {
    heading: "TeacherCircle",
    links: [
      { href: "/about", label: "About" },
      { href: "/blog", label: "Blog" },
      { href: "/privacy", label: "Privacy Policy" },
    ],
  },
];

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="site-footer">
      <div className="footer-inner">
        <div className="footer-brand">
          <Link href="/" className="brand">
            <Logo size={24} />
            <span>
              Teacher<span className="brand-accent">Circle</span>
            </span>
          </Link>
          <p>
            Free teacher discovery for India. Search by subject and city, read real
            feedback, and connect directly — no agency in between.
          </p>
          <Link href="/login" className="footer-cta">
            Are you a teacher? List yourself free <ArrowRightIcon />
          </Link>
        </div>

        {COLUMNS.map((col) => (
          <nav key={col.heading} className="footer-col" aria-label={col.heading}>
            <p className="footer-heading">{col.heading}</p>
            {col.links.map((l) => (
              <Link key={l.href + l.label} href={l.href}>
                {l.label}
              </Link>
            ))}
          </nav>
        ))}
      </div>

      <div className="footer-bottom">
        <div className="footer-bottom-inner">
          <span>
            © {year} TeacherCircle · A{" "}
            <a href="https://knowledgewala.com" target="_blank" rel="noopener noreferrer">
              Knowledgewala
            </a>{" "}
            product
          </span>
          <span className="footer-bottom-links">
            <Link href="/privacy">Privacy</Link>
            <Link href="/about">About</Link>
            <Link href="/blog">Blog</Link>
          </span>
        </div>
      </div>
    </footer>
  );
}
