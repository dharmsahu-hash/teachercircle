-- Real bug found immediately after 0009 shipped: GoTrue's actual provider
-- string for email/password sign-in is "email", not "password" — the
-- previous trigger's coalesce() let that value pass straight through into
-- auth_provider, which has `check (auth_provider in ('google','password'))`.
-- Every email/password signup started failing with
-- "new row for relation \"users\" violates check constraint
-- \"users_auth_provider_check\"". Map explicitly instead of trusting
-- GoTrue's provider string to match ours.
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
  on conflict (id) do nothing;
  return new;
end;
$$;
