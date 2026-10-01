import { notFound } from "next/navigation";
import type { Metadata } from "next";
import DirectoryListing from "@/components/DirectoryListing";
import { getOnlineSubjectPage } from "@/lib/directory";
import { summarizeListings } from "@/lib/listingSummary";
import { getAppBaseUrl } from "@/lib/url";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: { subject: string } }): Promise<Metadata> {
  const data = await getOnlineSubjectPage(params.subject);
  if (!data) return { title: "Not found" };
  const title = `Online ${data.subjectName} tutors`;
  const description = `${summarizeListings(data.teachers, { place: "online", subject: data.subjectName, onlineOnly: true }).slice(0, 2).join(" ")} Learn from anywhere in India; connect directly on TeacherCircle.`;
  const url = `${getAppBaseUrl()}/tutors/online/${params.subject}`;
  return { title, description, alternates: { canonical: url }, openGraph: { title, description, url, type: "website" } };
}

export default async function OnlineSubjectTutorsPage({ params }: { params: { subject: string } }) {
  const data = await getOnlineSubjectPage(params.subject);
  if (!data) notFound();
  return (
    <DirectoryListing
      heading={`Online ${data.subjectName} tutors`}
      summary={summarizeListings(data.teachers, { place: "online", subject: data.subjectName, onlineOnly: true })}
      teachers={data.teachers}
      footer={[
        { href: "/tutors/online", label: "All online tutors" },
        { href: `/search?subject=${encodeURIComponent(data.subjectName)}`, label: `${data.subjectName} tutors near you` },
      ]}
    />
  );
}
