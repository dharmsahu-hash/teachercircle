import Link from "next/link";
import { notFound } from "next/navigation";
import { getCitySubjectPage } from "@/lib/directory";
import { getAppBaseUrl } from "@/lib/url";
import TeacherCard from "@/components/TeacherCard";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: { city: string; subject: string };
}): Promise<Metadata> {
  const data = await getCitySubjectPage(params.city, params.subject);
  if (!data) return { title: "Not found" };

  const title = `${data.subjectName} tutors in ${data.cityName}`;
  const description = `Find a ${data.subjectName} tutor in ${data.cityName} on TeacherCircle — ${data.teachers.length} real listing${
    data.teachers.length === 1 ? "" : "s"
  }, real feedback from students and parents, connect directly with no agency in between.`;
  const url = `${getAppBaseUrl()}/tutors/${params.city}/${params.subject}`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: "website" },
    twitter: { card: "summary", title, description },
  };
}

export default async function CitySubjectTutorsPage({
  params,
}: {
  params: { city: string; subject: string };
}) {
  const data = await getCitySubjectPage(params.city, params.subject);
  if (!data) notFound();

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
      <h1>
        {data.subjectName} tutors in {data.cityName}
      </h1>
      <p className="hint" style={{ marginBottom: 20 }}>
        {data.teachers.length} {data.subjectName} teacher{data.teachers.length === 1 ? "" : "s"} listed
        in {data.cityName} — real feedback from students and parents, connect directly.
      </p>

      <div className="teacher-grid">
        {data.teachers.map((t) => (
          <TeacherCard key={t.user_id} teacher={t} />
        ))}
      </div>

      <p className="hint" style={{ marginTop: 24 }}>
        <Link href={`/tutors/${params.city}`}>All tutors in {data.cityName}</Link> ·{" "}
        <Link href="/tutors">Browse all tutors</Link>
      </p>
    </div>
  );
}
