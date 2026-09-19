-- Auth glue needed because this stack combines a plain Postgres image with
-- standalone GoTrue + PostgREST (rather than the full Supabase docker bundle,
-- which provides this out of the box). Idempotent: safe to re-run.

-- No `create extension pgcrypto` needed: gen_random_uuid() (used throughout
-- these migrations) has been built into Postgres core since v13 — confirmed
-- working with zero extensions installed. Tried creating the extension
-- anyway defensively at first; on this image that fails with
-- "role \"supabase_admin\" does not exist" (CREATE EXTENSION is intercepted
-- and expects Supabase's own admin role), so leaving it out entirely is the
-- actual fix, not another compat role to invent.

-- GoTrue creates and owns everything else in the `auth` schema (auth.users, etc.)
-- the first time it boots against this database. We only add one function to it.
create schema if not exists auth;

create or replace function auth.uid() returns uuid
language sql stable
as $$
  select nullif(current_setting('request.jwt.claims', true)::json->>'sub', '')::uuid
$$;

-- PostgREST switches into one of these two Postgres roles per request, based on
-- the `role` claim GoTrue puts in the JWT (`authenticated` once logged in, or
-- PGRST_DB_ANON_ROLE for anonymous requests).
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end
$$;

-- The app's Postgres user (POSTGRES_USER, see docker-compose.yml) is what
-- PostgREST actually connects as; it must be a member of both roles above so
-- its `SET ROLE anon` / `SET ROLE authenticated` per request succeeds.
grant anon to teachercircle;
grant authenticated to teachercircle;

grant usage on schema public to anon, authenticated;
grant usage on schema auth to anon, authenticated;

-- is_admin() intentionally does NOT live here — see 0001_core_schema.sql.
-- Real bug found running this against actual Postgres (Tier 3 testing): it's
-- LANGUAGE SQL, and unlike plpgsql (whose body is opaque text until first
-- call), Postgres parses a plain SQL function's body at CREATE FUNCTION
-- time — so a forward reference to the not-yet-created `users` table fails
-- immediately, not later. The original comment here claiming this was safe
-- was wrong.
