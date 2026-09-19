import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import AddTeacherForm from "./AddTeacherForm";

export default async function AddTeacherPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/");

  return (
    <div>
      <h1>Add a teacher</h1>
      <p className="hint">
        For onboarding a tutor found offline (phone/WhatsApp) who isn&apos;t signing up
        themselves yet. This creates their directory listing directly — it does not
        create a login for them. If they later sign up with this same email, their
        account and this listing won&apos;t be automatically linked (no &quot;claim your
        listing&quot; flow yet).
      </p>
      <AddTeacherForm />
    </div>
  );
}
