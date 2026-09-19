import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { pg } from "@/lib/db";
import ApproveButton from "./ApproveButton";

export default async function AdminPaymentsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/");

  const txns =
    (await pg(`/payment_transaction?status=eq.submitted&select=*&order=created_at.asc`, {
      token: user.token,
    })) ?? [];

  const enriched = await Promise.all(
    txns.map(async (t: any) => {
      const subRows = await pg(`/subscription?id=eq.${t.subscription_id}&select=user_id`, {
        token: user.token,
      });
      const sub = subRows?.[0];
      const userRows = sub
        ? await pg(`/users?id=eq.${sub.user_id}&select=email`, { token: user.token })
        : [];
      return { ...t, userEmail: userRows?.[0]?.email ?? "unknown" };
    })
  );

  return (
    <div>
      <h1>Pending payments</h1>
      <p className="hint">
        Cross-check each UTR against your own bank/UPI statement before approving —
        this step is deliberately manual (see §17 of the design doc).
      </p>
      {enriched.length === 0 && <p className="hint">Nothing pending.</p>}
      {enriched.length > 0 && (
        <table>
          <thead>
            <tr><th>User</th><th>Amount</th><th>UTR</th><th>Submitted</th><th></th></tr>
          </thead>
          <tbody>
            {enriched.map((t: any) => (
              <tr key={t.id}>
                <td>{t.userEmail}</td>
                <td>{t.currency} {t.amount}</td>
                <td>{t.provider_ref}</td>
                <td>{new Date(t.created_at).toLocaleString()}</td>
                <td><ApproveButton transactionId={t.id} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
