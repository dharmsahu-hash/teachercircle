import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { pg } from "@/lib/db";
import { buildUpiDeepLink, buildUpiQrDataUrl } from "@/lib/upi";

export async function POST() {
  const user = await requireSession().catch(() => null);
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!user.role) return NextResponse.json({ error: "Complete onboarding first" }, { status: 400 });

  const limitsRows = await pg(`/plan_limits?role=eq.${user.role}&select=*`, { token: user.token });
  const limits = Array.isArray(limitsRows) ? limitsRows[0] : null;
  if (!limits) return NextResponse.json({ error: "No plan configured for this role" }, { status: 400 });

  const [subscription] = await pg(`/subscription`, {
    method: "POST",
    token: user.token,
    body: { user_id: user.id, status: "pending" },
  });

  const note = `SUB-${subscription.id}`;
  const deepLink = buildUpiDeepLink(Number(limits.yearly_price_amount), note);

  const [txn] = await pg(`/payment_transaction`, {
    method: "POST",
    token: user.token,
    body: {
      subscription_id: subscription.id,
      provider: "manual_upi",
      amount: limits.yearly_price_amount,
      currency: limits.yearly_price_currency,
    },
  });

  return NextResponse.json({
    subscriptionId: subscription.id,
    transactionId: txn.id,
    upiDeepLink: deepLink,
    qrImageUrl: await buildUpiQrDataUrl(deepLink),
    amount: limits.yearly_price_amount,
    currency: limits.yearly_price_currency,
  });
}
