import { notFound } from "next/navigation";
import type { Metadata } from "next";
import DirectoryListing from "@/components/DirectoryListing";
import { getCitySubjectClassPage } from "@/lib/directory";
import { summarizeListings } from "@/lib/listingSummary";
import { getAppBaseUrl } from "@/lib/url";

export const dynamic = "force-dynamic";

// Growth #3: "class 10 maths tutor kanpur". [level] is "class-<n>"; anything
// else, or a combination no real teacher matches, is a 404.
export async function generateMetadata({
  params,
}: {
  params: { city: string; subject: string; level: string };
}): Promise<Metadata> {
  const data = await getCitySubjectClassPage(params.city, params.subject, params.level);
  if (!data) return { title: "Not found" };
  const title = `Class ${data.cls} ${data.subjectName} tutors in ${data.cityName}`;
  const description = `${summarizeListings(data.teachers, { place: data.cityName, subject: `Class ${data.cls} ${data.subjectName}` }).slice(0, 2).join(" ")} Connect directly on TeacherCircle.`;
  const url = `${getAppBaseUrl()}/tutors/${params.city}/${params.subject}/${params.level}`;
  return { title, description, alternates: { canonical: url }, openGraph: { title, description, url, type: "website" } };
}

export default async function CitySubjectClassPage({
  params,
}: {
  params: { city: string; subject: string; level: string };
}) {
  const data = await getCitySubjectClassPage(params.city, params.subject, params.level);
  if (!data) notFound();
  return (
    <DirectoryListing
      heading={`Class ${data.cls} ${data.subjectName} tutors in ${data.cityName}`}
      summary={summarizeListings(data.teachers, { place: data.cityName, subject: `Class ${data.cls} ${data.subjectName}` })}
      teachers={data.teachers}
      footer={[
        { href: `/tutors/${params.city}/${params.subject}`, label: `All ${data.subjectName} tutors in ${data.cityName}` },
        { href: `/tutors/${params.city}`, label: `All tutors in ${data.cityName}` },
      ]}
    />
  );
}
