import Link from "next/link";
import InviteLink from "./InviteLink";
import WhatsAppShare from "./WhatsAppShare";
import { getAppBaseUrl } from "@/lib/url";

// Shown where a search or directory page has no teacher (growth idea #5):
// the visitor looking right now is the best person to bring one in. A
// signed-in visitor gets their own invite link, so the signup is credited to
// them (G5 referrals, /login?ref=); anyone else gets the plain signup link.
export default function InviteTeacherCard({
  subject,
  city,
  inviterId,
}: {
  subject?: string | null;
  city?: string | null;
  inviterId?: string | null;
}) {
  const base = getAppBaseUrl();
  const link = inviterId ? `${base}/login?ref=${inviterId}` : `${base}/login`;

  const who = subject ? `${subject} teacher` : "teacher";
  const where = city ? ` in ${city}` : "";
  const headline = `Know a ${who}${where}?`;
  const shareText = `Do you teach${subject ? ` ${subject}` : ""}${where}? Students are looking for teachers on TeacherCircle. List yourself for free:`;

  return (
    <div className="card invite-card">
      <h3 style={{ margin: "0 0 4px" }}>{headline}</h3>
      <p className="hint" style={{ margin: "0 0 14px" }}>
        Send them this link. Listing is free, and students{where ? where : " nearby"} can find and
        contact them directly.
      </p>
      <div className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <WhatsAppShare url={link} text={shareText} label="Send on WhatsApp" />
        {inviterId ? (
          <div style={{ flex: "1 1 260px" }}>
            <InviteLink link={link} />
          </div>
        ) : (
          <Link href="/login" className="btn ghost">
            Are you a teacher? List yourself free
          </Link>
        )}
      </div>
    </div>
  );
}
