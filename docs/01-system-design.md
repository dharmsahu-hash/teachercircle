# TeacherCircle — System Design (HLD)

A personal project, independent of any employer's platform or conventions. Every
component is open source and self-hostable for $0.

> **Updated 2026-09-20** to reflect what's actually deployed and built today —
> the original version of this doc described a self-hosted Oracle Cloud VM +
> Caddy production plan that was never actually deployed (blocked on requiring
> a credit card for identity verification, see `docs/03-deployment.md`). Local
> dev still runs that full self-hosted stack; production runs on Vercel +
> Supabase Cloud instead (§3b). This revision also adds everything shipped
> since the first version: in-app messaging, report/block, rate limiting,
> SEO, lightweight verification, response-time signals, saved teachers, and
> dark mode.

## 1. What it is

Students and parents search for a teacher by subject and city, read reviews, and
connect directly — then message the teacher in-app once connected. Teachers list
a free profile. Billing (a yearly subscription, paid via UPI) exists in full but
ships switched off — flip one database row to turn it on.

## 2. Goals

- Google sign-in as the primary path, email/password as a fallback
- Full self-service profile lifecycle for every role: create, read, update, delete
- Admin console with the same four powers over any profile, audited, plus a
  message-report moderation queue
- A safe messaging surface: report + mutual block, not just "send a message and hope"
- $0 to deploy and to run at personal-project scale
- No rewrite needed to add real payment collection or to scale out later
- A real, if lightweight, organic growth channel (SEO) — no ad budget, no commission

## 3a. Architecture — local development

```
                         ┌─────────────────────────────────────────────┐
                         │        Docker Compose (this machine)         │
  Browser                │                                               │
  (student/parent/  ───► │  Next.js app :3000 — UI + all API routes     │
   teacher)              │     │        │                                │
                         │     │        └── /auth/* ──► GoTrue :9999      │
                         │     └── everything else ──► PostgREST :3001   │
                         │                                 │              │
                         │                    ┌────────────┼───────────┐ │
                         │                    ▼            ▼           ▼ │
                         │              Postgres :5432  Meilisearch  MinIO│
                         │           (RLS everywhere)    :7700      :9000│
                         │                    ▲          (unused)  (unused)│
                         │                 Redis :6379 (reserved,        │
                         │                 unused — see LLD §7)          │
                         └─────────────────────────────────────────────┘
```

This is the full self-hosted stack, still used for all local development and
the Tier 3 (real-stack) test suite. See `docs/03-deployment.md` Part A.

## 3b. Architecture — production (what's actually deployed)

```
        Browser  ───────►  Vercel (Next.js app + all API routes)
                                │           │
                                │           └──► Brevo (transactional email —
                                │                message notifications, separate
                                │                from Supabase Auth's own mailer)
                                ▼
                        Supabase Cloud project
                        ┌─────────────────────────────┐
                        │  Kong gateway (/rest/v1,     │
                        │  /auth/v1 — requires apikey  │
                        │  header on every request)    │
                        │        │            │        │
                        │        ▼            ▼        │
                        │   PostgREST      GoTrue       │
                        │   (auto REST)   (Google OAuth │
                        │        │         + password)  │
                        │        ▼                      │
                        │   Postgres (RLS everywhere)   │
                        └─────────────────────────────┘
```

Meilisearch/Redis/MinIO are **not deployed to production at all** — none of
them are wired into the app yet (see §8), so there's nothing to pay for or
manage. Supabase Cloud's Postgres+GoTrue+PostgREST *is* the same stack as
local dev's — `db/migrations/*.sql` applies almost unchanged (skip only
`0000_bootstrap.sql`, which exists purely to patch things Supabase already
provides). Full walkthrough: `docs/03-deployment.md` Part B.

**Critical operational note, learned the hard way this session**: PostgREST
caches the database schema at startup and never notices a new table, view, or
function on its own. Every migration that adds one must be followed by
`NOTIFY pgrst, 'reload schema';` — `db/run-migrations.sh` already does this
automatically when applying a batch, but a migration applied by hand while
iterating needs it run manually afterward. Skipping this doesn't error
loudly — it makes the new capability silently a 404/500 on the specific
endpoint that needs it, which is worse.

## 4. Components

| Component | Image (pinned) | Role | Production equivalent |
|---|---|---|---|
| Next.js | built from `Dockerfile` | UI + all API routes | Vercel (same code, `output: standalone` build) |
| GoTrue | `supabase/gotrue:v2.164.0` | Auth — Google OAuth + email/password, issues JWTs | Supabase Cloud's managed GoTrue |
| PostgREST | `postgrest/postgrest:v12.2.0` | Auto-generated REST API over Postgres | Supabase Cloud's managed PostgREST (behind Kong) |
| Postgres | `postgres:16-alpine` | Single source of truth; Row-Level Security is the authorization layer | Supabase Cloud's managed Postgres |
| Brevo | (external API, no container) | Transactional email — message notifications | Same in both environments; local dev no-ops without an API key |
| Meilisearch | `getmeili/meilisearch:v1.10` | Reserved for typo-tolerant search | Not deployed to production — see §8 |
| Redis | `redis:7-alpine` | Reserved for the feature-flag cache | Not deployed to production — see §8 |
| MinIO | `minio/minio:...` | S3-compatible photo storage | Not deployed to production — see §8 |

## 5. Cost

