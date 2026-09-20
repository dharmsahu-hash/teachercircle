import Link from "next/link";
import { notFound } from "next/navigation";
import { getCityPage } from "@/lib/directory";
import { getAppBaseUrl } from "@/lib/url";
import TeacherCard from "@/components/TeacherCard";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: { city: string } }): Promise<Metadata> {
  const data = await getCityPage(params.city);
  if (!data) return { title: "City not found" };

  const title = `Tutors in ${data.cityName}`;
  const description = `Find a tutor in ${data.cityName} on TeacherCircle — ${data.teachers.length} real listing${
    data.teachers.length === 1 ? "" : "s"
  }, real feedback from students and parents, connect directly with no agency in between.`;
  const url = `${getAppBaseUrl()}/tutors/${params.city}`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: "website" },
    twitter: { card: "summary", title, description },
  };
}

export default async function CityTutorsPage({ params }: { params: { city: string } }) {
  const data = await getCityPage(params.city);
  if (!data) notFound();

  const subjectEntries = [...data.subjectsInCity.entries()].sort((a, b) => a[1].localeCompare(b[1]));

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: data.teachers.map((t, i) => ({
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
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <h1>Tutors in {data.cityName}</h1>
      <p className="hint" style={{ marginBottom: 20 }}>
        {data.teachers.length} teacher{data.teachers.length === 1 ? "" : "s"} listed in{" "}
        {data.cityName} — search by subject, read real feedback, and connect directly.
      </p>

      {subjectEntries.length > 0 && (
        <div className="pills" style={{ marginBottom: 20 }}>
          {subjectEntries.map(([slug, name]) => (
            <Link key={slug} href={`/tutors/${params.city}/${slug}`} className="pill pill-link">
              {name}
            </Link>
          ))}
        </div>
      )}

      <div className="teacher-grid">
        {data.teachers.map((t) => (
          <TeacherCard key={t.user_id} teacher={t} />
        ))}
      </div>

      <p className="hint" style={{ marginTop: 24 }}>
        Looking for a different city? <Link href="/tutors">Browse all tutors</Link>.
      </p>
    </div>
  );
}
