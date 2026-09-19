-- P2 from docs/06-review-2026-09-20.md:
-- 1. Lightweight teacher verification — honestly labeled. This is NOT a
--    background check or identity/document verification: it is the teacher
--    themselves confirming their own listing is accurate. The badge text and
--    this comment both say so explicitly, so nobody mistakes it for more
--    than it is.
-- 2. A response-time signal, computed from data that already exists
--    (message timestamps) — no new tracking, no new user input.
alter table teacher_profile add column self_attested_at timestamptz;

-- One row per teacher: how long they typically take to send their FIRST
-- reply after a requester's FIRST message in a conversation. Deliberately a
-- plain view, not security definer — like teacher_public and
-- conversation_thread, a view runs with its OWNER's privileges (not the
-- querying user's), so this safely aggregates across every user's
-- conversation/message rows despite those tables' own RLS restricting direct
-- SELECT to participants + admins. Only an aggregate number per teacher is
-- exposed here — no message content, no requester identity — same privacy
-- tier as teacher_public's own avg_rating/review_count aggregates.
create or replace view teacher_response_time as
select
  c.teacher_id,
  avg(extract(epoch from (first_reply.created_at - first_msg.created_at)) / 3600.0) as avg_response_hours,
  count(*) as replied_conversation_count
from conversation c
join lateral (
  select created_at from message m
  where m.conversation_id = c.id and m.sender_id = c.requester_id
  order by created_at asc limit 1
) first_msg on true
join lateral (
  select created_at from message m
  where m.conversation_id = c.id and m.sender_id = c.teacher_id and m.created_at > first_msg.created_at
  order by created_at asc limit 1
) first_reply on true
group by c.teacher_id;

grant select on teacher_response_time to anon, authenticated;

-- Appended at the end, per 0013's note: CREATE OR REPLACE VIEW can only add
-- columns after the existing ones.
create or replace view teacher_public as
select
  tp.user_id,
  tp.name,
  tp.photo_url,
  tp.bio,
  tp.subjects,
  tp.city,
  tp.pincode,
  tp.rate_per_hour,
  tp.experience_years,
  tp.is_subscribed,
  coalesce(avg(r.rating), 0)::numeric(3,2) as avg_rating,
  count(r.id) as review_count,
  u.avatar_url,
  u.avatar_seed,
  tp.self_attested_at,
  rt.avg_response_hours,
  rt.replied_conversation_count
from teacher_profile tp
join users u on u.id = tp.user_id
left join review r on r.teacher_id = tp.user_id
left join teacher_response_time rt on rt.teacher_id = tp.user_id
where tp.is_listed and tp.deleted_at is null
group by tp.user_id, u.avatar_url, u.avatar_seed, rt.avg_response_hours, rt.replied_conversation_count;

grant select on teacher_public to anon, authenticated;
