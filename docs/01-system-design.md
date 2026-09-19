# TeacherCircle — System Design (HLD)

A personal project, independent of any employer's platform or conventions. Every
component is open source and self-hostable for $0.

## 1. What it is

Students and parents search for a teacher by subject and city, read reviews, and
connect directly. Teachers list a free profile. Billing (a yearly subscription,
paid via UPI) exists in full but ships switched off — flip one database row to
turn it on.

## 2. Goals

- Google sign-in as the primary path, email/password as a fallback
- Full self-service profile lifecycle for every role: create, read, update, delete
- Admin console with the same four powers over any profile, audited
- $0 to deploy and to run at personal-project scale
- No rewrite needed to add real payment collection or to scale out later

## 3. Architecture

```
                         ┌─────────────────────────────────────────────┐
                         │        Docker host (one VM, $0 tier)         │
  Browser                │                                               │
  (student/parent/  ───► │  Caddy :80/:443  ── TLS, the only public door │
   teacher)              │     │        │                                │
                         │     │        └── /auth/* ──► GoTrue :9999      │
                         │     └── everything else ──► Next.js app :3000  │
                         │                                 │              │
                         │                    ┌────────────┼───────────┐ │
                         │                    ▼            ▼           ▼ │
                         │              PostgREST     Meilisearch   MinIO│
                         │               :3000          :7700      :9000│
                         │                    │                          │
                         │                    ▼                          │
                         │               Postgres :5432 (RLS everywhere) │
                         │                    ▲                          │
                         │                 Redis :6379 (reserved, unused │
                         │                 by the app yet — see LLD §7)  │
                         └─────────────────────────────────────────────┘
                                       │
                              Google OAuth (external,
                              identity only — GoTrue is
                              the only thing that talks to it)
```

Only GoTrue and the Next.js app are reachable from the public internet (via
Caddy). PostgREST, Meilisearch, MinIO, Postgres, and Redis exist only on the
Docker network — nothing outside the host can reach them directly. See
`infra/Caddyfile`.

## 4. Components

| Component | Image (pinned) | Role | Why this one |
|---|---|---|---|
| Next.js | built from `Dockerfile` | UI + all API routes | One container, no vendor lock-in |
| GoTrue | `supabase/gotrue:v2.164.0` | Auth — Google OAuth + email/password, issues JWTs | MIT-licensed, Google support built in, no custom auth code |
| PostgREST | `postgrest/postgrest:v12.2.0` | Auto-generated REST API over Postgres | Eliminates almost all CRUD boilerplate |
| Postgres | `postgres:16-alpine` | Single source of truth; Row-Level Security is the authorization layer | RLS means a frontend bug can't leak another user's row |
| Meilisearch | `getmeili/meilisearch:v1.10` | Reserved for typo-tolerant search | Running, not yet wired — see LLD §7 |
| Redis | `redis:7-alpine` | Reserved for the feature-flag cache | Running, not yet wired — see LLD §7 |
| MinIO | `minio/minio:...` | S3-compatible photo storage | Reserved, not yet wired into the profile form |
| Caddy | `caddy:2-alpine` | Reverse proxy, free auto-renewing TLS | Zero-config Let's Encrypt |

## 5. Cost

| Layer | Free option | What forces an upgrade |
|---|---|---|
| Compute | Oracle Cloud "Always Free" Ampere A1 (4 OCPU / 24GB RAM, forever) | Sustained load beyond ~4 cores |
| Hostname | DuckDNS free subdomain | None — free forever; a real domain (~$1–12/yr) is optional polish |
| CDN/WAF | Cloudflare free plan (optional, in front of DuckDNS) | Custom rule count |
| Identity | Google OAuth, free & unlimited for standard sign-in | The OAuth consent screen's "testing" user cap, until verified |
| Payment collection | Personal UPI QR — no platform fee | Needing auto-verification at real business scale |

## 6. Security model

- **Authentication**: Google OAuth (primary) or GoTrue-managed password hashing
  (fallback) — no custom credential code anywhere in this repo.
- **Authorization**: Postgres Row-Level Security on every table. See
  `db/migrations/0004_rls_policies.sql` and `0005_profile_lifecycle_admin.sql`.
- **Role integrity**: a new account's role is `NULL` until a one-time,
  database-enforced choice (`set_my_role()`, `0002_role_assignment.sql`) —
  never trusted from the client, and cannot be changed afterward.
- **Admin integrity**: every admin write to someone else's data goes through a
  named `SECURITY DEFINER` function that checks `is_admin()` and writes to
  `admin_audit_log` in the same transaction — never a raw table write. See LLD
  §5.
- **Deletion safety**: every delete, self or admin, is a soft-delete
  (`deleted_at`), never a destructive `DELETE`.
- **Attack surface**: only Caddy is publicly reachable; every backing service
  is internal-only in production (`docker-compose.prod.yml`).

## 7. Scalability path

Nothing below requires touching application code:

| Trigger | Response |
|---|---|
| App CPU sustained high at peak | Add app/PostgREST replicas behind Caddy in load-balancing mode |
| Search/report reads contending with writes | Add a Postgres streaming read replica |
| Admin payment-approval queue outgrows one reviewer | Add a second admin account — still manual by design until a payment gateway is worth the ~2% fee |
| Free-tier compute ceiling reached | Split Postgres/MinIO onto a second free-tier VM before paying for anything |

## 8. What's real vs. reserved right now

This is the honest current state, not the aspirational one:

| Working today | Reserved (container runs, not wired yet) |
|---|---|
| Google + email/password auth, role onboarding | Meilisearch-backed search (currently a Postgres view instead — see LLD §7) |
| Full profile CRUD, all three roles | Redis flag-caching (currently a direct Postgres call instead) |
| Search, connect, reviews | MinIO photo upload (profile form has no image picker yet) |
| UPI QR billing flow end to end, flag-gated | Razorpay/Cashfree gateway (Phase 2b, only if manual approval becomes the bottleneck) |
| Admin console: view/edit/delete any profile, audited | |
| Self-service account deletion (soft-delete) | |

See `README.md` in the repo root for the specific bugs found and fixed while
building this (an admin-check missing entirely from the payment-approval
function, a PII leak in a `users` table policy, and a completely unprotected
`parent_profile` table) — worth reading once so you know they were caught, not
missed.
