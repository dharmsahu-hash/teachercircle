-- Real bug found running Tier 3 (the deepest one yet): GoTrue's migrations
-- schema-qualify everything (`auth.users`, `auth.identities`, ...) and
-- succeed fine, but its RUNTIME query layer does NOT — it queries bare
-- `identities`, `users`, etc. and relies on the connecting role's
-- search_path already including `auth`. Signup failed with "relation
-- \"identities\" does not exist" even though the table existed, because
-- `teachercircle`'s search_path is the Postgres default ("$user", public).
--
-- Simply adding `auth` to teachercircle's search_path is NOT safe: this
-- app's own `public.users` table has the same unqualified name as
-- `auth.users`, and our own functions/policies reference `users`
-- unqualified too (resolved at execution time, not frozen at creation) — so
-- putting `auth` anywhere in that shared role's search_path risks our own
-- queries silently hitting GoTrue's table instead of ours.
--
-- The real Supabase stack solves this with a dedicated role per service
-- (supabase_auth_admin for GoTrue, with search_path = auth). Same fix here:
-- a separate connection role, used only by GOTRUE_DB_DATABASE_URL.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gotrue_conn') THEN
    CREATE ROLE gotrue_conn LOGIN SUPERUSER;
  END IF;
END
$$;

-- A real password is required here even though the loopback (-h 127.0.0.1,
-- from inside the postgres container) connection this script itself runs
-- over is "trust"-authenticated — GoTrue connects from its OWN container,
-- over the Docker network, where pg_hba.conf requires SASL/password auth.
-- Passed in via psql -v by db/bootstrap.sh, sourced from .env's DB_PASSWORD
-- (same secret teachercircle uses — one shared internal-network secret is a
-- reasonable simplification here, never exposed outside the Docker network).
ALTER ROLE gotrue_conn PASSWORD :'db_password';
ALTER ROLE gotrue_conn SET search_path = auth, public;
