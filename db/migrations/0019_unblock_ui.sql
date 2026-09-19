-- Found while testing 0018 locally: once blocked, there was no way for the
-- blocker to undo it from the UI (only via a raw API call, which the Tier 2
-- test suite exercises but a real user can't reach). Exposing which side did
-- the blocking lets the page show an "Unblock" button only to the person who
-- can actually act on it (blocked_user_own_delete only allows auth.uid() =
-- blocker_id) — otherwise clicking it would silently do nothing for the
-- other party, which is confusing rather than helpful.
--
-- Safe to compute here even though it's the same shape as the RLS-on-RLS bug
-- fixed in 0018: this is a VIEW column, not a policy-embedded subquery, and
-- conversation_thread already runs with its owner's privileges (that's why
-- has_unread and is_blocked already work) — not the querying user's, so it
-- isn't subject to blocked_user_own_read the way the buggy policy was.
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
  ) as has_unread,
  are_users_blocked(c.teacher_id, c.requester_id) as is_blocked,
  exists (
    select 1 from blocked_user bu
    where bu.blocker_id = auth.uid()
      and bu.blocked_id = case when c.teacher_id = auth.uid() then c.requester_id else c.teacher_id end
  ) as blocked_by_me
from conversation c
join users tea on tea.id = c.teacher_id
join users req on req.id = c.requester_id
join teacher_profile tp on tp.user_id = c.teacher_id
where auth.uid() = c.teacher_id or auth.uid() = c.requester_id;

grant select on conversation_thread to authenticated;
