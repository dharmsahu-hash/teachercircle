-- Free avatar picker: users choose a generated avatar (rendered from a seed
-- by lib/avatar.ts, no upload / no S3 / no external call) instead of
-- uploading a real photo. Only the seed is persisted; the image itself is
-- regenerated on every render, so this never grows storage.
alter table users add column if not exists avatar_seed text;

-- `users` has no direct UPDATE policy (see 0004_rls_policies.sql) — same
-- pattern as set_my_role() in 0002: a narrow SECURITY DEFINER function is the
-- only way a user can change their own row, and it validates the input
-- itself rather than trusting the client.
create or replace function set_my_avatar_seed(new_seed text)
returns void language plpgsql security definer as $$
begin
  if new_seed is null or new_seed !~ '^[a-zA-Z0-9_-]{1,40}$' then
    raise exception 'invalid avatar seed';
  end if;

  update users set avatar_seed = new_seed where id = auth.uid();

  if not found then
    raise exception 'user not found';
  end if;
end; $$;
