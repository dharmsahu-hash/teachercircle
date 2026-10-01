# TeacherCircle — agent instructions

Read `docs/ai/CONTEXT.md` before changing architecture, schema, auth, billing, or search. This file is the short operating contract. The long review lives in that context doc. The same snapshot is also prepared for [KnowledgeWala_AI_CONTEXT](https://github.com/dharmsahu-hash/KnowledgeWala_AI_CONTEXT) (`projects/teachercircle/`); that repository was empty and this agent cannot push to it (GitHub app has no write permission there).

## What this is

India-first teacher directory. Students and parents search by subject and city, connect, message, and leave feedback. Teachers list a free profile. Yearly UPI billing is built and switched off. Production is **Vercel + Supabase Cloud** at `teachercircle.vercel.app`. Local dev is Docker Compose (Next.js, Postgres, GoTrue, PostgREST) plus unused Meilisearch, Redis, and MinIO.

Stack: Next.js 14 App Router, TypeScript, no ORM. The app talks to Postgres only through PostgREST (`lib/db.ts` `pg` / `pgRpc`). Authorization is Row-Level Security plus `SECURITY DEFINER` functions, not route-handler `if` checks.

## Do not break these invariants

- **RLS is the authorization layer.** Public teacher data comes from the `teacher_public` view. Never expose `users.email` or `teacher_profile.contact_email` / `contact_phone` on a public read. Contact details return only from `reveal_teacher_contact()` after a `contact_request` exists.
- **`is_admin()` and `are_users_blocked()` must stay `SECURITY DEFINER`.** A plain SQL `is_admin()` recurses forever on Supabase Postgres (`users_admin_read` calls `is_admin()`). An inline `blocked_user` subquery inside another table's policy is invisible to the blocked user. Both bugs passed local tests and only showed up on the real database.
- **Admin writes go through audited `SECURITY DEFINER` functions** (`admin_*` in `0005` / `0011` / `0023`) that check `is_admin()` and insert `admin_audit_log` in the same transaction. Do not add a raw admin `UPDATE`/`DELETE`.
- **Roles are assigned once** via `set_my_role()` (`student` | `parent` | `teacher` only). There is no self-serve admin. Promote in SQL: `update users set role = 'admin' where email = '...'`.
- **Deletes are soft** (`deleted_at`). `admin_restore_profile()` must also re-list the teacher (`0023`); clearing `deleted_at` alone leaves them invisible in search.
- **`users.referred_by` is `ON DELETE SET NULL`.** Every other FK is cascade. A referrer deletion must not delete the people they referred.
- **Two different billing switches.** `feature_flags.payments_enabled` (database) enforces quotas and is what tests flip. `SUBSCRIPTION_UI_ENABLED` in `lib/featureToggles.ts` only hides the Subscribe UI. Do not merge them.
- **Search is Postgres, not Meilisearch.** `/api/search` and `lib/directory.ts` read `teacher_public`. Meilisearch, Redis, and MinIO containers run locally and are not imported by app code. Do not "wire them up" unless that is the task.
- **`parent_profile` and `student_profile` are unused.** Student/parent name and phone live on `users` via `set_my_contact_info()` (`0014`).
- **Avatars are Dicebear seeds**, rendered server-side (`lib/avatar.ts`). There is no photo upload. `components/Avatar.tsx` falls back to initials when a Google photo URL 404s.
- **City/subject pages 404 when empty.** `lib/directory.ts` only emits slugs that have at least one listed teacher. Do not pre-generate empty landing pages.
- **No Content-Security-Policy** in `next.config.mjs`. Inline JSON-LD and Next bootstrap scripts need nonces. Do not add a CSP that blocks them.
- **PostgREST schema cache.** After any migration that adds a table, view, or function, run `NOTIFY pgrst, 'reload schema';`. `db/run-migrations.sh` does this. A hand-applied migration that skips it fails as a silent 404, not a migration error.
- **Skip `0000_bootstrap.sql` on Supabase.** It only patches a plain Postgres image (roles, `auth.uid()`, `auth.users` sync). Supabase already has those.
- **Kong requires `apikey`.** Production sets `SUPABASE_API_KEY`. `lib/db.ts` and `lib/gotrue.ts` send it. Local PostgREST has no gateway, so the header is omitted when the env var is unset.
- **Never send raw error text to the client.** Route `catch` blocks return `publicErrorMessage(err, "<route fallback>")` from `lib/db.ts`. It shows only the `raise exception` texts listed in `USER_FACING_DB_MESSAGES` (as friendly copy) and logs everything else server-side. A new `raise exception` meant for users must be added to that map. Login/signup may show a `GoTrueError` message (GoTrue's own user-facing text) but nothing else.
- **CI must stay green on `stage`.** `.github/workflows/ci.yml` runs tsc, unit, build, Tier 2, then Tier 3 against the real Docker stack (without MinIO) on every push/PR to `stage` and `main`. Unit tests need Node 24+.
- **Email failures must not fail the user action.** `lib/email.ts` no-ops without `BREVO_API_KEY`. Message send succeeds even if the notification does not.
- **Signup `redirect_to` is a query parameter.** `signUpWithPassword` calls `POST /signup?redirect_to=<app>/auth/callback`. GoTrue ignores `redirect_to` inside the JSON body. `getAppBaseUrl()` must not be `localhost` for that link: a missing or local `APP_HOSTNAME` is ignored when the request host or `VERCEL_PROJECT_PRODUCTION_URL` is public. Supabase Authentication → URL Configuration must use the same public Site URL, or GoTrue replaces the link with Site URL.
- **Gmail and email/password are both sign-in paths.** The email form stays on `/login`. `isGoogleSignInEnabled()` only decides whether the Gmail button is active. Google itself is enabled in the Supabase dashboard.
- **Referral cookie is `tc_ref` in `localStorage`**, set from `/login?ref=` and consumed when role selection succeeds. Signup has no session yet, so this cannot be a `SECURITY DEFINER` call at signup time.
- **Password checks are server-side** (`lib/password.ts`). A client `minLength` is not enforcement. Tests that use a weak password will hit 400 for strength, not for the case they meant to test.
- **Rate limits** (`0021`, `lib/rateLimit.ts`): login 10/5min/IP, signup 5/hour/IP, messages 30/10min/user, reviews 10/hour/user, reports 5/hour/user. There is no Redis limiter.
- **Response-time label** needs at least 3 replied conversations (`lib/responseTime.ts`). Fewer than that shows nothing.
- **Self-attestation is not verification.** `teacher_profile.self_attested_at` is a checkbox, and the UI must keep saying so.
- **Admin-added listings are claimed only by a verified email** (`0026`). `admin_add_teacher` creates a `users` row with no `auth.users` row behind it ("unclaimed"). When an auth user with the same email becomes verified (insert with `email_confirmed_at`, or the `on_auth_user_email_confirmed` update trigger), `claim_unclaimed_listing()` re-keys that row's id to the auth id. Never claim on an unverified signup: that would let anyone take over a listing. Re-keying relies on every FK to `users`, `teacher_profile`, `parent_profile` and `student_profile` being `ON UPDATE CASCADE`; a new FK to those tables must be too.

## Where to change things

| Change | Touch |
|---|---|
| New table, policy, or RPC | next file in `db/migrations/NNNN_*.sql`, then `NOTIFY pgrst` |
| HTTP to Postgres | `lib/db.ts` only |
| Who is signed in | `lib/session.ts` cookie `tc_session`; `lib/auth.ts` `getSessionUser` |
| Public directory / SEO slugs | `lib/directory.ts`, `app/tutors/**`, `app/sitemap.ts` |
| Search API | `app/api/search/route.ts` against `teacher_public` |
| Billing math | `lib/entitlement.ts`, `lib/upi.ts`; enforcement flag stays in the database |
| Copy that says Feedback | UI word is Feedback, table is still `review` |

## Commands

```bash
npm run test:unit          # no Docker
npm run test:system        # fake PostgREST
npm run test:system:real   # needs docker compose + bootstrap + migrations
npx tsc --noEmit
npm run build
```

`npm test` is unit + fake system only. Tier 3 (`test:system:real`) is the suite that actually enforces RLS.

## Open gaps (do not treat as accidental omissions)

No zod. No CSP. Local GoTrue autoconfirm is on. JWTs are not revocable before expiry. No blog (growth item G6). No Meilisearch, Redis cache, MinIO upload, or payment gateway. `eslint.ignoreDuringBuilds` is true.

Detail and the bug history: `docs/ai/CONTEXT.md`, `README.md`, `docs/04-test-report.md`, `docs/05-architecture-review.md`.
