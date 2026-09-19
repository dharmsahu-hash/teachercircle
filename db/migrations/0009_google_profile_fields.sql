-- "Keep information in the database" for Google sign-in, done properly:
-- the original handle_new_user() trigger (0001_core_schema.sql) only ever
-- copied id/email — it never actually set auth_provider despite the column
-- existing, and it discarded the name/photo Google hands over on every
-- sign-in. Fixing both real gaps here rather than leaving them.
alter table users add column full_name text;
alter table users add column avatar_url text;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer as $$
begin
  insert into public.users (id, email, auth_provider, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_app_meta_data->>'provider', 'password'),
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
