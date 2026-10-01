-- "Claim your listing": a teacher an admin added with admin_add_teacher()
-- (0011) gets that listing automatically when they sign up with the same,
-- VERIFIED email address.
--
-- Before this, such a signup created a GoTrue account but no public.users
-- row (handle_new_user's `on conflict (email) do nothing`), so
-- getSessionUser() found no row and the person could never act as signed in.
--
-- How a claim works: the admin-added users row has a random id that has no
-- auth.users row behind it (an "unclaimed" row). When an auth user with the
-- same email becomes verified, that row's id is re-keyed to the auth user's
-- id. Every FK to users(id) is ON UPDATE CASCADE (below), so the teacher
-- profile, feedback, contact requests, conversations, favorites, etc. all
-- follow the row in one statement.
--
-- Why only on verification: GoTrue inserts auth.users first and sets
-- email_confirmed_at afterwards (autoconfirm, Google, and the confirmation
-- link all UPDATE it). Claiming on an unverified signup would let anyone
-- take over a listing by signing up with the teacher's email.

-- 1. Make every FK that references users(id) cascade on update, plus every
--    FK into the tables keyed by a user id (review, contact_request,
--    conversation and favorite_teacher point at teacher_profile.user_id),
--    so the cascade reaches them too. Done generically so no table is
--    missed; ON DELETE behavior is preserved (e.g. users.referred_by stays
--    ON DELETE SET NULL). A new FK to any of these tables must also be
--    ON UPDATE CASCADE or claims will fail.
do $$
declare
  c record;
begin
  for c in
    select con.conname, con.conrelid::regclass as tbl, pg_get_constraintdef(con.oid) as def
    from pg_constraint con
    where con.contype = 'f'
      and con.confrelid in (
        'public.users'::regclass,
        'public.teacher_profile'::regclass,
        'public.parent_profile'::regclass,
        'public.student_profile'::regclass
      )
      and con.confupdtype <> 'c'
  loop
    execute format('alter table %s drop constraint %I', c.tbl, c.conname);
    execute format('alter table %s add constraint %I %s on update cascade', c.tbl, c.conname, c.def);
  end loop;
end;
$$;

-- 2. Claims are audited like admin writes.
alter table admin_audit_log drop constraint if exists admin_audit_log_action_check;
alter table admin_audit_log add constraint admin_audit_log_action_check
  check (action in ('create', 'update', 'delete', 'claim'));

-- 3. The claim itself. Internal only: called from the auth.users triggers,
--    never from PostgREST (execute is revoked below).
create or replace function public.claim_unclaimed_listing(
  p_auth_id uuid,
  p_email text,
  p_provider text,
  p_avatar_url text
) returns boolean
language plpgsql security definer as $$
declare
  v_old_id uuid;
begin
  select u.id into v_old_id
  from public.users u
  where lower(u.email) = lower(p_email)
    and u.id <> p_auth_id
    and not exists (select 1 from auth.users a where a.id = u.id)
  for update;

  if v_old_id is null then
    return false;
  end if;

  update public.users
  set id = p_auth_id,
      email = p_email,
      auth_provider = p_provider,
      avatar_url = coalesce(avatar_url, p_avatar_url)
  where id = v_old_id;

  -- admin_audit_log.target_id is not an FK, so point earlier entries
  -- (the admin's 'create') at the new id by hand.
  update public.admin_audit_log set target_id = p_auth_id where target_id = v_old_id;

  insert into public.admin_audit_log (actor_id, target_table, target_id, action)
  values (p_auth_id, 'users', p_auth_id, 'claim');

  return true;
end;
$$;

revoke execute on function public.claim_unclaimed_listing(uuid, text, text, text) from public;
revoke execute on function public.claim_unclaimed_listing(uuid, text, text, text) from anon, authenticated;

-- 4. Signup: claim if the email is already verified at insert time, otherwise
--    behave exactly as before (0011).
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer as $$
declare
  v_provider text := case when new.raw_app_meta_data->>'provider' = 'google' then 'google' else 'password' end;
  v_avatar text := coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture');
begin
  if new.email_confirmed_at is not null
     and public.claim_unclaimed_listing(new.id, new.email, v_provider, v_avatar) then
    return new;
  end if;

  insert into public.users (id, email, auth_provider, full_name, avatar_url)
  values (
    new.id,
    new.email,
    v_provider,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    v_avatar
  )
  on conflict (email) do nothing;
  return new;
end;
$$;

-- 5. Verification: the moment an email becomes verified, claim if this auth
--    user has no users row of its own yet (it was skipped at insert because
--    the email was taken by an unclaimed listing).
create or replace function public.handle_user_email_confirmed() returns trigger
language plpgsql security definer as $$
begin
  if not exists (select 1 from public.users where id = new.id) then
    perform public.claim_unclaimed_listing(
      new.id,
      new.email,
      case when new.raw_app_meta_data->>'provider' = 'google' then 'google' else 'password' end,
      coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture')
    );
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_confirmed on auth.users;
create trigger on_auth_user_email_confirmed
  after update of email_confirmed_at on auth.users
  for each row
  when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
  execute function public.handle_user_email_confirmed();

-- 6. Admins can see which users rows are still unclaimed (admin-added
--    listings whose teacher has not signed up yet).
create or replace function public.admin_unclaimed_user_ids() returns setof uuid
language plpgsql security definer as $$
begin
  if not is_admin() then
    raise exception 'not authorized';
  end if;
  return query
    select u.id from public.users u
    where not exists (select 1 from auth.users a where a.id = u.id);
end;
$$;

grant execute on function public.admin_unclaimed_user_ids() to authenticated;
