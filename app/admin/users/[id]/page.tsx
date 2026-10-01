import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { pg, pgRpc } from "@/lib/db";
import AdminUserDetail from "./AdminUserDetail";

export default async function AdminUserDetailPage({ params }: { params: { id: string } }) {
  const admin = await getSessionUser();
  if (!admin) redirect("/login");
  if (admin.role !== "admin") redirect("/");

  const users = await pg(`/users?id=eq.${params.id}&select=*`, { token: admin.token });
  const targetUser = Array.isArray(users) ? users[0] : null;
  if (!targetUser) return <p>User not found.</p>;

  const unclaimedIds = ((await pgRpc("admin_unclaimed_user_ids", {}, admin.token).catch(() => [])) ?? []) as string[];
  const unclaimed = unclaimedIds.includes(params.id);

  let teacherProfile = null;
  if (targetUser.role === "teacher") {
    const rows = await pg(`/teacher_profile?user_id=eq.${params.id}&select=*`, { token: admin.token });
    teacherProfile = Array.isArray(rows) ? rows[0] ?? null : null;
  }

  const auditLog =
    (await pg(
      `/admin_audit_log?target_id=eq.${params.id}&select=*&order=created_at.desc&limit=20`,
      { token: admin.token }
    )) ?? [];

  return (
    <div>
      <h1>{targetUser.email}</h1>
      <p className="hint">
        Role: {targetUser.role ?? "—"} · Status: {targetUser.deleted_at ? "Deleted" : "Active"}
        {unclaimed && " · Not claimed yet"}
      </p>
      {unclaimed && (
        <p className="hint">
          Added by an admin, no login yet. When this teacher signs up with {targetUser.email} and verifies
          it (Google sign-in or the confirmation email), this listing becomes their account automatically.
        </p>
      )}

      <AdminUserDetail
        targetUserId={params.id}
        role={targetUser.role}
        deleted={Boolean(targetUser.deleted_at)}
        teacherProfile={teacherProfile}
      />

      <h2>Audit log for this user</h2>
      {auditLog.length === 0 && <p className="hint">No admin actions recorded yet.</p>}
      {auditLog.length > 0 && (
        <table>
          <thead><tr><th>Action</th><th>Table</th><th>When</th></tr></thead>
          <tbody>
            {auditLog.map((a: any) => (
              <tr key={a.id}>
                <td>{a.action}</td>
                <td>{a.target_table}</td>
                <td>{new Date(a.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
