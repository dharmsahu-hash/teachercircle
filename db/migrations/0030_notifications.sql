-- Push alerts and the teacher digest.
--
-- Cost rule: nothing here sends anything unless there is something to say.
-- The digest only returns a teacher when at least one NEW matching tutor
-- request exists since their last digest; reminders only return players
-- whose streak is actually at risk. No activity means no rows, so no email.
--
-- Who may do what:
--  * A signed-in user manages only their own devices and preferences, through
--    functions (the tables have no grants at all).
--  * Background jobs and notification fan-out need to read OTHER people's
--    devices and emails, which no user login may do. Those functions take a
--    long secret (CRON_SECRET in the app's environment) and refuse to answer
--    without it. Only a SHA-256 hash of the secret is stored here, so the
--    database never holds it and the app never needs a master database key.
--    Setup: scripts/notify-setup.mjs prints the one-line INSERT for job_secret.

create table if not exists notification_pref (
  user_id              uuid primary key references users(id) on delete cascade,
  email_digest         boolean not null default true,
  push_requests        boolean not null default true,
  push_messages        boolean not null default true,
  push_quiz            boolean not null default true,
  digest_last_sent_at  timestamptz,
  quiz_reminded_on     date,
  updated_at           timestamptz not null default now()
);

create table if not exists push_subscription (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  endpoint    text not null unique check (endpoint like 'https://%' and length(endpoint) <= 600),
  p256dh      text not null check (length(p256dh) between 20 and 200),
  auth        text not null check (length(auth) between 8 and 100),
  user_agent  text check (length(user_agent) <= 300),
  created_at  timestamptz not null default now()
);
create index if not exists idx_push_subscription_user on push_subscription (user_id);

create table if not exists job_secret (
  id           int primary key default 1 check (id = 1),
  secret_hash  text not null,
  updated_at   timestamptz not null default now()
);

alter table notification_pref enable row level security;
alter table push_subscription enable row level security;
alter table job_secret enable row level security;
-- No policies and no grants: every read and write goes through the functions below.
revoke all on notification_pref, push_subscription, job_secret from anon, authenticated;

create or replace function job_authorized(p_secret text) returns boolean
language sql stable security definer as $$
  select p_secret is not null
    and length(p_secret) >= 32
    and exists (select 1 from job_secret where secret_hash = encode(sha256(convert_to(p_secret, 'utf8')), 'hex'));
$$;
revoke execute on function job_authorized(text) from public, anon, authenticated;

-- "Today" in India, same as the daily quiz.
create or replace function ist_today() returns date
language sql stable as $$ select (now() at time zone 'Asia/Kolkata')::date $$;

-- ---------------------------------------------------------------- matching --
-- Does an open tutor request suit this teacher? Same subject (any case), and
-- either the same city for home tuition or online on both sides; never the
-- teacher's own post, a blocked pair, or a request they already answered.
create or replace function request_fits_teacher(p_user uuid, p_subjects text[], p_city text, p_mode text, r tutor_request) returns boolean
language sql stable security definer as $$
  select r.requester_id <> p_user
    and exists (select 1 from unnest(p_subjects) s where lower(btrim(s)) = lower(btrim(r.subject)))
    and (
      (r.city is not null and p_city is not null
        and lower(btrim(r.city)) = lower(btrim(p_city))
        and p_mode in ('home', 'both') and r.mode in ('home', 'both'))
      or (r.mode in ('online', 'both') and p_mode in ('online', 'both'))
    )
    and not are_users_blocked(p_user, r.requester_id)
    and not exists (select 1 from tutor_request_response tr where tr.request_id = r.id and tr.teacher_id = p_user);
$$;
revoke execute on function request_fits_teacher(uuid, text[], text, text, tutor_request) from public, anon, authenticated;

-- ------------------------------------------------------- the user's own part --
create or replace function my_notification_prefs() returns json
language plpgsql security definer as $$
declare r notification_pref;
begin
  if auth.uid() is null then raise exception 'not authorized'; end if;
  select * into r from notification_pref where user_id = auth.uid();
  return json_build_object(
    'emailDigest', coalesce(r.email_digest, true),
    'pushRequests', coalesce(r.push_requests, true),
    'pushMessages', coalesce(r.push_messages, true),
    'pushQuiz', coalesce(r.push_quiz, true),
    'devices', (select count(*) from push_subscription where user_id = auth.uid())
  );
end;
$$;

create or replace function set_my_notification_prefs(p_email_digest boolean, p_push_requests boolean, p_push_messages boolean, p_push_quiz boolean) returns json
language plpgsql security definer as $$
begin
  if auth.uid() is null then raise exception 'not authorized'; end if;
  insert into notification_pref (user_id, email_digest, push_requests, push_messages, push_quiz)
  values (auth.uid(), coalesce(p_email_digest, true), coalesce(p_push_requests, true), coalesce(p_push_messages, true), coalesce(p_push_quiz, true))
  on conflict (user_id) do update set
    email_digest = coalesce(p_email_digest, notification_pref.email_digest),
    push_requests = coalesce(p_push_requests, notification_pref.push_requests),
    push_messages = coalesce(p_push_messages, notification_pref.push_messages),
    push_quiz = coalesce(p_push_quiz, notification_pref.push_quiz),
    updated_at = now();
  return my_notification_prefs();
end;
$$;

-- Register this browser/device for push. A device that signs in as someone
-- else takes the subscription over; at most 5 devices a person (oldest drop).
create or replace function save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text) returns uuid
language plpgsql security definer as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'not authorized'; end if;
  if p_endpoint is null or p_endpoint not like 'https://%' or length(p_endpoint) > 600 then
    raise exception 'invalid subscription';
  end if;
  insert into push_subscription (user_id, endpoint, p256dh, auth, user_agent)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(p_user_agent, 300))
  on conflict (endpoint) do update set
    user_id = auth.uid(), p256dh = excluded.p256dh, auth = excluded.auth, user_agent = excluded.user_agent
  returning id into v_id;
  delete from push_subscription
  where user_id = auth.uid()
    and id not in (select id from push_subscription where user_id = auth.uid() order by created_at desc limit 5);
  insert into notification_pref (user_id) values (auth.uid()) on conflict (user_id) do nothing;
  return v_id;
