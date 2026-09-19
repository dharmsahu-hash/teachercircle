import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import RoleForm from "./RoleForm";

export default async function RoleOnboardingPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role) redirect("/");

  return (
    <div>
      <h1>One quick step</h1>
      <p className="hint">
        This is asked once and can&apos;t be changed afterwards — it&apos;s enforced in the
        database, not just this form (db/migrations/0002_role_assignment.sql).
      </p>
      <RoleForm />
    </div>
  );
}
