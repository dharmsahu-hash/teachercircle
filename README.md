# TeacherCircle — local development

Full implementation of the design in the companion requirements/HLD/LLD/implementation
documents: Next.js app + PostgREST + GoTrue (Google & email/password auth) + Postgres
(RLS everywhere) + Meilisearch/Redis/MinIO containers, all open source, $0 to run.

**Full docs, kept in this repo (not just chat):**
[System design / HLD](docs/01-system-design.md) ·
[Low-level design](docs/02-lld.md) ·
[Deployment — local & free production](docs/03-deployment.md) ·
[Test report](docs/04-test-report.md) ·
[Architecture review & naming](docs/05-architecture-review.md)

This file covers local dev specifics and the scope decisions/bugs found while
building it; the docs above cover architecture, data model, and the full
production rollout on a free-tier VM.

## ✅ Fully verified, including the real Docker stack

Docker Desktop is now installed (with your approval) and the full stack has been run
for real: migrations applying cleanly against real Postgres, real GoTrue issuing real
sessions, and the complete signup → role → profile → search → connect → review →
billing → admin loop — **106/106 automated checks passing**, 31 of them against the
live containers, not a mock. Full detail, including 7 real deployment bugs found and
fixed along the way (a stale PostgREST schema cache, a missing GoTrue connection role,
an image that no longer pulls without login, and more): [docs/04-test-report.md](docs/04-test-report.md).

```bash
npm install        # clean install, 0 errors (one accepted transitive advisory — see below)
npx tsc --noEmit    # 0 type errors across the whole app
npm run build       # ✓ compiled, all 24 routes correctly server-rendered on demand
```

## Run it

```bash
cd "/Users/dharmendrakumar/Desktop/my_data/project/Teacher_Circle"

# 1. Start the backing services + app
docker compose up -d --build

# 2. Wait for postgres to report healthy, then bootstrap it — GoTrue's own
#    migrations need a few things this Postgres image doesn't provide on its
#    own (see docker-compose.yml). GoTrue crash-loops harmlessly until this
#    runs, then self-heals within its own retry backoff (usually well under 60s).
docker compose ps
./db/bootstrap.sh

# 3. Wait for gotrue to show "healthy" (docker compose ps gotrue), THEN
#    apply this app's own schema — it needs GoTrue to have already created
#    auth.users. run-migrations.sh also reloads PostgREST's schema cache at
#    the end, which it otherwise never notices these new tables/functions.
./db/run-migrations.sh

# 4. Open the app
open http://localhost:3000
```

