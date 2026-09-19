-- Report + block for messaging — the top-priority gap from
-- docs/06-review-2026-09-20.md: real strangers can message each other with
-- no recourse. Blocking is deliberately mutual/symmetric once triggered
-- (either party blocking the other silences the whole conversation for
-- both), not one-directional — simpler to reason about and safer than
-- "the blocked person can still send, the blocker just stops seeing it."
create table blocked_user (
  blocker_id  uuid references users(id) on delete cascade,
  blocked_id  uuid references users(id) on delete cascade,
  created_at  timestamptz default now(),
  primary key (blocker_id, blocked_id)
);

create table message_report (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid references conversation(id) on delete cascade,
  reporter_id      uuid references users(id) on delete cascade,
  reason           text not null check (length(trim(reason)) > 0),
  created_at       timestamptz default now(),
  resolved_at      timestamptz
);
create index idx_message_report_unresolved on message_report (created_at) where resolved_at is null;

alter table blocked_user enable row level security;
create policy blocked_user_own_read on blocked_user for select using (auth.uid() = blocker_id);
create policy blocked_user_own_insert on blocked_user for insert with check (auth.uid() = blocker_id);
create policy blocked_user_own_delete on blocked_user for delete using (auth.uid() = blocker_id);

-- Real bug found running this for real (not from Tier 2 — the fake backend's
-- in-memory model doesn't simulate RLS-on-RLS visibility, so it couldn't
-- have caught this): blocked_user_own_read only lets the BLOCKER see their
-- own blocklist. A raw `exists (select ... from blocked_user ...)` inside
-- another table's policy is evaluated under the QUERYING user's own
-- privileges (unlike a view, which runs with its owner's privileges) — so
-- when the BLOCKED party's own insert attempt checks "are we blocked",
-- that subquery sees zero rows and the check silently passes. Confirmed via
-- direct SET ROLE testing: a literal-UUID version of the same boolean
-- correctly returned false (blocked), the auth.uid()-based one returned
-- true (not blocked) for the exact same data, because it ran as the
-- blocked party rather than the blocker. Fixed by moving the check into a
-- SECURITY DEFINER function, the same pattern already used for is_admin()
-- and reveal_teacher_contact() — it runs with the defining role's
-- privileges, so it can see across this visibility boundary correctly for
-- either party.
create or replace function are_users_blocked(a uuid, b uuid) returns boolean
language sql stable security definer as $$
  select exists (
    select 1 from blocked_user
    where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a)
  );
$$;

alter table message_report enable row level security;
-- A reporter can see their own reports; admins see all (mirrors the
-- is_admin()-gated pattern already used for admin_audit_log elsewhere).
create policy message_report_read on message_report for select
  using (auth.uid() = reporter_id or is_admin());
create policy message_report_insert on message_report for insert
  with check (
    auth.uid() = reporter_id
    and exists (
      select 1 from conversation c
      where c.id = message_report.conversation_id
        and (c.teacher_id = auth.uid() or c.requester_id = auth.uid())
    )
  );
create policy message_report_admin_update on message_report for update
  using (is_admin());

-- Admins need to read conversations/messages to actually review a report —
-- without this, message_report_read letting admins see the report row
-- would still leave them unable to see what was actually said.
drop policy if exists conversation_participant_read on conversation;
create policy conversation_participant_read on conversation for select
  using (auth.uid() = teacher_id or auth.uid() = requester_id or is_admin());

drop policy if exists message_participant_read on message;
create policy message_participant_read on message for select
  using (
    is_admin()
    or exists (
      select 1 from conversation c
      where c.id = message.conversation_id
        and (c.teacher_id = auth.uid() or c.requester_id = auth.uid())
    )
  );

-- Enforcement: neither starting a new conversation nor sending into an
-- existing one is allowed once either party has blocked the other. Existing
-- policies replaced (not just added to) since a Postgres RLS row can have
-- multiple permissive policies for the same command that OR together —
-- adding a second policy would not add this as a required condition, it
-- would only add another way to pass. This has to live in the same policy.
drop policy if exists conversation_insert_if_connected on conversation;
create policy conversation_insert_if_connected on conversation for insert
  with check (
    auth.uid() = requester_id
    and exists (
      select 1 from contact_request
      where teacher_id = conversation.teacher_id and requester_id = auth.uid()
    )
    and not are_users_blocked(conversation.teacher_id, conversation.requester_id)
  );

drop policy if exists message_insert_if_participant on message;
create policy message_insert_if_participant on message for insert
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from conversation c
      where c.id = message.conversation_id
        and (c.teacher_id = auth.uid() or c.requester_id = auth.uid())
        and not are_users_blocked(c.teacher_id, c.requester_id)
    )
  );

-- is_blocked appended at the end (see 0013's note on why: CREATE OR REPLACE
-- VIEW can only add columns after the existing ones).
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
  are_users_blocked(c.teacher_id, c.requester_id) as is_blocked
from conversation c
join users tea on tea.id = c.teacher_id
join users req on req.id = c.requester_id
join teacher_profile tp on tp.user_id = c.teacher_id
where auth.uid() = c.teacher_id or auth.uid() = c.requester_id;

grant select, insert, delete on blocked_user to authenticated;
grant select, insert on message_report to authenticated;
grant update on message_report to authenticated;
grant select on conversation_thread to authenticated;
