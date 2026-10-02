import Link from "next/link";
import type { Metadata } from "next";
import { getSessionUser } from "@/lib/auth";
import NewRequestForm from "./NewRequestForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Post a tutor request",
  description: "Tell teachers what you need: subject, city, class and board. Teachers reply to you directly on TeacherCircle.",
  robots: { index: false },
};

export default async function NewTutorRequestPage({ searchParams }: { searchParams: { subject?: string; city?: string } }) {
  const user = await getSessionUser().catch(() => null);
  const subject = (searchParams.subject ?? "").slice(0, 50);
  const city = (searchParams.city ?? "").slice(0, 80);

  let body: React.ReactNode;
  if (!user) {
    body = (
      <div className="card">
        <p style={{ marginTop: 0 }}>Please sign in or create a free account to post a request. It takes a minute.</p>
        <Link href="/login" className="btn">Sign in / Sign up</Link>
      </div>
    );
  } else if (!user.role) {
    body = (
      <div className="card">
        <p style={{ marginTop: 0 }}>Finish setting up your account first.</p>
        <Link href="/onboarding/role" className="btn">Choose your role</Link>
      </div>
    );
  } else if (user.role !== "student" && user.role !== "parent") {
    body = (
      <div className="card">
        <p style={{ margin: 0 }}>
          Requests are posted by students and parents. As a teacher, you can{" "}
          <Link href="/tutor-requests">reply to open requests</Link>.
        </p>
      </div>
    );
  } else {
    body = <NewRequestForm initialSubject={subject} initialCity={city} />;
  }

  return (
    <div style={{ maxWidth: 640 }}>
      <h1>Post a tutor request</h1>
      <p className="hint">Describe what you need. Your request is public for 60 days and your name and contact details are never shown.</p>
      {body}
    </div>
  );
}
