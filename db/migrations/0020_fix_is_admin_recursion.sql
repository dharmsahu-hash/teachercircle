-- CRITICAL PRODUCTION BUG, pre-existing since 0005_profile_lifecycle_admin.sql,
-- only discovered now while verifying 0018/0019 (report + block) live against
-- the real Supabase database.
--
-- is_admin() was `language sql stable` (NOT security definer), so its own
-- inner query (`select 1 from users where id = auth.uid() ...`) is itself
-- subject to `users`'s RLS — which includes `users_admin_read using
-- (is_admin())`. On Supabase's Postgres, the planner hoists that uncorrelated
-- EXISTS as an unconditional initplan, so it runs regardless of whether the
-- OR's other branch (auth.uid() = id) would have made it unnecessary — this
-- calls is_admin() again, which does the same thing again, forever, until
-- Postgres aborts with "stack depth limit exceeded". Confirmed with `select
-- is_admin();` alone, no app code involved: crashes for ANY authenticated
-- user, not just admins. Confirmed NOT reproducible on local Docker Postgres
-- 15.8 — this is a real Postgres-version-dependent planner difference, which
-- is exactly why this was never caught by any of this project's local
-- testing (Tier 1/2/3) despite is_admin() existing since 0005 and being used
-- by six other admin-read policies plus several admin RPCs.
--
-- Impact while this was live: EVERY real (non-fake-backend) call to
-- is_admin() on Supabase crashed with a 500 — meaning /api/conversations/*
-- messages (as soon as 0018 added is_admin() to message_participant_read),
-- and very likely admin payment approval, teacher soft-delete/restore,
-- admin-create-teacher, and audit-log/subscription/transaction admin reads
-- too, any time they actually touched real RLS in production rather than the
-- Tier 2 fake backend.
--
-- Fix: security definer, the same pattern used throughout this project
-- (are_users_blocked(), reveal_teacher_contact(), set_my_role(), etc.) — it
-- runs with the defining role's privileges, so its inner query bypasses
-- `users`'s RLS entirely instead of re-entering it.
create or replace function is_admin() returns boolean
language sql stable security definer as $$
  select exists (
    select 1 from users where id = auth.uid() and role = 'admin' and deleted_at is null
  );
$$;
