import { notFound } from "next/navigation";
import type { Metadata } from "next";
import DirectoryListing from "@/components/DirectoryListing";
import { getExamPage } from "@/lib/directory";
import { summarizeListings } from "@/lib/listingSummary";
import { getAppBaseUrl } from "@/lib/url";

export const dynamic = "force-dynamic";

// Growth #3: "NEET tutor", "JEE coaching tutor" — exam searches are national.
export async function generateMetadata({ params }: { params: { exam: string } }): Promise<Metadata> {
  const data = await getExamPage(params.exam);
  if (!data) return { title: "Not found" };
  const title = `${data.examName} tutors`;
  const description = `${summarizeListings(data.teachers, { place: `India for ${data.examName} preparation` }).slice(0, 2).join(" ")} Connect directly on TeacherCircle.`;
  const url = `${getAppBaseUrl()}/tutors/exam/${params.exam}`;
  return { title, description, alternates: { canonical: url }, openGraph: { title, description, url, type: "website" } };
}

export default async function ExamTutorsPage({ params }: { params: { exam: string } }) {
  const data = await getExamPage(params.exam);
  if (!data) notFound();
  const subjects = [...data.subjects.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  return (
    <DirectoryListing
      heading={`${data.examName} tutors`}
      summary={summarizeListings(data.teachers, { place: `India for ${data.examName} preparation` })}
      teachers={data.teachers}
      narrower={subjects.map(([slug, name]) => ({ href: `/tutors/exam/${params.exam}/${slug}`, label: `${data.examName} ${name}` }))}
      footer={[{ href: "/tutors", label: "Browse all tutors" }]}
    />
  );
}
