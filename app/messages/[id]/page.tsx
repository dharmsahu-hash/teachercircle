import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { pg } from "@/lib/db";
import MessageThread from "@/components/MessageThread";

export const dynamic = "force-dynamic";

export default async function ConversationPage({ params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  // RLS (conversation_thread's own auth.uid() filter — see 0015_messages.sql)
  // returns nothing for a conversation this user isn't a party to, so this
  // doubles as the access check, not just a display lookup.
  const rows = await pg(
    `/conversation_thread?conversation_id=eq.${params.id}&select=*`,
    { token: user.token }
  );
  const conversation = Array.isArray(rows) ? rows[0] : null;
  if (!conversation) {
    return <p>This conversation doesn&apos;t exist, or you don&apos;t have access to it.</p>;
  }

  const iAmTeacher = conversation.teacher_id === user.id;
  const otherLabel = iAmTeacher
    ? conversation.requester_full_name ?? "A student/parent"
    : conversation.teacher_display_name;

  return (
    <div>
      <h1>{otherLabel}</h1>
      <MessageThread conversationId={params.id} currentUserId={user.id} />
    </div>
  );
}
