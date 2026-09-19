-- P1: basic rate limiting. No Redis/Upstash in this deployment (Vercel
-- Hobby + Supabase free tier, $0, no card) and adding one is out of scope for
-- "basic" — a small Postgres-backed fixed-window counter is enough to stop
-- casual abuse (login/signup brute-forcing, message/report spam) without new
-- infra or accounts. One row per (endpoint, actor) pair, reset each window —
-- bounded by distinct actors x endpoints, not by request volume.
create table rate_limit_hit (
  rl_key       text primary key,
  window_start timestamptz not null,
  count        int not null default 1
);

-- No direct grants on the table at all — every access goes through
-- check_rate_limit() below. RLS enabled with zero policies as belt-and-braces
-- (matches this project's pattern of enabling RLS on every table even when
-- access is otherwise restricted).
alter table rate_limit_hit enable row level security;

-- security definer so it can read/write rate_limit_hit regardless of caller
-- (anon, for login/signup; authenticated, for messages/reviews/reports) —
-- same pattern as are_users_blocked()/is_admin(). Returns true (allowed) or
-- false (limited). Known, deliberate simplification: the brand-new-key branch
-- has a small race window (two simultaneous first requests for the same key
-- can both succeed) — acceptable for a "basic" limiter meant to stop casual
-- abuse, not a hardened one.
create or replace function check_rate_limit(p_key text, p_max int, p_window_seconds int)
returns boolean
language plpgsql
security definer
as $$
declare
  v_window_start timestamptz;
  v_count int;
begin
  select window_start, count into v_window_start, v_count
    from rate_limit_hit where rl_key = p_key for update;

  if not found or v_window_start < now() - (p_window_seconds || ' seconds')::interval then
    insert into rate_limit_hit (rl_key, window_start, count) values (p_key, now(), 1)
      on conflict (rl_key) do update set window_start = now(), count = 1;
    return true;
  end if;

  if v_count >= p_max then
    return false;
  end if;

  update rate_limit_hit set count = count + 1 where rl_key = p_key;
  return true;
end;
$$;

grant execute on function check_rate_limit(text, int, int) to authenticated, anon;