end;
$$;

create or replace function remove_push_subscription(p_endpoint text) returns void
language plpgsql security definer as $$
begin
  if auth.uid() is null then raise exception 'not authorized'; end if;
  delete from push_subscription where endpoint = p_endpoint and user_id = auth.uid();
end;
$$;

-- ------------------------------------------------- secret-guarded job functions --
-- A user's push devices, filtered by what they opted into.
-- kind: messages | requests | quiz | any
create or replace function push_targets_for_user(p_secret text, p_user_id uuid, p_kind text) returns json
language plpgsql security definer as $$
begin
  if not job_authorized(p_secret) then raise exception 'not authorized'; end if;
  return (
    select coalesce(json_agg(json_build_object('id', s.id, 'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth)), '[]'::json)
    from push_subscription s
    left join notification_pref p on p.user_id = s.user_id
    where s.user_id = p_user_id
      and case p_kind
            when 'messages' then coalesce(p.push_messages, true)
            when 'requests' then coalesce(p.push_requests, true)
            when 'quiz' then coalesce(p.push_quiz, true)
            else true end
  );
end;
$$;

-- Devices of teachers who should hear about this new request right now.
create or replace function push_targets_for_request(p_secret text, p_request_id uuid) returns json
language plpgsql security definer as $$
declare r tutor_request;
begin
  if not job_authorized(p_secret) then raise exception 'not authorized'; end if;
  select * into r from tutor_request where id = p_request_id and status = 'open' and expires_at > now();
  if not found then return '[]'::json; end if;
  return (
    select coalesce(json_agg(json_build_object('id', s.id, 'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth)), '[]'::json)
    from (
      select s.* from teacher_profile tp
      join push_subscription s on s.user_id = tp.user_id
      left join notification_pref p on p.user_id = tp.user_id
      where tp.is_listed and tp.deleted_at is null
        and coalesce(p.push_requests, true)
        and request_fits_teacher(tp.user_id, tp.subjects, tp.city, tp.teaching_mode, r)
      limit 300
    ) s
  );
end;
$$;

-- Devices of the person who posted the request (a teacher just replied).
create or replace function push_targets_for_request_poster(p_secret text, p_request_id uuid) returns json
language plpgsql security definer as $$
declare v_poster uuid;
begin
  if not job_authorized(p_secret) then raise exception 'not authorized'; end if;
  select requester_id into v_poster from tutor_request where id = p_request_id;
  if v_poster is null then return '[]'::json; end if;
  return push_targets_for_user(p_secret, v_poster, 'messages');
end;
$$;

-- Everything needed to tell the other person in a conversation about a new
-- message: their devices, and whether an email is warranted (only the first
-- unread message from this sender, so a chat burst is one email at most).
create or replace function message_notify_targets(p_secret text, p_conversation_id uuid, p_sender_id uuid) returns json
language plpgsql security definer as $$
declare c conversation; v_recipient uuid; v_name text;
begin
  if not job_authorized(p_secret) then raise exception 'not authorized'; end if;
  select * into c from conversation where id = p_conversation_id;
  if not found then raise exception 'conversation not found'; end if;
  if p_sender_id <> c.teacher_id and p_sender_id <> c.requester_id then raise exception 'not a participant'; end if;
  v_recipient := case when p_sender_id = c.teacher_id then c.requester_id else c.teacher_id end;
  v_name := case when p_sender_id = c.teacher_id
    then (select name from teacher_profile where user_id = c.teacher_id)
    else coalesce((select nullif(btrim(split_part(full_name, ' ', 1)), '') from users where id = c.requester_id), 'A student or parent') end;
  return json_build_object(
    'email', (select email from users where id = v_recipient and deleted_at is null),
    'senderName', coalesce(v_name, 'Someone'),
    'subs', push_targets_for_user(p_secret, v_recipient, 'messages'),
    'unreadFromSender', (select count(*) from message where conversation_id = p_conversation_id and sender_id = p_sender_id and read_at is null)
  );
end;
$$;

-- Teachers with NEW matching requests since their last digest (3 days at
-- most, a day for a first digest). No match, no row. Returns the total waiting
-- and at most p_limit teachers, busiest first, with up to 5 requests each.
create or replace function digest_pending(p_secret text, p_limit int) returns json
language plpgsql security definer as $$
declare v_result json;
begin
  if not job_authorized(p_secret) then raise exception 'not authorized'; end if;
  with eligible as (
    select tp.user_id, tp.name, tp.city, tp.subjects, tp.teaching_mode, u.email,
           greatest(coalesce(p.digest_last_sent_at, now() - interval '1 day'), now() - interval '3 days') as since
    from teacher_profile tp
    join users u on u.id = tp.user_id and u.deleted_at is null and u.email is not null
    left join notification_pref p on p.user_id = tp.user_id
    where tp.is_listed and tp.deleted_at is null and coalesce(p.email_digest, true)
  ), hits as (
    select e.user_id, e.email, e.name, e.city as teacher_city, r.id, r.subject, r.city, r.class, r.board, r.exam, r.mode, r.details, r.created_at,
           row_number() over (partition by e.user_id order by r.created_at desc) as rn
    from eligible e
    join tutor_request r on r.status = 'open' and r.expires_at > now() and r.created_at > e.since
    where request_fits_teacher(e.user_id, e.subjects, e.city, e.teaching_mode, r)
  ), grouped as (
    select user_id, email, name, max(teacher_city) as city, count(*)::int as n,
           json_agg(json_build_object('id', id, 'subject', subject, 'city', city, 'class', class, 'board', board, 'exam', exam, 'mode', mode, 'details', details, 'created_at', created_at) order by created_at desc)
             filter (where rn <= 5) as requests
    from hits group by user_id, email, name
  ), top as (
    select * from grouped order by n desc, user_id limit greatest(coalesce(p_limit, 0), 0)
  )
  select json_build_object(
    'total', (select count(*) from grouped),
    'rows', coalesce((select json_agg(json_build_object('userId', user_id, 'email', email, 'name', name, 'city', city, 'count', n, 'requests', requests) order by n desc, user_id) from top), '[]'::json)
  ) into v_result;
  return v_result;
end;
$$;

create or replace function digest_sent_today(p_secret text) returns int
language plpgsql security definer as $$
begin
  if not job_authorized(p_secret) then raise exception 'not authorized'; end if;
  return (select count(*)::int from notification_pref
          where digest_last_sent_at >= (date_trunc('day', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata'));
end;
$$;

create or replace function digest_mark_sent(p_secret text, p_user_ids uuid[]) returns int
language plpgsql security definer as $$
declare n int;
begin
  if not job_authorized(p_secret) then raise exception 'not authorized'; end if;
  insert into notification_pref (user_id, digest_last_sent_at)
  select unnest(p_user_ids), now()
  on conflict (user_id) do update set digest_last_sent_at = now(), updated_at = now();
  get diagnostics n = row_count;
  return n;
end;
$$;

create or replace function set_digest_optout(p_secret text, p_user_id uuid) returns void
language plpgsql security definer as $$
begin
  if not job_authorized(p_secret) then raise exception 'not authorized'; end if;
  insert into notification_pref (user_id, email_digest) values (p_user_id, false)
  on conflict (user_id) do update set email_digest = false, updated_at = now();
end;
$$;

-- Players whose streak ends tonight: 2+ days, last played yesterday, with a
-- device, who opted in and were not already reminded today.
create or replace function streak_reminder_targets(p_secret text, p_limit int) returns json
language plpgsql security definer as $$
begin
  if not job_authorized(p_secret) then raise exception 'not authorized'; end if;
  return (
    select coalesce(json_agg(json_build_object('userId', t.user_id, 'streak', t.current_streak, 'subs', t.subs)), '[]'::json)
    from (
      select ds.user_id, ds.current_streak, push_targets_for_user(p_secret, ds.user_id, 'quiz') as subs
      from daily_streak ds
      join users u on u.id = ds.user_id and u.deleted_at is null
      left join notification_pref p on p.user_id = ds.user_id
      where ds.current_streak >= 2
        and ds.last_date = ist_today() - 1
        and coalesce(p.push_quiz, true)
        and p.quiz_reminded_on is distinct from ist_today()
        and exists (select 1 from push_subscription s where s.user_id = ds.user_id)
      order by ds.current_streak desc, ds.user_id
      limit greatest(coalesce(p_limit, 0), 0)
    ) t
  );
end;
$$;

create or replace function mark_quiz_reminded(p_secret text, p_user_ids uuid[]) returns int
language plpgsql security definer as $$
declare n int;
begin
  if not job_authorized(p_secret) then raise exception 'not authorized'; end if;
  insert into notification_pref (user_id, quiz_reminded_on)
  select unnest(p_user_ids), ist_today()
  on conflict (user_id) do update set quiz_reminded_on = ist_today(), updated_at = now();
  get diagnostics n = row_count;
  return n;
end;
$$;

-- A push service answered "gone": forget those devices.
create or replace function drop_push_subscriptions(p_secret text, p_ids uuid[]) returns int
language plpgsql security definer as $$
declare n int;
begin
  if not job_authorized(p_secret) then raise exception 'not authorized'; end if;
  delete from push_subscription where id = any(p_ids);
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Execute rights. User functions: signed-in only. Job functions: callable by
-- the app without a login, but useless without the secret.
revoke execute on function my_notification_prefs() from public, anon;
revoke execute on function set_my_notification_prefs(boolean, boolean, boolean, boolean) from public, anon;
revoke execute on function save_push_subscription(text, text, text, text) from public, anon;
revoke execute on function remove_push_subscription(text) from public, anon;
grant execute on function my_notification_prefs() to authenticated;
grant execute on function set_my_notification_prefs(boolean, boolean, boolean, boolean) to authenticated;
grant execute on function save_push_subscription(text, text, text, text) to authenticated;
grant execute on function remove_push_subscription(text) to authenticated;

revoke execute on function push_targets_for_user(text, uuid, text) from public;
revoke execute on function push_targets_for_request(text, uuid) from public;
revoke execute on function push_targets_for_request_poster(text, uuid) from public;
revoke execute on function message_notify_targets(text, uuid, uuid) from public;
revoke execute on function digest_pending(text, int) from public;
revoke execute on function digest_sent_today(text) from public;
revoke execute on function digest_mark_sent(text, uuid[]) from public;
revoke execute on function set_digest_optout(text, uuid) from public;
revoke execute on function streak_reminder_targets(text, int) from public;
revoke execute on function mark_quiz_reminded(text, uuid[]) from public;
revoke execute on function drop_push_subscriptions(text, uuid[]) from public;
grant execute on function push_targets_for_user(text, uuid, text) to anon, authenticated;
grant execute on function push_targets_for_request(text, uuid) to anon, authenticated;
grant execute on function push_targets_for_request_poster(text, uuid) to anon, authenticated;
grant execute on function message_notify_targets(text, uuid, uuid) to anon, authenticated;
grant execute on function digest_pending(text, int) to anon, authenticated;
grant execute on function digest_sent_today(text) to anon, authenticated;
grant execute on function digest_mark_sent(text, uuid[]) to anon, authenticated;
grant execute on function set_digest_optout(text, uuid) to anon, authenticated;
grant execute on function streak_reminder_targets(text, int) to anon, authenticated;
grant execute on function mark_quiz_reminded(text, uuid[]) to anon, authenticated;
grant execute on function drop_push_subscriptions(text, uuid[]) to anon, authenticated;
