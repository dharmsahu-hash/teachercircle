import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { avatarPresets } from "@/lib/avatar";
import { getAppBaseUrl } from "@/lib/url";
import { pgRpc } from "@/lib/db";
import Avatar from "@/components/Avatar";
import AvatarPicker from "@/components/AvatarPicker";
import InviteLink from "@/components/InviteLink";
import ContactInfoForm from "./ContactInfoForm";
import DeleteAccountButton from "./DeleteAccountButton";

export default async function AccountPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const referralCount = await pgRpc("get_referral_count", {}, user.token).catch(() => 0);

  return (
    <div>
      <h1>Your account</h1>
      <div className="card row" style={{ alignItems: "center" }}>
        <Avatar avatarUrl={user.avatarUrl} avatarSeed={user.avatarSeed} label={user.fullName ?? user.email} size="lg" />
        <div>
          <p style={{ margin: 0 }}><b>{user.fullName ?? "No name on file"}</b></p>
          <p className="hint" style={{ margin: "2px 0 0" }}>{user.email}</p>
        </div>
      </div>
      <div className="card">
        <p><b>Email:</b> {user.email}</p>
        <p><b>Role:</b> {user.role ?? "—"}</p>
      </div>

      <h2>Contact details</h2>
      <p className="hint">
        Your name and an optional phone number — shown only to you and admins, not
        published anywhere.
      </p>
      <ContactInfoForm initialFullName={user.fullName} initialPhone={user.phone} />

      <h2>Avatar</h2>
      <p className="hint">
        Pick a free generated avatar — no photo upload, nothing stored but the small
        selection below, $0 to run. Your choice overrides your Google photo if you have one.
      </p>
      <AvatarPicker presets={avatarPresets()} currentSeed={user.avatarSeed} />

      <h2>Invite a teacher</h2>
      <p className="hint">
        Know a teacher who&apos;d list for free? Share your link — {referralCount} teacher
        {referralCount === 1 ? "" : "s"} {referralCount === 1 ? "has" : "have"} joined
        through it so far.
      </p>
      <InviteLink link={`${getAppBaseUrl()}/login?ref=${user.id}`} />

      <h2>Danger zone</h2>
      <p className="hint">
        Deletes your account (soft-delete): your profile is unlisted and your email is
        scrubbed, but reviews you left stay visible so other users&apos; trust signal isn&apos;t
        broken. See §27 of the design doc.
      </p>
      <DeleteAccountButton />
    </div>
  );
}
