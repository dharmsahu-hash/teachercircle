#!/usr/bin/env sh
# Applies every migration in db/migrations, in filename order, against the
# running postgres container. Safe to re-run: every statement in these files
# is idempotent (create-or-replace / if-not-exists / drop-if-exists).
set -e
cd "$(dirname "$0")/.."

for f in db/migrations/*.sql; do
  echo "==> Applying $f"
  # -d postgres, not -d teachercircle: the supabase/postgres image doesn't
  # honor a custom POSTGRES_DB name — see docker-compose.yml. -h 127.0.0.1
  # forces a host (trust-authenticated) connection instead of the local
  # socket, which uses peer auth and rejects `teachercircle` — found while
  # running this for real.
  docker compose exec -T postgres psql -v ON_ERROR_STOP=1 -h 127.0.0.1 -U teachercircle -d postgres < "$f"
done

echo "==> All migrations applied."

# Real bug found running this against the live stack (Tier 3): PostgREST
# caches the database schema at startup and does NOT notice new
# tables/functions on its own — every table/RPC created by the migrations
# above is invisible to it (404 "Could not find the function/table ... in
# the schema cache") until it's told to reload. PostgREST's own documented
# mechanism is a Postgres NOTIFY; no restart needed.
echo "==> Reloading PostgREST's schema cache"
docker compose exec -T postgres psql -v ON_ERROR_STOP=1 -h 127.0.0.1 -U teachercircle -d postgres \
  -c "NOTIFY pgrst, 'reload schema';"
