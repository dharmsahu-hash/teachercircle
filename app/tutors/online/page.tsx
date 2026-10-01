import { notFound } from "next/navigation";
import type { Metadata } from "next";
import DirectoryListing from "@/components/DirectoryListing";
import { getOnlinePage } from "@/lib/directory";
import { summarizeListings } from "@/lib/listingSummary";
import { getAppBaseUrl } from "@/lib/url";

export const dynamic = "force-dynamic";

// Growth #2: online tutoring is a national search ("online maths tutor"),
// independent of having a teacher in every city.
export async function generateMetadata(): Promise<Metadata> {
  const data = await getOnlinePage();
  if (!data) return { title: "Not found" };
  const title = "Online tutors";
  const description = `${summarizeListings(data.teachers, { place: "online", onlineOnly: true }).slice(0, 2).join(" ")} Learn from anywhere in India; connect directly on TeacherCircle.`;
  const url = `${getAppBaseUrl()}/tutors/online`;
  return { title, description, alternates: { canonical: url }, openGraph: { title, description, url, type: "website" } };
}

export default async function OnlineTutorsPage() {
  const data = await getOnlinePage();
  if (!data) notFound();
  const subjects = [...data.subjects.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  return (
    <DirectoryListing
      heading="Online tutors"
      summary={summarizeListings(data.teachers, { place: "online", onlineOnly: true })}
      teachers={data.teachers}
      narrower={subjects.map(([slug, name]) => ({ href: `/tutors/online/${slug}`, label: `Online ${name}` }))}
      footer={[{ href: "/tutors", label: "Browse all tutors" }]}
    />
  );
}
