-- New capability: admin can add a teacher directly to the directory — for
-- onboarding a real tutor found offline (phone/WhatsApp) who isn't ready to
-- self-register yet. Deliberately distinct from admin_create_teacher_profile
-- (0005), which requires an already-registered user: this one creates the
-- `users` row itself, with no login identity attached.
--
-- Known, accepted limitation (same class of thing this project has deferred
-- before — see the design doc's scope note on profile pre-provisioning):
-- if that same email later signs up for real (Google/password), GoTrue will
-- create a NEW auth.users row with a NEW id, and the two will not be linked
-- automatically — there is no "claim your listing" flow yet. What this
-- migration DOES fix is that such a signup no longer crashes: the trigger
-- used to conflict-target `(id)`, which can never collide for a genuinely
-- new signup but also doesn't protect against the email already existing
-- from an admin-added row — that insert would hit the separate UNIQUE
-- constraint on email and abort the whole signup transaction with a 500.
-- Targeting `(email)` instead makes a collision a silent no-op rather than
-- a crash; the person's fresh login just won't be linked to the admin's
-- listing until a real claim flow exists.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer as $$
begin
  insert into public.users (id, email, auth_provider, full_name, avatar_url)
  values (
    new.id,
    new.email,
    case when new.raw_app_meta_data->>'provider' = 'google' then 'google' else 'password' end,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture')
  )
  on conflict (email) do nothing;
  return new;
end;
$$;

create or replace function admin_add_teacher(
  p_email text,
  p_name text,
  p_city text,
  p_subjects text[],
  p_rate_per_hour numeric,
  p_experience_years int,
  p_contact_email text,
  p_contact_phone text
) returns uuid
language plpgsql security definer as $$
declare new_id uuid;
begin
  if not is_admin() then
    raise exception 'not authorized';
  end if;

  insert into users (email, role, full_name)
  values (p_email, 'teacher', p_name)
  on conflict (email) do nothing
  returning id into new_id;

  if new_id is null then
    raise exception 'a user with this email already exists';
  end if;

  insert into teacher_profile (
    user_id, name, city, subjects, rate_per_hour, experience_years,
    contact_email, contact_phone, is_listed
  ) values (
    new_id, p_name, p_city, coalesce(p_subjects, '{}'), p_rate_per_hour, p_experience_years,
    p_contact_email, p_contact_phone, true
  );

  insert into admin_audit_log (actor_id, target_table, target_id, action)
  values (auth.uid(), 'teacher_profile', new_id, 'create');

  return new_id;
end;
$$;
