import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { pg, pgRpc } from "@/lib/db";

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: { role?: string };
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/");

  const role = searchParams.role;
  const filter = role ? `&role=eq.${role}` : "";
  const users =
    (await pg(`/users?select=id,email,role,deleted_at,created_at&order=created_at.desc${filter}`, {
      token: user.token,
    })) ?? [];
  // Admin-added listings whose teacher hasn't signed up yet (0026). Best
  // effort: the list still renders if this call fails.
  const unclaimed = new Set<string>(
    ((await pgRpc("admin_unclaimed_user_ids", {}, user.token).catch(() => [])) ?? []) as string[]
  );

  return (
    <div>
      <h1>Admin — users</h1>
      <div className="row">
        <Link href="/admin/users" className="btn secondary">All</Link>
        <Link href="/admin/users?role=teacher" className="btn secondary">Teachers</Link>
        <Link href="/admin/users?role=parent" className="btn secondary">Parents</Link>
        <Link href="/admin/users?role=student" className="btn secondary">Students</Link>
        <Link href="/admin/payments" className="btn secondary">Pending payments</Link>
        <Link href="/admin/reports" className="btn secondary">Message reports</Link>
        <Link href="/admin/teachers/new" className="btn">+ Add teacher</Link>
      </div>
      <table style={{ marginTop: 16 }}>
        <thead><tr><th>Email</th><th>Role</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {users.map((u: any) => (
            <tr key={u.id}>
              <td>{u.email}</td>
              <td>{u.role ?? "—"}</td>
              <td>
                {u.deleted_at ? "Deleted" : "Active"}
                {unclaimed.has(u.id) && " · Not claimed yet"}
              </td>
              <td><Link href={`/admin/users/${u.id}`}>Manage</Link></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
