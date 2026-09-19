#!/usr/bin/env sh
# Applies db/init/*.sql directly, in order, against the running postgres
# container — required before GoTrue can boot successfully.
#
# Real finding from running this stack end to end for the first time:
# supabase/postgres's custom entrypoint does NOT execute
# /docker-entrypoint-initdb.d/*.sql the way the standard Postgres image does
# — confirmed by checking startup logs for the log lines that convention
# normally prints, on a genuinely fresh volume, with the scripts correctly
# mounted and readable. The docker-compose.yml volume mount is left in place
# as a harmless no-op (it may help on a future image variant), but this
# script — run manually, once, right after `postgres` reports healthy and
# before the rest of the stack starts — is what actually works.
set -e
cd "$(dirname "$0")/.."

# shellcheck disable=SC1091
. ./.env   # brings DB_PASSWORD into scope for the -v below

for f in db/init/*.sql; do
  echo "==> Applying $f"
  docker compose exec -T postgres psql -v ON_ERROR_STOP=1 -h 127.0.0.1 -U teachercircle -d postgres \
    -v db_password="$DB_PASSWORD" < "$f"
done

echo "==> Bootstrap complete. Safe to start/restart gotrue now."
