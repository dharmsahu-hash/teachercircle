import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { SUBSCRIPTION_UI_ENABLED } from "@/lib/featureToggles";
import SubscribeForm from "./SubscribeForm";

export default async function SubscribePage() {
  if (!SUBSCRIPTION_UI_ENABLED) {
    return (
      <div>
        <h1>Subscribe</h1>
        <p className="hint">
          Subscriptions aren&apos;t open yet — check back soon. (The underlying flow is
          fully built and tested, just not switched on in the UI — see{" "}
          <code>lib/featureToggles.ts</code>.)
        </p>
      </div>
    );
  }

  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.role) redirect("/onboarding/role");

  return (
    <div>
      <h1>Subscribe</h1>
      <p className="hint">
        This flow is fully wired but dormant until <code>feature_flags.payments_enabled</code>
        is switched on (see §26 of the design doc). You can still complete it end-to-end here to
        see how a payment gets approved.
      </p>
      <SubscribeForm />
    </div>
  );
}
