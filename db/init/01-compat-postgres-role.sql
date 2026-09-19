-- Real bug found running Tier 3: GoTrue v2.164.0's own bundled migration
-- (20240612123726_enable_rls_update_grants.up.sql) hardcodes
-- `grant select on auth.<table> to postgres with grant option` — a Supabase
-- convention where the DB superuser is always literally named `postgres`.
-- This project's superuser is POSTGRES_USER=teachercircle (see
-- docker-compose.yml), so that role never existed and GoTrue crash-looped
-- with "ERROR: role \"postgres\" does not exist". A plain grantable role
-- (no LOGIN needed — nothing ever authenticates as it) is enough to satisfy
-- GoTrue's migration.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'postgres') THEN
    CREATE ROLE postgres;
  END IF;
END
$$;
