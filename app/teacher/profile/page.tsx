import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { pg } from "@/lib/db";
import TeacherProfileForm from "./TeacherProfileForm";

export default async function TeacherProfilePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.role) redirect("/onboarding/role");
  if (user.role !== "teacher") redirect("/search");

  const rows = await pg(`/teacher_profile?user_id=eq.${user.id}&select=*`, { token: user.token });
  const profile = Array.isArray(rows) ? rows[0] ?? null : null;

  return (
    <div>
      <h1>My teacher profile</h1>
      <p className="hint">
        This is what students and parents see when your listing appears in search
        (once <code>is_listed</code> is true and you haven&apos;t deleted your account).
      </p>
      <TeacherProfileForm initial={profile} />
    </div>
  );
}
