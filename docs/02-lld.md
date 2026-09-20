# TeacherCircle — Low-Level Design

Reflects the actual code in this repo (`db/migrations/`, `app/`, `lib/`) — not an
aspirational spec. Where a design decision changed while building it, that's called
out explicitly rather than left to drift silently from the docs.

> **Updated 2026-09-20** — sections 9–12 are new (messaging trust & safety,
> rate limiting, verification/response-time, favorites), covering
> `db/migrations/0015` through `0024`. Everything before that was already
> accurate and is unchanged below except where a table gained columns.

## 1. Data model

| Table | Key columns | Notes |
|---|---|---|
| `users` | `id, email, role, auth_provider, deleted_at` | `role` is nullable until onboarding; mirrors `auth.users` via a trigger (§2) |
| `teacher_profile` | `user_id (PK), subjects[], city, rate_per_hour, contact_email, contact_phone, is_listed, is_subscribed, deleted_at, self_attested_at` | `contact_*` only ever returned via `reveal_teacher_contact()` (§4), never a plain `SELECT`. `self_attested_at` added in `0022` — see §11 |
| `parent_profile` | `user_id (PK), name, deleted_at` | Had **no RLS policy at all** in the first draft — fixed in `0005` |
| `student_profile` | `id, parent_id, name, grade, deleted_at` | Owned entirely by the parent |
| `review` | `teacher_id, reviewer_id, rating, comment` | Insert blocked unless a `contact_request` row already links reviewer→teacher |
| `contact_request` | `teacher_id, requester_id, created_at` | The audit trail "connect" leaves behind |
| `conversation` | `id, teacher_id, requester_id` | One row per teacher/requester pair, `on delete cascade` from both `teacher_profile` and `users` — see §9 |
| `message` | `id, conversation_id, sender_id, body, created_at, read_at` | `read_at` set by `mark_conversation_read()` when the recipient opens the thread |
| `blocked_user` | `blocker_id, blocked_id (composite PK)` | See §9 — enforcement lives in a `SECURITY DEFINER` function, not a raw RLS subquery |
| `message_report` | `id, conversation_id, reporter_id, reason, resolved_at` | Reviewed at `/admin/reports` |
| `favorite_teacher` | `user_id, teacher_id (composite PK)` | Any signed-in user can save any teacher — see §12 |
| `rate_limit_hit` | `rl_key (PK), window_start, count` | One row per (endpoint, actor) pair, reset each window — see §10 |
| `feature_flags` | `key, enabled` | One row: `payments_enabled` |
| `plan_limits` | `role, free_connections_per_month, yearly_price_amount, yearly_price_currency` | Per-role pricing/quota, not hardcoded |
| `subscription` | `user_id, status, started_at, expires_at` | Yearly only, no auto-renew (personal UPI can't push a recurring charge) |
| `payment_transaction` | `subscription_id, provider, amount, provider_ref, status, verified_by` | `verified_by` is null until an admin approves |
| `admin_audit_log` | `actor_id, target_table, target_id, action` | Written only by the `admin_*` functions, never directly |
| `teacher_public` (view) | aggregates `avg_rating`/`review_count`, plus `self_attested_at`, `avg_response_hours`, `replied_conversation_count` | What `/api/search` actually queries — see §7, §11 |
| `teacher_response_time` (view) | `teacher_id, avg_response_hours, replied_conversation_count` | Feeds `teacher_public` — see §11 |
| `conversation_thread` (view) | per-conversation display row: partner name/avatar, `has_unread`, `is_blocked`, `blocked_by_me` | What `/messages` and `/messages/[id]` actually query — see §9 |

Full column definitions: `db/migrations/0001_core_schema.sql`,
`0003_billing_schema.sql`, `0015_messages.sql`, `0018_block_report.sql`,
`0021_rate_limiting.sql`, `0022_verification_and_response_time.sql`,
`0024_favorites.sql`.

## 2. Auth plumbing (the part a generic design doc always skips)

Plain `postgres:16-alpine` + standalone GoTrue + PostgREST is **not** the full
Supabase stack — `auth.uid()`, the `anon`/`authenticated` Postgres roles, and the
`auth.users → public.users` sync trigger don't exist for free. All added explicitly:

- `db/migrations/0000_bootstrap.sql` — `auth.uid()` (reads the JWT's `sub` claim
  via `current_setting('request.jwt.claims')`), the `anon`/`authenticated` roles,
  and `is_admin()`.
- `db/migrations/0001_core_schema.sql` — `handle_new_user()` trigger, fired
  `after insert on auth.users`, creates the matching `public.users` row.
- `db/migrations/0006_grants.sql` — table/function grants to `anon`/`authenticated`
  (RLS still does the real row-level filtering on top of these).

## 3. Role assignment

`set_my_role()` (`0002_role_assignment.sql`) is `SECURITY DEFINER`, callable by
anyone, but only succeeds once — `where id = auth.uid() and role is null`. A
second call raises `role already assigned`. This is why Google sign-in still
needs a one-time app-level onboarding screen (`app/onboarding/role/`): Google's
consent screen has no concept of student/parent/teacher.

## 4. Contact reveal (connect flow)

Two steps, on purpose:

1. `POST /api/connect/[teacherId]` inserts a `contact_request` row — a plain
   RLS-permitted insert (`auth.uid() = requester_id`).
2. The same route then calls `reveal_teacher_contact()`
   (`0008_contact_reveal.sql`), a `SECURITY DEFINER` function that re-checks a
   `contact_request` now exists, and only then returns `contact_email`/
   `contact_phone` — fields no plain RLS policy exposes to anyone but the
   teacher.

Entitlement (`lib/entitlement.ts`) is checked **before** step 1: if
`payments_enabled` is on and the user is over their free monthly quota with no
active subscription, the route returns `402` before touching the database.

## 5. Admin CRUD

Every admin action that touches *someone else's* row goes through a named
function in `0005_profile_lifecycle_admin.sql` — never a raw PostgREST table
write:

| Function | Does | Logged as |
|---|---|---|
| `admin_create_teacher_profile` | Creates a profile for an already-registered user who hasn't onboarded | `create` |
| `admin_update_teacher_profile` | Patches any field via a `jsonb` diff | `update` |
| `admin_soft_delete_profile` | Sets `deleted_at` across `users`/`teacher_profile`/`parent_profile`/`student_profile` | `delete` |
| `admin_restore_profile` | Reverses the above | `update` |

Each one calls `is_admin()` itself and inserts into `admin_audit_log` in the
same transaction — the check and the audit trail are the same code path, so
there's no way to get one without the other. **Deliberate scope boundary**:
these manage profiles for people who have already signed in at least once.
None of them fabricate a login identity for someone who's never registered —
that would need an invitation/claim mechanism, which is out of scope until
there's a concrete reason to build it.

## 6. API surface (as actually implemented)

| Route | What it does |
|---|---|
| `POST /api/auth/signup`, `/login` | Server-to-server call to GoTrue's password grant; sets an httpOnly session cookie. Both rate-limited by IP (§10); signup also enforces server-side password strength (`lib/password.ts`) |
| `GET /auth/callback` (page) + `POST /api/auth/set-session` | Picks up the Google OAuth token from the URL fragment and stores it the same way |
| `POST /api/auth/role` | Calls `set_my_role()` |
| `GET/POST /api/teacher/profile` | Own-profile read/create/update, including the `self_attested` toggle (§11) |
| `GET /api/search` | Queries the `teacher_public` view; supports `subject`, `city`, `minPrice`, `maxPrice`, `minRating`, and `page` (§7, §11) |
| `POST /api/connect/[teacherId]` | Entitlement check → `contact_request` insert → `reveal_teacher_contact()` |
| `POST /api/reviews` | Insert, blocked by RLS unless connected; rate-limited (§10) |
| `POST /api/conversations` | Creates (or returns the existing) `conversation` row for a connected pair |
| `GET/POST /api/conversations/[id]/messages` | Read a thread (marks it read as a side effect) / send a message — rejected by RLS if either party has blocked the other; rate-limited (§10) |
| `GET /api/conversations` | Lists the caller's own threads via `conversation_thread` |
| `POST /api/conversations/[id]/report` | Inserts a `message_report`; rate-limited (§10) |
| `POST /api/blocks`, `DELETE /api/blocks/[userId]` | Block / unblock another user (§9) |
| `GET /api/admin/reports`, `POST /api/admin/reports/[id]/resolve` | Admin-only report queue (§9) |
| `GET/POST /api/favorites`, `DELETE /api/favorites/[teacherId]` | Save/list/unsave a teacher (§12) |
| `POST /api/billing/subscribe` | Creates `subscription`+`payment_transaction`, returns a UPI deep link + QR (`lib/upi.ts`) |
| `POST /api/billing/submit-reference` | Records the payer's UTR, status → `submitted` |
| `POST /api/admin/payments/[id]/approve` | Calls `approve_payment()` |
| `POST /api/admin/users/[id]/{update,delete,restore,create-teacher}` | Calls the matching `admin_*` function |
| `POST /api/account/delete` | Calls `set_my_deleted()` — self-service soft-delete |
| `GET /sitemap.xml`, `/robots.txt` | Next.js-native routes (`app/sitemap.ts`, `app/robots.ts`) — see §11 |

## 7. Deliberately simplified for this first working version

- **Search** queries the `teacher_public` Postgres view directly
  (`0007_search_view.sql`), not Meilisearch. The container runs; wiring
  index-sync-on-save is a scoped-out next step, not a bug.
- **Entitlement flag caching**: `is_payments_enabled()` is called directly
  against Postgres on every gated request rather than through the Redis
  60-second-TTL cache the original design sketched. One cheap function call —
  add the cache once it's actually measured to matter.
- **Photo upload**: MinIO runs; the profile form has no image picker calling
  it yet.

## 8. Real bugs the implementation caught (fixed, not hypothetical)

1. `approve_payment()` originally had **no admin check** — any signed-in user
   could have approved their own pending payment. Fixed by adding `is_admin()`
   at the top of the function body.
2. A `users` table read policy would have let anyone fetch every teacher's raw
   row, **email included** — RLS filters rows, not columns. Removed; public
   teacher data comes only from `teacher_profile`/`teacher_public`, which never
   had an email column.
3. `parent_profile` had **zero RLS policy** — nothing governed a parent's
   access to their own data. Fixed in `0005_profile_lifecycle_admin.sql`.
4. A teacher who paused their own listing (`is_listed = false`) would have
   lost the ability to read their own row back to re-edit it, since the only
   read policy was "public + listed." Added `teacher_owner_read`.
5. Admin's payment-approval console had no RLS policy letting it actually see
   `subscription`/`payment_transaction` rows — `is_admin()` would have been
   true but every row still hidden. Added `subscription_admin_read`/
   `txn_admin_read`.
6. **`is_admin()` recursed into itself infinitely on real (Supabase) Postgres.**
   It was `language sql stable`, not `security definer`, so its own internal
   `select ... from users` query was itself subject to `users`'s
   `users_admin_read using (is_admin())` policy — calling back into itself.
   Present since `0005`, invisible to every tier of local testing (not
   reproducible on local Postgres 15.8 — a genuine planner difference), only
   found by testing directly against the real production database. Fixed with
   `security definer` in `0020_fix_is_admin_recursion.sql`. Full account:
   `docs/04-test-report.md` §3i.
7. `admin_restore_profile()` cleared `deleted_at` but never re-set
   `teacher_profile.is_listed` back to `true`, even though
   `admin_soft_delete_profile()` explicitly sets it `false` as part of the
   delete — a restored profile stayed permanently invisible in search. Fixed
   in `0023_fix_admin_restore_relisting.sql`.
8. The first version of the block-enforcement RLS policies used an inline
   `exists (select ... from blocked_user ...)` subquery, which — unlike a
   view — runs under the *querying* user's own RLS privileges, not the
   table's. Since `blocked_user`'s own read policy only lets the blocker see
   their own rows, the *blocked* party's session always saw "not blocked" and
   could still send messages after being blocked. Fixed by moving the check
   into `are_users_blocked() security definer` (§9).

## 9. Messaging trust & safety (report + mutual block)

`db/migrations/0015_messages.sql` adds `conversation`/`message`; `0018` adds
report + block on top. Key decisions:

- **Blocking is mutual, not one-directional.** Either party blocking the
  other silences the whole conversation for both — simpler to reason about
  than "the blocked person can still send, the blocker just stops seeing it."
- **`are_users_blocked(a, b) security definer`** is the single source of
  truth for block state, used by both `conversation_insert_if_connected` and
  `message_insert_if_participant`'s `with check`, and by
  `conversation_thread`'s `is_blocked` column. See bug #8 above for why this
  has to be a function, not an inline subquery.
- **`conversation_thread.blocked_by_me`** (added in `0019`) exists purely so
  the UI can show an "Unblock" button only to the person who can actually act
  on it — `blocked_user_own_delete` only allows the blocker to remove their
  own block row, so showing the button to the blocked party would silently
  do nothing if clicked.
- **Report queue**: `message_report` rows are visible to the reporter and to
  admins only (`message_report_read`); `/admin/reports` resolves them via
  `message_report_admin_update`, gated by `is_admin()`.
- **Notifications**: every new message triggers a best-effort email via
  Brevo's HTTP API (`lib/email.ts`) to the other participant — a failure
  here must never block the send itself, so it's wrapped and swallowed.

## 10. Rate limiting

`db/migrations/0021_rate_limiting.sql` — a Postgres-backed fixed-window
counter, not Redis (Redis is provisioned but unused everywhere in this app;
adding a dependency on it for one feature wasn't worth it). One row per
(endpoint, actor) pair in `rate_limit_hit`, reset each window.
`check_rate_limit(key, max, window_seconds)` is `security definer` so it
works for both `anon` (login/signup, keyed by IP via `x-forwarded-for`) and
`authenticated` (messages/reviews/reports, keyed by user id) callers.
Deliberate, documented simplification: the brand-new-key branch has a small
race window under true concurrency — acceptable for blunting casual abuse,
not a hardened limiter. Limits: login 10/5min/IP, signup 5/hour/IP, messages
30/10min/user, reviews 10/hour/user, reports 5/hour/user.

Security headers (`next.config.mjs`) and server-side password strength
(`lib/password.ts`) shipped alongside this, unrelated to rate limiting
mechanically but from the same review pass. No CSP — this app relies on
inline `<script type="application/ld+json">` (teacher pages, §11) and
Next.js's own inline bootstrap scripts; a real CSP needs per-request nonces,
which is a bigger change than "basic headers."

## 11. Verification, response time, and SEO

**Self-attestation** (`teacher_profile.self_attested_at`, `0022`): a
teacher-side checkbox, explicitly labeled as a self-declaration, not a
background or identity check. Toggling it on sets the timestamp; re-saving
the profile with the box still checked does not bump it forward — it should
read as "when they first confirmed," not "when they last edited anything."

**Response time** (`teacher_response_time` view, `0022`): for each
conversation, the gap between a requester's first message and the teacher's
first reply after it, averaged across conversations that got a reply.
Computed as a plain (non-`security definer`) view — safe for the same reason
`teacher_public`/`conversation_thread` already are: a view runs with its
*owner's* privileges, not the querying user's, so it can aggregate across
every user's `conversation`/`message` rows despite those tables' own RLS
restricting direct `SELECT` to participants and admins. `lib/responseTime.ts`
turns the raw number into a low-precision label ("usually replies within a
day"), never shown below 3 replied conversations — one lucky/unlucky reply
shouldn't read as a stable pattern.

**SEO** (`app/sitemap.ts`, `app/robots.ts`, `generateMetadata` on
`app/teacher/[id]/page.tsx` and `app/search/page.tsx`): the sitemap lists
every currently-listed teacher plus static routes; each teacher page gets a
real `<title>`/description built from their actual data, a canonical URL,
Open Graph/Twitter tags, and schema.org `Person` + `AggregateRating` JSON-LD
(only when they have real reviews).

**Search filters + pagination** (`app/api/search/route.ts`,
`app/search/page.tsx`): `minPrice`/`maxPrice` (`rate_per_hour` gte/lte) and
`minRating` (`avg_rating` gte); pagination via PostgREST's native
`limit`/`offset`, fetching one extra row per page to know whether a next
page exists rather than a separate exact-count query.

## 12. Saved/favorite teachers

`favorite_teacher` (`0024`) — any signed-in user can save a teacher and see
the list at `/favorites`. `teacher_public` is a view, not a table PostgREST
can embed a foreign key through, so the favorites list is two queries: the
user's own `favorite_teacher` rows, then
`teacher_public?user_id=in.(...)` — same pattern already used for
`/admin/reports`'s participant lookups.

## 13. Analytics + monetization (Google Analytics, Google AdSense)

`components/GoogleAnalytics.tsx` and `components/AdSense.tsx` render nothing
at all unless `NEXT_PUBLIC_GA_MEASUREMENT_ID` / `NEXT_PUBLIC_ADSENSE_CLIENT_ID`
are set — same "provisioned, not wired until configured" pattern as
Meilisearch/Redis/MinIO. Both are pure client-loaded `<script>` tags (via
`next/script`), no server-side code, no new database tables. `app/ads.txt/route.ts`
is a dynamic route (matching `app/sitemap.ts`/`app/robots.ts`) that derives a
correct `ads.txt` from the same AdSense env var, rather than a static file
that would need hand-editing to match it.

Deliberately not built: a cookie-consent banner (Google's EU User Consent
Policy expects one for EEA/UK visitors; this app is India-focused and a real
consent-management flow is a feature in its own right, not a line of config)
and manually-placed ad units (Auto Ads picks placement automatically — the
lower-maintenance, typically higher-yield default for a site with no
existing ad-layout data to hand-tune against). `app/privacy/page.tsx` exists
because AdSense's program policies require a reachable privacy policy
disclosing cookie/ad-personalization use before they'll approve a site — see
`docs/03-deployment.md` Step 9 for the full account-setup walkthrough, which
has to be done by a human in their own Google account regardless of what's
built here.

## 14. Traffic growth: SEO landing pages, WhatsApp share, referrals

Built from `docs/07-growth-review-2026-09-20.md` (G1–G5); G6 (blog/content)
is deliberately not built here — it needs written content, not code.

**Directory core** (`lib/directory.ts`): `getDirectory()` fetches every
`teacher_public` row once and derives, in application code (not a DB
`DISTINCT`/`unnest` — the data volume doesn't justify it), the distinct set
of city slugs, subject slugs, and real city+subject pairs. `slugify()` is a
plain lowercase/hyphenate/strip-punctuation function, unit-tested directly
(`tests/unit/directory.test.ts`) rather than only through the pages that use
it. `getCityPage()`/`getCitySubjectPage()` build on top of it and are the
single source of truth both the pages and `app/sitemap.ts` call — so a
slug that isn't real never ends up in the sitemap by construction, not by a
separate filter that could drift from the page logic.

**G1 — SEO landing pages** (`app/tutors/[city]/page.tsx`,
`app/tutors/[city]/[subject]/page.tsx`): each calls `notFound()` when the
slug doesn't match a real listing — the thin-content guard from the review's
"honest caveat," so Google never indexes an empty shell for a made-up
city/subject combination. Each has its own `generateMetadata` (unique
title/description built from the real teacher count and city/subject name)
and a schema.org `ItemList` JSON-LD block, matching the per-teacher JSON-LD
pattern from §11.

**G2 — WhatsApp share** (`components/WhatsAppShare.tsx`): a `wa.me/?text=`
link, no new schema, no third-party account. The share URL carries
`utm_source=whatsapp&utm_medium=share` so referral traffic is attributable
in Analytics rather than showing up as generic direct traffic.

**G3 — Browse hub** (`app/tutors/page.tsx`): lists every real city and
subject from `getDirectory()` as plain links — both a real navigation
surface and the internal-linking scaffold Google needs to actually discover
G1's individual pages (a page with no inbound link is effectively invisible
to a crawler regardless of its own on-page SEO).

**G4 — Search Console verification** (`app/layout.tsx`): the Metadata API's
built-in `verification: { google: ... }` field, spread in only when
`NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` is set — same config-gated,
no-op-until-configured pattern as GA/AdSense in §13. The Search Console
signup and sitemap submission themselves are human steps in
`docs/03-deployment.md`, not code.

**G5 — Referral loop** (`db/migrations/0025_referrals.sql`): adds
`users.referred_by uuid references users(id) on delete set null` —
deliberately `set null`, not `cascade` like every other FK in this schema,
because deleting a referrer must never cascade-delete everyone they
referred. Two `SECURITY DEFINER` functions, matching the narrow-grant
pattern already used for `reveal_teacher_contact()`/`is_admin()`:
`set_referred_by(uuid)` (rejects self-referral and unknown referrer IDs,
only ever sets `referred_by` once — a later call is a silent no-op, not an
overwrite) and `get_referral_count()` (returns a single count, not rows, to
the inviter). `/account` shows a real invite link
(`/login?ref={user.id}`) via `components/InviteLink.tsx` and the live count
from `get_referral_count()`.

Because signup requires an email-confirmation redirect with no session yet
to authenticate a `SECURITY DEFINER` call, the referral code survives that
detour via `localStorage` (`tc_ref`, set on `/login?ref=...` load, read and
cleared by `app/onboarding/role/RoleForm.tsx` once role selection succeeds)
rather than trying to thread it through the confirmation link itself.

**`app/search/page.tsx`** had its inline teacher-card markup extracted to
`components/TeacherCard.tsx` while building this — it was about to be
duplicated a third time (search, city page, city+subject page), and this
repo's existing pattern is to share, not fork, that kind of markup.
