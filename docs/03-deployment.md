# TeacherCircle — Deployment

Two paths: local (your Mac, for development) and production (a free cloud VM,
for a real public URL). Both are $0.

---

## Part A — Local development

### Prerequisite: Docker Desktop

Installed and verified on this machine — the full stack below has actually been run,
not just described. See [docs/04-test-report.md](04-test-report.md) for the 106/106
passing checks, 31 of them against this real stack, and the real deployment bugs found
and fixed getting it there (a stale PostgREST schema cache, a missing GoTrue connection
role, an image that no longer pulls without login, and more).

### Run it

```bash
cd "/Users/dharmendrakumar/Desktop/my_data/project/Teacher_Circle"
docker compose up -d --build
docker compose ps                # wait until postgres shows healthy
./db/bootstrap.sh                # required — see docker-compose.yml for why
docker compose ps gotrue         # wait until gotrue shows healthy too
./db/run-migrations.sh           # also reloads PostgREST's schema cache
open http://localhost:3000
```

GoTrue will show `Restarting` for a bit after step 1 — that's expected; it
crash-loops harmlessly until `bootstrap.sh` runs, then recovers on its own
next retry (usually well under 60s, no restart needed).

Sign up with email/password (Google isn't configured locally by default),
pick a role, and if "teacher," fill in a profile. Open an incognito window,
sign up as "student," search, connect, and review.

### Becoming an admin locally

```bash
docker compose exec postgres psql -h 127.0.0.1 -U teachercircle -d postgres \
  -c "update users set role = 'admin' where email = 'you@example.com';"
```

Full local details, including enabling Google OAuth and the billing flag, live
in the repo's `README.md`.

---

## Part B — Production (free)

### Accounts needed (all $0)

| Account | Cost | Note |
|---|---|---|
| Oracle Cloud Free Tier | $0 | Card required for identity verification; Always Free resources are never billed while you stay within them |
| DuckDNS | $0 | Free subdomain, real DNS, works with Let's Encrypt |
| Google Cloud Console | $0 | OAuth client creation is free and unmetered |
| Cloudflare (optional) | $0 | CDN/WAF in front of the DuckDNS hostname |

### Step 1 — Provision the VM

```bash
# Oracle Cloud console: Compute → Instances → Create Instance
#   Shape: VM.Standard.A1.Flex — 4 OCPU, 24 GB memory (Always Free)
#   Image: Canonical Ubuntu 22.04
ssh-keygen -t ed25519 -C "teachercircle" -f ~/.ssh/teachercircle
# upload ~/.ssh/teachercircle.pub as the instance's SSH key

# Networking → your VCN → Security Lists → Default Security List:
#   add ingress rules for 0.0.0.0/0, TCP, ports 80 and 443 (in addition to the
#   default 22)
```

### Step 2 — DNS

```bash
# duckdns.org → sign in → create subdomain "teachercircle" (or your choice)
# → point it at the VM's public IP
dig +short teachercircle.duckdns.org   # confirm it resolves before continuing
```

### Step 3 — Server bootstrap

```bash
ssh -i ~/.ssh/teachercircle ubuntu@teachercircle.duckdns.org

curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
newgrp docker

sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable
```

### Step 4 — Google OAuth credentials

```
console.cloud.google.com → new project → APIs & Services → OAuth consent screen
  (External, fill app name/support email)
→ Credentials → Create Credentials → OAuth client ID → Web application
  Authorized redirect URI: https://teachercircle.duckdns.org/auth/callback
```

Copy the Client ID and Secret for step 5. Note: a new consent screen starts in
"Testing" mode with a 100-test-user cap — submit for verification before you
expect to exceed that.

### Step 5 — Clone, configure, boot

```bash
git clone <your-repo-url> teachercircle
cd teachercircle
cp .env.production.example .env

# generate secrets
sed -i "s#^DB_PASSWORD=.*#DB_PASSWORD=$(openssl rand -hex 24)#" .env
sed -i "s#^JWT_SECRET=.*#JWT_SECRET=$(openssl rand -base64 48 | tr -d '\n')#" .env
sed -i "s#^MEILI_MASTER_KEY=.*#MEILI_MASTER_KEY=$(openssl rand -hex 24)#" .env
sed -i "s#^MINIO_ROOT_PASSWORD=.*#MINIO_ROOT_PASSWORD=$(openssl rand -hex 16)#" .env

nano .env   # fill in APP_HOSTNAME (if different), GOOGLE_CLIENT_ID/SECRET, UPI_PAYEE_VPA

docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml ps   # wait until postgres shows healthy
```

### Step 6 — Bootstrap, then migrate

GoTrue's bundled migrations need a few things this Postgres image doesn't
provision on its own — the `auth` schema, a role literally named `postgres`,
and a dedicated connection role with `search_path` set to `auth` (GoTrue's
own migrations and runtime queries use unqualified table/type names) — found
by actually running this stack, not documented anywhere obvious. It
crash-loops harmlessly until this runs, then recovers on its own within
~60s — no restart needed.

```bash
source .env   # brings DB_PASSWORD into scope for the gotrue_conn script below

for f in db/init/*.sql; do
  echo "Applying $f"
  docker compose -f docker-compose.prod.yml exec -T postgres \
    psql -v ON_ERROR_STOP=1 -h 127.0.0.1 -U teachercircle -d postgres \
    -v db_password="$DB_PASSWORD" < "$f"
done

# Wait for gotrue to show "healthy" here (docker compose -f
# docker-compose.prod.yml ps gotrue) before continuing — it needs to have
# already created auth.users.

for f in db/migrations/*.sql; do
  echo "Applying $f"
  docker compose -f docker-compose.prod.yml exec -T postgres \
    psql -v ON_ERROR_STOP=1 -h 127.0.0.1 -U teachercircle -d postgres < "$f"
done

# PostgREST caches the schema at startup and won't notice the tables/RPCs
# the migrations above just created until told to — found running this for
# real, not a hypothetical edge case.
docker compose -f docker-compose.prod.yml exec -T postgres \
  psql -h 127.0.0.1 -U teachercircle -d postgres -c "NOTIFY pgrst, 'reload schema';"
```

### Step 7 — Verify

```bash
curl -I https://teachercircle.duckdns.org        # HTTP/2 200, valid Let's Encrypt cert
curl https://teachercircle.duckdns.org/auth/health
```

Then in a browser: sign in with Google end to end, complete role onboarding,
create a teacher profile, search, connect, review.

### Step 8 — First admin (production)

Same one-time DB promotion as local:

```bash
docker compose -f docker-compose.prod.yml exec postgres psql -h 127.0.0.1 -U teachercircle -d postgres \
  -c "update users set role = 'admin' where email = 'you@example.com';"
```

### Step 9 — Backups (recommended, still $0)

```bash
# crontab -e — nightly dump, kept 7 days locally
0 2 * * * docker compose -f /home/ubuntu/teachercircle/docker-compose.prod.yml exec -T postgres \
  pg_dump -U teachercircle teachercircle | gzip > /home/ubuntu/backups/db-$(date +\%F).sql.gz && \
  find /home/ubuntu/backups -mtime +7 -delete
```

Optionally push these to Cloudflare R2's free 10GB tier for off-VM durability.

### Step 10 — Turning on billing

Everything (UPI QR, submit-reference, admin approval) works right now with
zero effect on any user. To actually enforce the free-tier limits:

```bash
docker compose -f docker-compose.prod.yml exec postgres psql -h 127.0.0.1 -U teachercircle -d postgres \
  -c "update feature_flags set enabled = true where key = 'payments_enabled';"
```

Roll back the same way with `enabled = false` — instant, and any subscription
already purchased is untouched.

### Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Caddy won't issue a TLS cert | Port 80 blocked, or DNS hasn't propagated | Re-check the security list + `ufw`; `dig` the hostname before retrying |
| Google sign-in errors after redirect | Redirect URI mismatch | Must exactly match `https://<APP_HOSTNAME>/auth/callback` in both Google Console and `.env` |
| `/connect` always returns 402 with the flag off | Stale app process, not a stale cache (Redis isn't wired to the flag yet — see LLD §7) | `docker compose -f docker-compose.prod.yml restart app` |
| Oracle reclaims the Always Free instance | Rare, but documented for underused resources in some regions | Keep it lightly active; redeploy is a ~20-minute re-run of steps 1–6 |