Try it: sign up (email + password — Google isn't configured yet, see below), pick a
role, and if you picked "teacher," fill in a profile. Then open an incognito window,
sign up as a "student," search, connect, and leave a review.

### Service ports

| Service | URL | Notes |
|---|---|---|
| App | http://localhost:3000 | Next.js |
| PostgREST | http://localhost:3001 | auto-generated REST API |
| GoTrue | http://localhost:9999 | auth |
| Postgres | localhost:5432 | user `teachercircle` |
| Meilisearch | http://localhost:7700 | running, not yet wired into search — see below |
| MinIO console | http://localhost:9001 | photo storage (not yet wired into the profile form) |

### Becoming an admin (for testing the admin console)

There's deliberately no self-service way to become admin — `set_my_role()` only
accepts `student`/`parent`/`teacher` (see `db/migrations/0002_role_assignment.sql`).
Sign up normally, then promote yourself directly in Postgres:

```bash
docker compose exec postgres psql -h 127.0.0.1 -U teachercircle -d postgres \
  -c "update users set role = 'admin' where email = 'you@example.com';"
```

Then visit `/admin/users` and `/admin/payments`. As an admin, `/admin/users` also
has a **"+ Add teacher"** button (`/admin/teachers/new`) — for onboarding a real
tutor found offline who isn't signing up themselves yet. It creates a full directory
listing with no login attached; see `docs/04-test-report.md` §3c for the one known
limitation (no "claim your listing" flow yet if they later sign up with that email).

### Seeding demo data

`db/seed.sql` adds 14 realistic dummy teacher listings (varied Indian cities and
subjects, a few with reviews) so search isn't empty on a fresh database:

```bash
docker compose exec -T postgres psql -h 127.0.0.1 -U teachercircle -d postgres < db/seed.sql
```

Safe to re-run — every insert is idempotent.

### Google sign-in — already configured and verified working

Real credentials are already in `.env` and confirmed working end to end (a real
Google account has successfully signed in). If you ever need to swap in a different
OAuth client — the first one used here was deleted in Google Cloud Console partway
through and had to be replaced:

1. Google Cloud Console → APIs & Services → Credentials → create an OAuth 2.0 Client
   ID (Web application). Authorized redirect URI for **local dev**:
   `http://localhost:9999/callback` (not the production `/auth/v1/callback` path —
   there's no reverse proxy locally).
2. Fill in `.env`: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.
3. Set `GOOGLE_OAUTH_ENABLED=true` in `.env` (add this line — it's read by
   `docker-compose.yml` to flip `GOTRUE_EXTERNAL_GOOGLE_ENABLED`).
4. `docker compose up -d` to restart GoTrue with the new config.

### Turning on billing enforcement

Everything (UPI QR generation, submit-reference, admin approval queue) works end to
end right now with zero visible effect on what any user can do — exactly as designed.
To see it actually restrict something:

```bash
docker compose exec postgres psql -h 127.0.0.1 -U teachercircle -d postgres \
  -c "update feature_flags set enabled = true where key = 'payments_enabled';"
```

Roll back the same way with `enabled = false`.

## Scope decisions made while implementing (read this before assuming a bug)

The two design documents described the architecture; turning it into running code
surfaced real gaps and a couple of genuine bugs. Fixed, and listed here so you know
they're deliberate:

- **New: report + block (P0 trust & safety), plus a real RLS bug found and
  fixed**: either party in a conversation can now report or block the other
  (`db/migrations/0018_block_report.sql`, `0019_unblock_ui.sql`); blocking is
  mutual — either side blocking silences the conversation for both, not just
  one direction. Admins review unresolved reports at `/admin/reports`. **Real
  bug**: the first version checked for a block with an inline `exists (select
  ... from blocked_user ...)` subquery inside the RLS policy — unlike a view,
  which runs with its owner's privileges, a subquery embedded in another
  table's policy runs under the *querying* user's own privileges. Since
  `blocked_user`'s own SELECT policy only lets the blocker see their own rows,
  the blocked party's own session evaluated the check against zero visible
  rows and got "not blocked" back — silently defeating the block for exactly
  the person it was supposed to stop. All 69 Tier 2 checks passed anyway (the
  fake-backend model doesn't simulate RLS-on-RLS visibility); only caught by
  switching `SET ROLE`/`request.jwt.claims` between both real participants
  against the live database. Fixed with `are_users_blocked()
  security definer`, the same pattern as `is_admin()`. A second, smaller gap
  turned up live in the browser (not from any test): no UI way to undo a
  block — fixed by exposing `blocked_by_me` on `conversation_thread` so
  "Unblock" shows only to whichever side can actually do it. Full writeup:
  `docs/04-test-report.md` §3h.
- **New: message notifications + unread tracking, plus three real production bugs
  found running this live**: an email (via Brevo's HTTP API, `lib/email.ts`) now
  goes to the other participant on every new message, and a red dot marks unread
  conversations in the header bell and `/messages`, cleared by opening the thread.
  While shipping this, found and fixed three real bugs on the live site (not from
  a test): confirmation emails linking to `localhost:3000` in production (our own
  `/signup` call never passed `redirect_to`, so Supabase fell back to a stale
  dashboard default — now passed explicitly via `lib/url.ts`'s `getAppBaseUrl()`,
  shared with the Google OAuth redirect too); sign-out showing a browser
  "information you are about to submit is not secure" warning (same
  hardcoded-`http://` bug in the logout redirect, compounded by a 307 preserving
  the POST method — fixed with `getAppBaseUrl()` + an explicit 303); and real
  signup failing outright with "Error sending confirmation email" (Brevo's IP
  allowlist blocking Supabase Cloud's outbound IP — a Brevo dashboard fix, not a
  code bug — see `docs/04-test-report.md` §3g for all three in full).
- **New: in-app messaging, additive to the contact-info reveal**: once connected,
  either side can now message the other through the app (`db/migrations/0015_messages.sql`,
  `/messages`, `/messages/[id]`) — kept as its own `conversation`/`message` pair of tables
  rather than hanging messages off `contact_request`, since that table can accumulate
  several rows for the same pair over time (once per reconnect) and would have fragmented
  one conversation across them. Verified for real against the live Supabase project (not
  just via the migration succeeding) by inserting real rows and querying as `anon`, as
  the actual participant, and as an unrelated third user directly in `psql` — see
  `docs/04-test-report.md` §3f for the exact commands and results. No email notification
  on new messages yet — a natural next step now that Brevo is already wired up for
  Supabase Auth, just not yet called from this app's own code.
- **Auth plumbing the docs assumed but never wrote**: `auth.uid()`, the `anon`/
  `authenticated` Postgres roles, and the `auth.users → public.users` sync trigger
  don't exist for free with a plain `postgres:16-alpine` + standalone GoTrue/PostgREST
  — that combination is *not* the full Supabase stack. Added in
  `db/migrations/0000_bootstrap.sql`.
- **Real bug fixed**: `approve_payment()` had no admin check at all in the original
  design — any signed-in user could have approved their own pending payment. Fixed in
  `0003_billing_schema.sql`.
- **Real bug fixed**: a `users` table policy would have let anyone read every
  teacher's raw row *including their email* (RLS filters rows, not columns). Removed;
  public teacher info comes only from the `teacher_profile` table / `teacher_public`
  view, which never had an email column. Fixed in `0004_rls_policies.sql`.
- **Real gap fixed**: `parent_profile` had no RLS policy at all in the original
  design — meaning no rule governed a parent's access to their own row. Fixed in
  `0005_profile_lifecycle_admin.sql`.
- **Contact info needed a real column**: the design docs never specified where a
  teacher's phone/email-to-reveal actually lives. Added `contact_email`/
  `contact_phone` to `teacher_profile` plus a `reveal_teacher_contact()` function that
  only returns them after a `contact_request` row exists.
- **Search uses Postgres directly, not Meilisearch, in this first pass.** A
  `teacher_public` view (`0007_search_view.sql`) pre-joins the rating aggregate;
  `/api/search` filters on it directly. Meilisearch container runs and is ready, but
  wiring index-sync-on-save is scoped out for now — flag if you want it next.
  Same call for the Redis flag-cache (60s TTL) described in the design doc: `/api/**`
  calls Postgres directly for `is_payments_enabled()` rather than caching it. Both are
  one cheap function/query call right now — add the cache once it's actually measured
  to matter.
- **Accepted, not fixed**: `npm audit` reports two high-severity advisories in a
  transitive `postcss` dependency (source-map path disclosure) that only clears via a
  forced upgrade to Next.js 16 — a breaking major-version jump I didn't want to make
  blindly while implementing everything else. Fine for local dev; revisit before any
  real deployment.
- **Real bug fixed (found immediately after shipping Google login)**: the
  `handle_new_user()` trigger mapped `auth_provider` via
  `coalesce(raw_app_meta_data->>'provider', 'password')` — but GoTrue's actual
  provider string for email/password is `"email"`, not `"password"`, so it hit the
  column's `CHECK` constraint and **broke every email/password signup** with a 500.
  Fixed in `0010_fix_auth_provider_mapping.sql` by mapping explicitly instead of
  trusting GoTrue's string to already match ours.
- **Header/footer/avatar redesign, deliberately without real photo upload**: the
  original nav was a single bare `<nav>` in `layout.tsx` with no footer at all. Now:
  `components/Header.tsx` (logo + sticky nav + avatar) and `components/Footer.tsx`
  (about / for-students / for-teachers columns) are reusable server components;
  `components/Avatar.tsx` centralizes the avatar precedence rule (chosen free avatar
  > Google photo > initials). Users pick a free, self-hosted generated avatar
  (`lib/avatar.ts`, `@dicebear/core` + `@dicebear/collection`, rendered fully
  server-side as a data URI — no S3/MinIO, no external network call, $0 to run) on
  `/account`; only the short seed is persisted (`0012_avatar_seed.sql`, another
  `set_my_role()`-style `SECURITY DEFINER` function since `users` still has no direct
  UPDATE policy). Real photo upload (wiring the already-running MinIO container) was
  explicitly descoped for now — see "What's not wired yet" below.
- **Nav polish + Subscribe hidden + student/parent contact info**: nav links now show an
  icon + label with a hover pill (`components/icons.tsx`, no icon library). Subscribe is
  hidden from the nav and the `/billing/subscribe` page now shows a "not open yet" message
  — gated by a single flag, `lib/featureToggles.ts` (`SUBSCRIPTION_UI_ENABLED = false`),
  deliberately kept separate from the DB-backed `feature_flags.payments_enabled` that
  controls billing *enforcement* and is exercised by the test suite: flipping the UI flag
  hides the entry point without touching the tested `/api/billing/subscribe` flow
  underneath it (still verified working in Tier 2/3 — see test report §8.1). Search page
  rebuilt as a single elevated search bar with icon fields (`components/icons.tsx`) and
  popular-subject quick chips — real CSS bug found doing this: the global
  `form { flex-direction: column }` rule was silently stacking the new `.search-bar`
  fields instead of laying them out side by side, since `.search-bar` never explicitly set
  `flex-direction`. Also new: students and parents can now save their own name and an
  optional phone number on `/account` (`db/migrations/0014_account_contact_info.sql` adds
  `users.phone` + `set_my_contact_info()`, reusing `users.full_name` rather than the
  never-wired `parent_profile`/`student_profile` tables, which model something else
  entirely — a parent's list of children — and have no application code touching them).
- **UI redesign for trust/retention + feedback moderation**: search results and the
  teacher profile page now show the teacher's own avatar (`0013_teacher_public_avatar.sql`
  exposes `users.avatar_url`/`avatar_seed` through `teacher_public` — safe, since that view
  only ever contains teacher rows, and a teacher's photo is exactly the trust signal a
  public listing should carry) plus subject "pill" tags instead of a comma-separated list,
  a homepage hero/stats/feature strip for social proof, and hover-lift teacher cards.
  Real bug found doing this: a stale/expired Google avatar photo URL rendered as a broken
  image with no error PostgREST/Next could see — `naturalWidth`/`naturalHeight` come back
  `0` while `img.complete` is `true`. Fixed by making `components/Avatar.tsx` a client
  component with an `onError` fallback to plain initials; found by actually looking at the
  rendered page, not from a test. "Reviews" is now called "Feedback" throughout the UI
  (heading, empty states, form labels) per your wording. New: `lib/profanity.ts` blocks
  common English + Hinglish abusive language in feedback comments, checked both
  client-side (instant UX) and server-side in `POST /api/reviews` (the one that's actually
  enforced) — a curated word-list match, not a classifier, so it's bypassable by creative
  spelling; revisit if that turns out to matter more than a false positive blocking someone
  real feedback.
- **Deliberate new capability, with a stated limitation**: admins can add a teacher
  directly (`0011_admin_add_teacher.sql`, `/admin/teachers/new`) for onboarding
  someone who isn't self-registering yet. If they later sign up for real with that
  email, the new account and the listing aren't automatically linked — no "claim
  your listing" flow exists. What *is* handled: that future signup no longer
  crashes (the trigger's conflict target moved from `(id)` to `(email)`), it just
  doesn't link — an honest partial fix, not a silent gap.

## What's not wired yet (by design, not oversight)

- Real photo upload to MinIO — deliberately replaced with the free generated-avatar
  picker described above; revisit if/when real teacher photos matter enough to justify it
- Meilisearch-backed search (see above)
- Redis flag-caching (see above)
- Razorpay/Cashfree gateway provider (Phase 2b in the design doc)
