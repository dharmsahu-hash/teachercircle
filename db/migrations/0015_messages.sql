-- In-app messaging, additive to the existing instant contact-info reveal
-- (not a replacement/gate — see the product decision in the conversation
-- that added this). Kept separate from `contact_request`: that table is
-- purely a quota-tracking record and a requester can accumulate several rows
-- against the same teacher over time (one per reconnect), which would
-- fragment a single conversation if messages referenced it directly.
-- `conversation` is the stable (teacher, requester) pair instead.
create table conversation (
  id            uuid primary key default gen_random_uuid(),
  teacher_id    uuid references teacher_profile(user_id) on delete cascade,
  requester_id  uuid references users(id) on delete cascade,
  created_at    timestamptz default now(),
  unique (teacher_id, requester_id)
);
create index idx_conversation_teacher on conversation (teacher_id);
create index idx_conversation_requester on conversation (requester_id);

create table message (
  id                uuid primary key default gen_random_uuid(),
  conversation_id   uuid references conversation(id) on delete cascade,
  sender_id         uuid references users(id) on delete cascade,
  body              text not null check (length(trim(body)) > 0),
  created_at        timestamptz default now()
);
create index idx_message_conversation on message (conversation_id, created_at);

alter table conversation enable row level security;
create policy conversation_participant_read on conversation for select
  using (auth.uid() = teacher_id or auth.uid() = requester_id);

-- Creating a conversation (as opposed to replying in one that already
-- exists) requires having connected first — same "must have connected"
-- rule reviews already enforce (review_insert_if_connected, 0004), applied
-- here to starting a thread rather than to leaving feedback.
create policy conversation_insert_if_connected on conversation for insert
  with check (
    auth.uid() = requester_id
    and exists (
      select 1 from contact_request
      where teacher_id = conversation.teacher_id and requester_id = auth.uid()
    )
  );

alter table message enable row level security;
create policy message_participant_read on message for select
  using (exists (
    select 1 from conversation c
    where c.id = message.conversation_id
      and (c.teacher_id = auth.uid() or c.requester_id = auth.uid())
  ));

-- Replying does NOT re-check contact_request — once a conversation exists,
-- either side can post into it. The connected-requirement only gates
-- creating the conversation in the first place (above).
create policy message_insert_if_participant on message for insert
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from conversation c
      where c.id = message.conversation_id
        and (c.teacher_id = auth.uid() or c.requester_id = auth.uid())
    )
  );

-- Read-model for both inbox UIs (teacher's and requester's). Views run with
-- their owner's privileges, not the caller's (Postgres' default view
-- security model) — teacher_public already relies on this to expose avatar
-- fields despite `users` having no public-read policy (0013's comment).
-- That means this view's own `where auth.uid() = ...` clause is the ONLY
-- thing standing between "each viewer sees only their own conversations"
-- and "every viewer sees everyone's" — it is not optional the way it might
-- look, and must not be removed even though `conversation` already has its
-- own RLS (the view bypasses that, same as teacher_public bypasses users').
create view conversation_thread as
select
  c.id as conversation_id,
  c.teacher_id,
  c.requester_id,
  c.created_at,
  tp.name as teacher_display_name,
  case when c.teacher_id = auth.uid() then req.full_name else null end as requester_full_name,
  case when c.teacher_id = auth.uid() then req.avatar_url else tea.avatar_url end as other_avatar_url,
  case when c.teacher_id = auth.uid() then req.avatar_seed else tea.avatar_seed end as other_avatar_seed
from conversation c
join users tea on tea.id = c.teacher_id
join users req on req.id = c.requester_id
join teacher_profile tp on tp.user_id = c.teacher_id
where auth.uid() = c.teacher_id or auth.uid() = c.requester_id;

grant select, insert on conversation to authenticated;
grant select, insert on message to authenticated;
grant select on conversation_thread to authenticated;
