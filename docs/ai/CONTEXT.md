# TeacherCircle — AI context

Generated 2026-09-30 from a full read of the repository (code, migrations `0000`–`0025`, and `docs/01`–`docs/07`). This is the context a new agent should load before editing. The short operating rules are in the repo-root `AGENTS.md`. The intended external copy is [KnowledgeWala_AI_CONTEXT](https://github.com/dharmsahu-hash/KnowledgeWala_AI_CONTEXT) at `projects/teachercircle/CONTEXT.md`. That repo was empty on this date, and the cloud agent token cannot push to it.

Owner remote: `https://github.com/dharmsahu-hash/teachercircle`. Production: `https://teachercircle.vercel.app`.

## Product

Students and parents find a teacher by subject and city, read feedback, connect, and message in the app. Teachers publish a free listing. A yearly subscription paid by personal UPI QR exists end to end and is switched off. The product is India-first (INR, UPI, WhatsApp share, Hinglish profanity list) and is a personal project, independent of any employer stack.

Roles: `student`, `parent`, `teacher`, `admin`. A new account has `role = null` until `set_my_role()`. Admin is not choosable there.

## Runtime

| | Local | Production |
|---|---|---|
| App | Next.js on `:3000` (`output: "standalone"`) | Vercel |
| Data API | PostgREST `:3001` | Supabase Kong `/rest/v1` |
| Auth | GoTrue `:9999` (`supabase/gotrue:v2.164.0`) | Supabase GoTrue `/auth/v1` |
| Database | `postgres:16-alpine` | Supabase Postgres |
| Email | Brevo HTTP API, no-op without a key | Same |

Meilisearch `:7700`, Redis `:6379`, and MinIO `:9000` start in `docker-compose.yml` and are not called by application code. They are not deployed in production.

Session cookie: `tc_session`, httpOnly, `SameSite=Lax`, `secure` in production. The access token is a GoTrue JWT, checked for `exp` in `lib/auth.ts`, then the `users` row is loaded. There is no server-side revocation list.

Google OAuth is the primary sign-in; email/password is the fallback. Local GoTrue redirect is `http://localhost:9999/callback`. Production GoTrue redirect is `https://<project-ref>.supabase.co/auth/v1/callback`. `getAppBaseUrl()` (`lib/url.ts`) builds this app's public origin. A public `APP_HOSTNAME` wins; otherwise a public request host or `VERCEL_PROJECT_PRODUCTION_URL` wins over `localhost`. Signup passes `${getAppBaseUrl(requestHost)}/auth/callback` as the `redirect_to` **query parameter** on `POST /signup`. GoTrue's signup JSON schema has no `redirect_to` field; a body property is dropped. GoTrue also drops a `redirect_to` whose host is not the Supabase Site URL and not on the Redirect URLs allow-list, then the email uses Site URL (this was `http://localhost:3000`). Logout uses `getAppBaseUrl()` and status 303.

## Request path

Browser → Next.js route handler or server component → `pg()` / `pgRpc()` with the user JWT → PostgREST → Postgres RLS.

`lib/db.ts` sets `Prefer: return=representation`, `cache: "no-store"`, and `apikey` only when `SUPABASE_API_KEY` is set. Supabase Kong returns 401 without that header even if the bearer token is valid. Errors throw `PostgrestError` whose message includes the raw body. Many routes return `err.message` to the client. That leak is a known open issue (`docs/05` finding #1), not something to copy into new routes if you are touching them anyway.

## Schema map

Migrations are ordered and append-only. Later files replace views and functions; read the latest definition, not the first.

| Area | Objects | Migration |
|---|---|---|
| Bootstrap for plain Postgres | `auth.uid()`, `anon`/`authenticated` roles, grants | `0000` — skip on Supabase |
| Core | `users`, `teacher_profile`, `parent_profile`, `student_profile`, `review`, `contact_request`, `handle_new_user` | `0001` |
| Role | `set_my_role()` | `0002` |
| Billing | `feature_flags`, `plan_limits`, `subscription`, `payment_transaction`, `approve_payment` (admin-checked) | `0003` |
| RLS | policies; public teacher email removed | `0004` |
| Lifecycle | `deleted_at`, `is_admin`, `admin_audit_log`, admin profile RPCs, `parent_profile` RLS | `0005` |
| Grants | | `0006` |
| Search | `teacher_public` view (rating aggregate, no email) | `0007`, refreshed in `0013`, `0022` |
| Connect | `reveal_teacher_contact()` | `0008` |
| Google profile fields | | `0009` |
| Provider mapping | GoTrue `"email"` → our `'password'` check | `0010` |
| Admin-created listing | `admin_add_teacher`; trigger conflict target `(email)` | `0011` |
| Avatar | `set_my_avatar_seed` | `0012` |
| Public avatar | avatar columns on `teacher_public` | `0013` |
| Account phone/name | `users.phone`, `set_my_contact_info` | `0014` |
| Messaging | `conversation`, `message`, `conversation_thread` | `0015`, view replaced in `0017`, `0018`, `0019` |
| Partner email for notifications | `get_conversation_partner_email` | `0016` |
| Read state | `mark_conversation_read` | `0017` |
| Trust | `blocked_user`, `message_report`, `are_users_blocked` | `0018`, unblock UI `0019` |
| Admin recursion fix | `is_admin()` security definer | `0020` |
| Rate limit | `rate_limit_hit`, `check_rate_limit` | `0021` |
| Trust signals | `self_attested_at`, `teacher_response_time` | `0022` |
| Restore lists again | `admin_restore_profile` sets `is_listed` | `0023` |
| Favorites | `favorite_teacher` | `0024` |
| Referrals | `users.referred_by`, `set_referred_by`, `get_referral_count` | `0025` |

`handle_new_user` is redefined in `0001`, `0009`, `0010`, and `0011`. The live body is the `0011` version.

## App surface

Pages: `/`, `/login`, `/auth/callback`, `/onboarding/role`, `/search`, `/teacher/[id]`, `/teacher/profile`, `/tutors`, `/tutors/[city]`, `/tutors/[city]/[subject]`, `/messages`, `/messages/[id]`, `/favorites`, `/account`, `/billing/subscribe`, `/admin/users`, `/admin/users/[id]`, `/admin/teachers/new`, `/admin/payments`, `/admin/reports`, `/about`, `/privacy`.

API groups: `app/api/auth/*`, `account/*`, `teacher/profile`, `search`, `connect/[teacherId]`, `conversations/*`, `reviews`, `favorites/*`, `blocks/*`, `billing/*`, `admin/*`.

UI building blocks worth reusing: `Header`, `Footer`, `TeacherCard`, `Avatar`, `FavoriteButton`, `MessageThread`, `ReportBlockControls`, `WhatsAppShare`, `InviteLink`, `GoogleAnalytics`, `AdSense`. "Reviews" in the database is labeled **Feedback** in the UI. Profanity filtering (`lib/profanity.ts`) is a word list (English + Hinglish), enforced in `POST /api/reviews`, bypassable by spelling.

SEO: `app/sitemap.ts`, `app/robots.ts`, per-teacher metadata and schema.org JSON-LD. Landing pages are generated only for city/subject pairs that have a real listed teacher. Search Console verification is the env var `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION`. GA and AdSense render nothing until their public env vars are set. `app/ads.txt/route.ts` depends on the AdSense client id.

## Domain rules that look like bugs and are not

- Billing UI hidden while `/api/billing/subscribe` still works. Two flags, on purpose.
- Search does not use the Meilisearch container.
- Student and parent profiles are not the `student_profile` / `parent_profile` tables.
- Generated avatars replaced MinIO photo upload.
- An admin-created teacher and a later real signup with the same email stay unlinked.
- Response time is hidden below 3 replied conversations.
- Self-attested badge is a declaration, not a background check.
- Block is mutual: either side blocking silences the thread for both. Unblock is shown only when `blocked_by_me` is true.
- One conversation per pair, not one per `contact_request` (those rows repeat on reconnect).
- `db/seed.sql` is 14 fake listings for local search. Production has had as few as one real teacher; sitemap size follows real `teacher_public` rows.
- `npm audit` high findings in transitive PostCSS were accepted rather than jumping to Next.js 16.

## Bugs already fixed (do not reintroduce)

1. `approve_payment()` originally had no admin check (`0003` fixed).
2. A `users` SELECT policy would have exposed every teacher's email (`0004` fixed). `teacher_public` has no email column.
3. `parent_profile` had no RLS (`0005` fixed).
4. `handle_new_user` mapped GoTrue provider `"email"` into a column that only allows `'google'`/`'password'`, which 500'd every password signup (`0010`).
5. Block checks inside RLS could not see the other user's block rows. Fixed with `are_users_blocked()` security definer (`0018`). Caught only by `SET ROLE` as both participants.
6. `is_admin()` SQL function recursed on Supabase (not on local Postgres 15.8). Fixed in `0020`. Calling `select is_admin()` as a smoke test on production is valid; a stack-depth error means this regressed.
7. `admin_restore_profile` cleared `deleted_at` but left `is_listed = false` (`0023`).
8. Signup and logout redirects hardcoded or defaulted to localhost / insecure HTTP (`lib/url.ts`).
9. Password `"different"` in an old test became a strength-check failure after `lib/password.ts`, so the test no longer proved duplicate-email handling.
10. Global `form { flex-direction: column }` stacked `.search-bar` until that class set its own direction.
11. Dark mode left inputs white because of a hardcoded `#fff` background.
12. Stale Google avatar URLs need an `onError` fallback; `img.complete` is true even when the image failed.
13. Tier 2 HTML assertions must strip React's `<!-- -->` markers between text nodes or they false-fail.

## How to run and test

```bash
docker compose up -d --build
./db/bootstrap.sh          # after postgres is healthy; GoTrue crash-loops until this
./db/run-migrations.sh     # after gotrue is healthy; reloads PostgREST schema
docker compose exec -T postgres psql -h 127.0.0.1 -U teachercircle -d postgres < db/seed.sql
```

App: http://localhost:3000. Become admin with the SQL in `README.md`, then open `/admin/users`.

Tests, three tiers: `npm run test:unit` (pure), `npm run test:system` (fake backend, no RLS), `npm run test:system:real` (live containers). The fake tier cannot see RLS-on-RLS bugs. `npm run build` and `npx tsc --noEmit` are the type/build bar. There is no CI workflow.

## Environment

Local: `.env.example` (`DB_PASSWORD`, `JWT_SECRET`, Google client, `UPI_PAYEE_*`, internal service URLs). Production: `.env.production.example` on Vercel (`APP_HOSTNAME`, `POSTGREST_URL`, `GOTRUE_URL`, `GOTRUE_URL_BROWSER`, `SUPABASE_API_KEY`, Google client, UPI, `BREVO_API_KEY`, `NEXT_PUBLIC_GA_MEASUREMENT_ID`, `NEXT_PUBLIC_ADSENSE_CLIENT_ID`, Search Console verification). Never commit real secrets. Google OAuth for production is also toggled in the Supabase dashboard; the env file alone does not enable it.

## Still open, in priority order

From `docs/05` and `docs/07`, still true as of this review:

- Sanitize PostgREST errors before they reach clients.
- Turn off GoTrue autoconfirm and use real SMTP before treating local auth as production-shaped. Production mail is Brevo; Supabase's own mailer is separate and has been blocked by Brevo's IP allowlist before.
- Add CI for `test:unit` and `build`.
- Optional: zod on request bodies, one response envelope, structured logs, a `/api/health` that checks PostgREST and GoTrue.
- G6 blog/content is not started. It needs writing, not a new table.
- No claim-listing flow, no CSP, no JWT denylist, no materialized rating aggregate, no payment gateway (Razorpay/Cashfree).

## Doc index

| File | Use |
|---|---|
| `README.md` | Local runbook and the narrative of each bugfix |
| `docs/01-system-design.md` | HLD, local vs production diagrams |
| `docs/02-lld.md` | LLD, including growth §14 |
| `docs/03-deployment.md` | Local compose and Vercel + Supabase |
| `docs/04-test-report.md` | What was verified, including production |
| `docs/05-architecture-review.md` | Findings; some rows are done |
| `docs/06-review-2026-09-20.md` | P0–P3 security/product pass |
| `docs/07-growth-review-2026-09-20.md` | G1–G5 shipped, G6 open |
| `AGENTS.md` | Rules to follow while editing |