| Layer | Free tier used | What forces an upgrade |
|---|---|---|
| App hosting | Vercel Hobby plan | Sustained load beyond the Hobby plan's limits, or needing a team |
| Database + Auth + REST | Supabase Cloud free project | Free projects pause after 7 days idle (§3b's keep-alive note in the deployment doc addresses this); real usage growth eventually needs a paid tier |
| Email | Brevo free transactional tier | Volume beyond Brevo's free-tier send cap |
| Identity | Google OAuth, free & unlimited for standard sign-in | The OAuth consent screen's "testing" user cap, until verified |
| Payment collection | Personal UPI QR — no platform fee | Needing auto-verification at real business scale |

## 6. Security model

- **Authentication**: Google OAuth (primary) or GoTrue-managed password hashing
  (fallback) — no custom credential code anywhere in this repo.
- **Authorization**: Postgres Row-Level Security on every table, including
  every table added this session (`conversation`, `message`, `blocked_user`,
  `message_report`, `favorite_teacher`, `rate_limit_hit`). See
  `db/migrations/0004_rls_policies.sql` onward.
- **Role integrity**: a new account's role is `NULL` until a one-time,
  database-enforced choice (`set_my_role()`, `0002_role_assignment.sql`) —
  never trusted from the client, and cannot be changed afterward.
- **Admin integrity**: every admin write to someone else's data goes through a
  named `SECURITY DEFINER` function that checks `is_admin()` and writes to
  `admin_audit_log` in the same transaction — never a raw table write. See LLD
  §5. `is_admin()` itself is `security definer` — a real, severe bug
  (infinite recursion on Supabase's Postgres specifically) existed here until
  fixed this session; see `docs/04-test-report.md` §3i.
- **Trust & safety**: mutual block (either party blocking the other silences
  the whole conversation, not just their own view of it) and a report queue
  reviewed via `/admin/reports`. See LLD §9.
- **Rate limiting**: a Postgres-backed fixed-window limiter
  (`check_rate_limit()`, `0021_rate_limiting.sql`) on login, signup, messages,
  reviews, and reports — no Redis dependency. See LLD §10.
- **Deletion safety**: every user-facing delete, self or admin, is a
  soft-delete (`deleted_at`), never a destructive `DELETE`. (Direct hard
  deletes have been used exactly once, outside any application code path, to
  remove this session's own leftover test/verification accounts from the
  production database — never for real user data.)
- **HTTP security headers**: `X-Frame-Options`, `X-Content-Type-Options`,
  `Referrer-Policy`, `Permissions-Policy`, HSTS (`next.config.mjs`).
  Deliberately no CSP yet — see LLD §10 for why.
- **Password strength**: enforced server-side (`lib/password.ts`), not just a
  client-side `minLength` — the client check alone is trivially bypassed by
  calling the API directly.
- **Attack surface**: in production, only Vercel's edge network and
  Supabase's Kong gateway are publicly reachable — Postgres/GoTrue/PostgREST
  are never directly internet-facing. In local dev, only Caddy would be
  public in the (unused) self-hosted-production plan; the Docker Compose dev
  stack itself has no such boundary since it's local-only.

## 7. Scalability path

Nothing below requires touching application code:

| Trigger | Response |
|---|---|
| App compute sustained high at peak | Upgrade Vercel plan, or move to a dedicated VM/container host behind a load balancer |
| Search/report reads contending with writes | Add a Postgres read replica (Supabase Cloud supports this on paid tiers) |
| Admin payment-approval or report-moderation queue outgrows one reviewer | Add a second admin account — still manual by design until volume justifies automation |
| Free Supabase tier ceiling reached | Upgrade to a paid Supabase plan — no migration needed, same connection strings |

## 8. What's real vs. reserved right now

This is the honest current state, not the aspirational one:

| Working today | Reserved (local container runs, not wired anywhere) |
|---|---|
| Google + email/password auth, role onboarding | Meilisearch-backed search (currently a Postgres view instead — see LLD §7) |
| Full profile CRUD, all three roles | Redis flag-caching (currently a direct Postgres call instead) |
| Search, connect, reviews, in-app messaging with email notification | MinIO photo upload (profile form has no image picker yet) |
| Report + mutual block in messaging, admin moderation queue | Razorpay/Cashfree gateway (Phase 2b, only if manual approval becomes the bottleneck) |
| Rate limiting (login/signup/messages/reviews/reports) | |
| SEO: sitemap.xml, robots.txt, per-teacher metadata, schema.org JSON-LD | |
| Google Analytics + Google AdSense, config-gated (absent, not broken, until `NEXT_PUBLIC_GA_MEASUREMENT_ID`/`NEXT_PUBLIC_ADSENSE_CLIENT_ID` are set — see `docs/03-deployment.md` Step 9; the account signup and AdSense site review are real steps only you can do, in your own Google account) | |
| Lightweight teacher self-attestation ("self-declared, not a background check") | |
| Response-time signal, computed from real message timestamps | |
| Saved/favorite teachers | |
| Dark mode | |
| UPI QR billing flow end to end, flag-gated | |
| Admin console: view/edit/delete any profile, audited | |
| Self-service account deletion (soft-delete) | |
| City + subject SEO landing pages (`/tutors/[city]`, `/tutors/[city]/[subject]`), thin-content-guarded (404 if no real teacher), in `sitemap.xml` (see `docs/07-growth-review-2026-09-20.md` G1) | |
| `/tutors` browse hub — internal-linking scaffold to every city/subject landing page (G3) | |
| WhatsApp share button on teacher profiles, UTM-tagged (G2) | |
| Google Search Console verification support, config-gated on `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` (G4 — the Search Console signup/verification itself is a human step, see `docs/03-deployment.md`) | |
| Referral loop: shareable invite link on `/account`, `referred_by` tracked via `SECURITY DEFINER` RPCs, referral count shown to the inviter (G5) | |

See `README.md` in the repo root for the specific bugs found and fixed while
building all of this — including two severe ones caught only by testing
against the real production database rather than trusting local tests or a
clean migration apply (a block-enforcement RLS bug, and `is_admin()`
recursing infinitely on Supabase's specific Postgres build).
