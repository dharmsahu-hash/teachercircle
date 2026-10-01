import { notFound } from "next/navigation";
import type { Metadata } from "next";
import DirectoryListing from "@/components/DirectoryListing";
import { getExamSubjectPage } from "@/lib/directory";
import { summarizeListings } from "@/lib/listingSummary";
import { getAppBaseUrl } from "@/lib/url";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: { exam: string; subject: string } }): Promise<Metadata> {
  const data = await getExamSubjectPage(params.exam, params.subject);
  if (!data) return { title: "Not found" };
  const title = `${data.examName} ${data.subjectName} tutors`;
  const description = `${summarizeListings(data.teachers, { place: `India for ${data.examName} preparation`, subject: data.subjectName }).slice(0, 2).join(" ")} Connect directly on TeacherCircle.`;
  const url = `${getAppBaseUrl()}/tutors/exam/${params.exam}/${params.subject}`;
  return { title, description, alternates: { canonical: url }, openGraph: { title, description, url, type: "website" } };
}

export default async function ExamSubjectTutorsPage({ params }: { params: { exam: string; subject: string } }) {
  const data = await getExamSubjectPage(params.exam, params.subject);
  if (!data) notFound();
  return (
    <DirectoryListing
      heading={`${data.examName} ${data.subjectName} tutors`}
      summary={summarizeListings(data.teachers, { place: `India for ${data.examName} preparation`, subject: data.subjectName })}
      teachers={data.teachers}
      footer={[
        { href: `/tutors/exam/${params.exam}`, label: `All ${data.examName} tutors` },
        { href: "/tutors", label: "Browse all tutors" },
      ]}
    />
  );
}
