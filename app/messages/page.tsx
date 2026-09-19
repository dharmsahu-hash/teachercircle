import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { pg } from "@/lib/db";
import Avatar from "@/components/Avatar";

export const dynamic = "force-dynamic";

type ConversationRow = {
  conversation_id: string;
  teacher_id: string;
  requester_id: string;
  created_at: string;
  teacher_display_name: string;
  requester_full_name: string | null;
  other_avatar_url: string | null;
  other_avatar_seed: string | null;
  has_unread: boolean;
};

export default async function MessagesPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const conversations: ConversationRow[] =
    (await pg(`/conversation_thread?select=*&order=created_at.desc`, { token: user.token })) ?? [];

  return (
    <div>
      <h1>Messages</h1>
      {conversations.length === 0 && (
        <p className="hint">
          No conversations yet — messages you send or receive after connecting show up here.
        </p>
      )}
      {conversations.map((c) => {
        const iAmTeacher = c.teacher_id === user.id;
        // requester_full_name is only populated in the row a teacher can
        // see (see 0015_messages.sql's conversation_thread) — a requester
        // never learns another requester's name this way, only their own
        // side of a thread they're already a party to.
        const otherLabel = iAmTeacher ? c.requester_full_name ?? "A student/parent" : c.teacher_display_name;
        return (
          <Link
            href={`/messages/${c.conversation_id}`}
            key={c.conversation_id}
            className={`teacher-card card${c.has_unread ? " conversation-unread" : ""}`}
          >
            <div className="row" style={{ gap: 12, justifyContent: "space-between" }}>
              <div className="row" style={{ gap: 12 }}>
                <Avatar avatarUrl={c.other_avatar_url} avatarSeed={c.other_avatar_seed} label={otherLabel} />
                <div>
                  <b>{otherLabel}</b>
                  <p className="hint" style={{ margin: "2px 0 0" }}>
                    {iAmTeacher ? "Interested in your lessons" : "Your conversation"}
                  </p>
                </div>
              </div>
              {c.has_unread && <span className="unread-dot" aria-label="Unread messages" />}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
