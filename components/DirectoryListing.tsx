import Link from "next/link";
import TeacherCard from "./TeacherCard";
import { getAppBaseUrl } from "@/lib/url";
import type { DirectoryTeacher } from "@/lib/directory";

// Shared body for the online / exam / class landing pages (growth #2, #3):
// heading, the factual summary (#6), optional links to narrower pages, the
// teachers, and ItemList JSON-LD — the same structure the city pages use.
export default function DirectoryListing({
  heading,
  summary,
  teachers,
  narrower,
  footer,
}: {
  heading: string;
  summary: string[];
  teachers: DirectoryTeacher[];
  narrower?: { href: string; label: string }[];
  footer?: { href: string; label: string }[];
}) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: teachers.map((t, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `${getAppBaseUrl()}/teacher/${t.user_id}`,
      name: t.name,
    })),
  };

  return (
    <div>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <h1>{heading}</h1>
      <p className="listing-summary">{summary.join(" ")}</p>

      {narrower && narrower.length > 0 && (
        <div className="pills" style={{ marginBottom: 20 }}>
          {narrower.map((l) => (
            <Link key={l.href} href={l.href} className="pill pill-link">
              {l.label}
            </Link>
          ))}
        </div>
      )}

      <div className="teacher-grid">
        {teachers.map((t) => (
          <TeacherCard key={t.user_id} teacher={t} />
        ))}
      </div>

      {footer && footer.length > 0 && (
        <p className="hint" style={{ marginTop: 24 }}>
          {footer.map((l, i) => (
            <span key={l.href}>
              {i > 0 && " · "}
              <Link href={l.href}>{l.label}</Link>
            </span>
          ))}
        </p>
      )}
    </div>
  );
}
