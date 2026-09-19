-- Unread tracking. A single nullable `read_at` on `message` is enough here
-- (not a separate per-user read-receipts table) because a conversation has
-- exactly two participants and every message has exactly one recipient —
-- the other one. "Unread" = sent by the other participant, not yet read by
-- me.
alter table message add column if not exists read_at timestamptz;

-- Marking read goes through a narrow RPC rather than a raw PostgREST
-- UPDATE + RLS policy: a table-level UPDATE policy can restrict which ROWS
-- are touched, but not which COLUMNS change within an allowed row, so a
-- participant could otherwise rewrite another party's message body via a
-- crafted PATCH. This function only ever sets read_at, on rows the caller
-- didn't send, in a conversation they're actually part of.
create or replace function mark_conversation_read(p_conversation_id uuid)
returns void language plpgsql security definer as $$
begin
  if not exists (
    select 1 from conversation c
    where c.id = p_conversation_id
      and (c.teacher_id = auth.uid() or c.requester_id = auth.uid())
  ) then
    raise exception 'not a participant';
  end if;

  update message
  set read_at = now()
  where conversation_id = p_conversation_id
    and sender_id != auth.uid()
    and read_at is null;
end; $$;

-- has_unread appended at the end, not interleaved — CREATE OR REPLACE VIEW
-- only allows adding columns after the existing ones (see 0013's own note
-- on this exact restriction).
create or replace view conversation_thread as
select
  c.id as conversation_id,
  c.teacher_id,
  c.requester_id,
  c.created_at,
  tp.name as teacher_display_name,
  case when c.teacher_id = auth.uid() then req.full_name else null end as requester_full_name,
  case when c.teacher_id = auth.uid() then req.avatar_url else tea.avatar_url end as other_avatar_url,
  case when c.teacher_id = auth.uid() then req.avatar_seed else tea.avatar_seed end as other_avatar_seed,
  exists (
    select 1 from message m
    where m.conversation_id = c.id and m.sender_id != auth.uid() and m.read_at is null
  ) as has_unread
from conversation c
join users tea on tea.id = c.teacher_id
join users req on req.id = c.requester_id
join teacher_profile tp on tp.user_id = c.teacher_id
where auth.uid() = c.teacher_id or auth.uid() = c.requester_id;

grant select on conversation_thread to authenticated;
