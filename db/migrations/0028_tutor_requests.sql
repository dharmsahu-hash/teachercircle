-- "I need a tutor" posts (growth idea #1). A signed-in student or parent
-- describes what they need (subject, city or online, class/board/exam). It
-- becomes a public page (/tutor-requests/<slug>-<id>) that search engines can
-- index even when no teacher is listed there yet; listed teachers reply
-- through the existing in-app messages.
--
-- Owner decisions (2026-10-02):
--   * only signed-in students/parents may post (no anonymous posts);
--   * a post stays public for 60 days, or until the poster closes it;
--   * the poster's identity and contact details are never public.
--
-- Everything goes through SECURITY DEFINER functions. There is deliberately
-- no INSERT/UPDATE/DELETE grant on the tables: the rules below (role, open
-- limit, blocks, audit) cannot be skipped by calling PostgREST directly.
-- The same vocabulary as 0027 / lib/levels.ts is used for class, board, exam.

create table if not exists tutor_request (
  id            uuid primary key default gen_random_uuid(),
  requester_id  uuid not null references users(id) on delete cascade,
  subject       text not null check (length(trim(subject)) between 2 and 50),
  city          text check (city is null or length(trim(city)) between 2 and 80),
  class         text check (class in ('1','2','3','4','5','6','7','8','9','10','11','12')),
  board         text check (board in ('cbse','icse','state','ib','igcse','nios')),
  exam          text check (exam in ('jee','neet','cuet','olympiad','ntse','nda','ielts')),
  mode          text not null default 'home' check (mode in ('home','online','both')),
  details       text check (details is null or length(details) <= 500),
  status        text not null default 'open' check (status in ('open','closed','removed')),
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null default now() + interval '60 days',
  closed_at     timestamptz,
  -- A home-tuition request needs a city; only a purely online one may omit it.
  constraint tutor_request_where check (mode = 'online' or city is not null)
);
create index if not exists idx_tutor_request_open on tutor_request (created_at desc) where status = 'open';
create index if not exists idx_tutor_request_requester on tutor_request (requester_id);

create table if not exists tutor_request_response (
  request_id       uuid not null references tutor_request(id) on delete cascade,
  teacher_id       uuid not null references teacher_profile(user_id) on delete cascade,
  conversation_id  uuid references conversation(id) on delete set null,
  created_at       timestamptz not null default now(),
  primary key (request_id, teacher_id)
);

alter table tutor_request enable row level security;
drop policy if exists tutor_request_owner_or_admin_read on tutor_request;
create policy tutor_request_owner_or_admin_read on tutor_request for select
  using (auth.uid() = requester_id or is_admin());

alter table tutor_request_response enable row level security;
drop policy if exists tutor_request_response_read on tutor_request_response;
create policy tutor_request_response_read on tutor_request_response for select
  using (
    auth.uid() = teacher_id
    or is_admin()
    or exists (select 1 from tutor_request r where r.id = request_id and r.requester_id = auth.uid())
  );

-- The public face of a request: no requester id, only open and unexpired.
-- Runs with the view owner's rights (like teacher_public) so anonymous
-- visitors can read it without any grant on the tables.
create or replace view tutor_request_public as
select
  r.id,
  r.subject,
  r.city,
  r.class,
  r.board,
  r.exam,
  r.mode,
  r.details,
  r.created_at,
  r.expires_at,
  (select count(*) from tutor_request_response tr where tr.request_id = r.id) as response_count
from tutor_request r
where r.status = 'open' and r.expires_at > now();

grant select on tutor_request_public to anon, authenticated;

-- New tables get broad default privileges on Supabase and in the local image,
-- so take away everything except what is needed: readers get SELECT (still
-- filtered by the RLS policies above), nobody can write except through the
-- functions below, and anonymous visitors only ever see the public view.
revoke all on tutor_request, tutor_request_response from anon, authenticated;
grant select on tutor_request, tutor_request_response to authenticated;

-- Post a request. Callers are students or parents with at most 5 open
-- requests at a time (the API also rate-limits per day).
create or replace function post_tutor_request(
  p_subject text,
  p_city text,
  p_class text,
  p_board text,
  p_exam text,
  p_mode text,
  p_details text
) returns uuid
language plpgsql security definer as $$
declare
  v_role text;
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authorized';
  end if;
  select role into v_role from users where id = auth.uid() and deleted_at is null;
  if v_role is null or v_role not in ('student', 'parent') then
    raise exception 'only students and parents can post';
  end if;
  if (select count(*) from tutor_request
        where requester_id = auth.uid() and status = 'open' and expires_at > now()) >= 5 then
    raise exception 'too many open requests';
  end if;

  insert into tutor_request (requester_id, subject, city, class, board, exam, mode, details)
  values (
    auth.uid(),
    trim(p_subject),
    nullif(trim(coalesce(p_city, '')), ''),
    nullif(p_class, ''),
    nullif(p_board, ''),
    nullif(p_exam, ''),
    coalesce(nullif(p_mode, ''), 'home'),
    nullif(trim(coalesce(p_details, '')), '')
  )
  returning id into v_id;
  return v_id;
end;
$$;

-- A listed teacher answers a request: opens (or reuses) a conversation with
-- the poster and records the response. Returns the conversation id.
create or replace function respond_to_tutor_request(p_request_id uuid) returns uuid
language plpgsql security definer as $$
declare
  v_requester uuid;
  v_conv uuid;
begin
  if auth.uid() is null then
    raise exception 'not authorized';
  end if;
  if not exists (
    select 1 from teacher_profile
    where user_id = auth.uid() and is_listed and deleted_at is null
  ) then
    raise exception 'only teachers can respond';
  end if;

  select requester_id into v_requester from tutor_request
  where id = p_request_id and status = 'open' and expires_at > now();
  if v_requester is null then
    raise exception 'request not available';
  end if;
  if v_requester = auth.uid() or are_users_blocked(auth.uid(), v_requester) then
    raise exception 'not authorized';
  end if;

  insert into conversation (teacher_id, requester_id)
  values (auth.uid(), v_requester)
  on conflict (teacher_id, requester_id) do nothing;
  select id into v_conv from conversation
  where teacher_id = auth.uid() and requester_id = v_requester;

  insert into tutor_request_response (request_id, teacher_id, conversation_id)
  values (p_request_id, auth.uid(), v_conv)
  on conflict (request_id, teacher_id) do nothing;
  return v_conv;
end;
$$;

create or replace function close_my_tutor_request(p_request_id uuid) returns void
language plpgsql security definer as $$
begin
  update tutor_request
  set status = 'closed', closed_at = now()
  where id = p_request_id and requester_id = auth.uid() and status = 'open';
  if not found then
    raise exception 'request not available';
  end if;
end;
$$;

-- Admin removal, audited like every admin write.
create or replace function admin_remove_tutor_request(p_request_id uuid) returns void
language plpgsql security definer as $$
begin
  if not is_admin() then
    raise exception 'not authorized';
  end if;
  update tutor_request set status = 'removed', closed_at = now()
  where id = p_request_id and status <> 'removed';
  if not found then
    raise exception 'request not available';
  end if;
  insert into admin_audit_log (actor_id, target_table, target_id, action)
  values (auth.uid(), 'tutor_request', p_request_id, 'delete');
end;
$$;

revoke execute on function post_tutor_request(text, text, text, text, text, text, text) from public, anon;
revoke execute on function respond_to_tutor_request(uuid) from public, anon;
revoke execute on function close_my_tutor_request(uuid) from public, anon;
revoke execute on function admin_remove_tutor_request(uuid) from public, anon;
grant execute on function post_tutor_request(text, text, text, text, text, text, text) to authenticated;
grant execute on function respond_to_tutor_request(uuid) to authenticated;
grant execute on function close_my_tutor_request(uuid) to authenticated;
grant execute on function admin_remove_tutor_request(uuid) to authenticated;
