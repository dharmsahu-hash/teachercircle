import Link from "next/link";
import { getDirectory } from "@/lib/directory";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Browse tutors by city and subject",
  description:
    "Browse TeacherCircle's tutors by city or subject across India — find and connect with a teacher directly, no agency in between.",
};

export default async function TutorsHubPage() {
  const { cities, subjects } = await getDirectory();
  const cityEntries = [...cities.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const subjectEntries = [...subjects.entries()].sort((a, b) => a[1].localeCompare(b[1]));

  return (
    <div>
      <h1>Browse tutors</h1>
      <p className="hint" style={{ marginBottom: 20 }}>
        Every city and subject currently listed on TeacherCircle — pick one to see real
        teachers and their feedback.
      </p>

      <h2>By city</h2>
      {cityEntries.length === 0 ? (
        <p className="hint">No listed teachers yet — check back soon.</p>
      ) : (
        <div className="pills">
          {cityEntries.map(([slug, name]) => (
            <Link key={slug} href={`/tutors/${slug}`} className="pill pill-link">
              {name}
            </Link>
          ))}
        </div>
      )}

      <h2>By subject</h2>
      {subjectEntries.length === 0 ? (
        <p className="hint">No listed teachers yet — check back soon.</p>
      ) : (
        <div className="pills">
          {subjectEntries.map(([slug, name]) => (
            <Link key={slug} href={`/search?subject=${encodeURIComponent(name)}`} className="pill pill-link">
              {name}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
