alter table users add column deleted_at timestamptz;
alter table teacher_profile add column deleted_at timestamptz;
alter table parent_profile add column deleted_at timestamptz;
alter table student_profile add column deleted_at timestamptz;

-- Relocated here from 0001_core_schema.sql (see the note left there) —
-- LANGUAGE SQL functions are parsed at CREATE time, so this must come after
-- `users.deleted_at` exists, which is the `alter table` right above.
create or replace function is_admin() returns boolean
language sql stable as $$
  select exists (
    select 1 from users where id = auth.uid() and role = 'admin' and deleted_at is null
  );
$$;

-- self-service: any authenticated user may delete only their own account
create or replace function set_my_deleted() returns void language plpgsql security definer as $$
begin
  update users set deleted_at = now(), email = 'deleted-' || id || '@teachercircle.invalid'
  where id = auth.uid();
  update teacher_profile set is_listed = false, deleted_at = now() where user_id = auth.uid();
  update parent_profile set deleted_at = now() where user_id = auth.uid();
end; $$;

create table admin_audit_log (
  id           uuid primary key default gen_random_uuid(),
  actor_id     uuid references users(id) not null,
  target_table text not null,
  target_id    uuid not null,
  action       text not null check (action in ('create','update','delete')),
  created_at   timestamptz default now()
);

-- every admin write checks is_admin() itself and logs itself — never a raw table write
create or replace function admin_create_teacher_profile(target_user_id uuid, p_name text, p_city text)
returns void language plpgsql security definer as $$
begin
  if not is_admin() then raise exception 'not authorized'; end if;
  insert into teacher_profile (user_id, name, city) values (target_user_id, p_name, p_city)
  on conflict (user_id) do nothing;
  insert into admin_audit_log (actor_id, target_table, target_id, action)
  values (auth.uid(), 'teacher_profile', target_user_id, 'create');
end; $$;

create or replace function admin_update_teacher_profile(target_user_id uuid, patch jsonb)
returns void language plpgsql security definer as $$
begin
  if not is_admin() then raise exception 'not authorized'; end if;
  update teacher_profile set
    name = coalesce(patch->>'name', name),
    bio = coalesce(patch->>'bio', bio),
    city = coalesce(patch->>'city', city),
    subjects = coalesce((select array_agg(x) from jsonb_array_elements_text(patch->'subjects') x), subjects),
    rate_per_hour = coalesce((patch->>'rate_per_hour')::numeric, rate_per_hour),
    is_listed = coalesce((patch->>'is_listed')::boolean, is_listed)
  where user_id = target_user_id;
  insert into admin_audit_log (actor_id, target_table, target_id, action)
  values (auth.uid(), 'teacher_profile', target_user_id, 'update');
end; $$;

create or replace function admin_soft_delete_profile(target_user_id uuid)
returns void language plpgsql security definer as $$
begin
  if not is_admin() then raise exception 'not authorized'; end if;
  update users set deleted_at = now() where id = target_user_id;
  update teacher_profile set is_listed = false, deleted_at = now() where user_id = target_user_id;
  update parent_profile set deleted_at = now() where user_id = target_user_id;
  update student_profile set deleted_at = now() where parent_id = target_user_id;
  insert into admin_audit_log (actor_id, target_table, target_id, action)
  values (auth.uid(), 'users', target_user_id, 'delete');
end; $$;

create or replace function admin_restore_profile(target_user_id uuid)
returns void language plpgsql security definer as $$
begin
  if not is_admin() then raise exception 'not authorized'; end if;
  update users set deleted_at = null where id = target_user_id;
  update teacher_profile set deleted_at = null where user_id = target_user_id;
  update parent_profile set deleted_at = null where user_id = target_user_id;
  update student_profile set deleted_at = null where parent_id = target_user_id;
  insert into admin_audit_log (actor_id, target_table, target_id, action)
  values (auth.uid(), 'users', target_user_id, 'update');
end; $$;

-- admin read access (write access goes only through the functions above, never direct)
create policy users_admin_read on users for select using (is_admin());
create policy teacher_admin_read on teacher_profile for select using (is_admin());
create policy parent_admin_read on parent_profile for select using (is_admin());
create policy student_admin_read on student_profile for select using (is_admin());
-- Needed for the admin payments-approval console (§9 of the runbook) to list
-- pending submissions at all — without this, is_admin() is true but RLS still
-- hides every row since neither table had an admin-facing read policy.
create policy subscription_admin_read on subscription for select using (is_admin());
create policy txn_admin_read on payment_transaction for select using (is_admin());

-- the audit's finding: 0004 never enabled RLS or added any policy on parent_profile at all
alter table parent_profile enable row level security;
create policy parent_owner_all on parent_profile for all using (auth.uid() = user_id);

-- soft-deleted profiles must vanish from public search exactly like paused ones do
drop policy if exists teacher_public_read on teacher_profile;
create policy teacher_public_read on teacher_profile for select using (is_listed and deleted_at is null);

alter table admin_audit_log enable row level security;
create policy audit_admin_read on admin_audit_log for select using (is_admin());
-- no insert/update/delete policy for regular sessions: only the SECURITY DEFINER
-- functions above write to this table, and they run as the table owner, which
-- bypasses RLS — that's what makes the log tamper-proof from the API surface.
