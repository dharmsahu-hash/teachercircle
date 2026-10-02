-- TeacherCircle Daily: streaks for signed-in players. Anonymous players keep
-- their streak in the browser (zero server cost); this table only exists so an
-- account keeps its streak across devices. One small row per player (about
-- 100 bytes), no per-quiz history, so it stays far inside the free database.
--
-- The rules live here, not in the app: a streak only grows by completing
-- TODAY's quiz (India date), once per day, and a merge from a browser cannot
-- claim a streak longer than the days the quiz has existed. Same vocabulary
-- as lib/streak.ts / lib/dailyQuiz.ts: keep them in sync.

create table if not exists daily_streak (
  user_id         uuid primary key references users(id) on delete cascade,
  current_streak  int not null default 0 check (current_streak between 0 and 3660),
  best_streak     int not null default 0 check (best_streak between 0 and 3660),
  last_date       date,
  total_quizzes   int not null default 0,
  total_correct   int not null default 0,
  updated_at      timestamptz not null default now()
);

alter table daily_streak enable row level security;
drop policy if exists daily_streak_owner_read on daily_streak;
create policy daily_streak_owner_read on daily_streak for select using (auth.uid() = user_id);

-- Take away everything except SELECT (new tables get broad default
-- privileges); all writes go through the two functions below.
revoke all on daily_streak from anon, authenticated;
grant select on daily_streak to authenticated;

-- Record completing today's quiz. Idempotent within a day.
create or replace function record_daily_quiz(p_date date, p_score int, p_level text) returns json
language plpgsql security definer as $$
declare
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  r daily_streak;
begin
  if auth.uid() is null then
    raise exception 'not authorized';
  end if;
  if p_date is distinct from v_today then
    raise exception 'quiz is not for today';
  end if;
  if p_score is null or p_score < 0 or p_score > 5 then
    raise exception 'invalid score';
  end if;
  if p_level is null or p_level not in ('5-6', '7-8', '9-10') then
    raise exception 'invalid level';
  end if;

  insert into daily_streak (user_id, current_streak, best_streak, last_date, total_quizzes, total_correct)
  values (auth.uid(), 1, 1, v_today, 1, p_score)
  on conflict (user_id) do update set
    current_streak = case
      when daily_streak.last_date = v_today then daily_streak.current_streak
      when daily_streak.last_date = v_today - 1 then daily_streak.current_streak + 1
      else 1 end,
    best_streak = greatest(daily_streak.best_streak, case
      when daily_streak.last_date = v_today then daily_streak.current_streak
      when daily_streak.last_date = v_today - 1 then daily_streak.current_streak + 1
      else 1 end),
    total_quizzes = daily_streak.total_quizzes + case when daily_streak.last_date = v_today then 0 else 1 end,
    total_correct = daily_streak.total_correct + case when daily_streak.last_date = v_today then 0 else p_score end,
    last_date = v_today,
    updated_at = now()
  returning * into r;

  return json_build_object('current', r.current_streak, 'best', r.best_streak, 'lastDate', r.last_date, 'total', r.total_quizzes);
end;
$$;

-- Bring a streak kept in a browser into the account (once, when a player
-- signs in). Keeps the longer live streak; best is the maximum of both.
create or replace function merge_daily_streak(p_current int, p_best int, p_last date) returns json
language plpgsql security definer as $$
declare
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_max int := (v_today - date '2026-10-01') + 1; -- no streak can predate the quiz
  v_current int := p_current;
  v_valid boolean;
  r daily_streak;
begin
  if auth.uid() is null then
    raise exception 'not authorized';
  end if;
  if p_current is null or p_best is null or p_current < 0 or p_best < p_current or p_best > v_max or p_current > v_max then
    raise exception 'invalid streak';
  end if;
  -- A streak only continues if its last day is today or yesterday.
  if p_last is null or p_last < v_today - 1 or p_last > v_today then
    v_current := 0;
  end if;

  select * into r from daily_streak where user_id = auth.uid() for update;
  if not found then
    insert into daily_streak (user_id, current_streak, best_streak, last_date)
    values (auth.uid(), v_current, greatest(p_best, v_current), case when v_current > 0 then p_last end)
    returning * into r;
  else
    v_valid := r.last_date is not null and r.last_date >= v_today - 1;
    if v_current > 0 and (not v_valid or v_current > r.current_streak) then
      update daily_streak
      set current_streak = v_current,
          last_date = greatest(p_last, coalesce(r.last_date, p_last)),
          best_streak = greatest(r.best_streak, p_best, v_current),
          updated_at = now()
      where user_id = auth.uid()
      returning * into r;
    else
      update daily_streak
      set best_streak = greatest(r.best_streak, p_best), updated_at = now()
      where user_id = auth.uid()
      returning * into r;
    end if;
  end if;

  return json_build_object('current', r.current_streak, 'best', r.best_streak, 'lastDate', r.last_date, 'total', r.total_quizzes);
end;
$$;

revoke execute on function record_daily_quiz(date, int, text) from public, anon;
revoke execute on function merge_daily_streak(int, int, date) from public, anon;
grant execute on function record_daily_quiz(date, int, text) to authenticated;
grant execute on function merge_daily_streak(int, int, date) to authenticated;
