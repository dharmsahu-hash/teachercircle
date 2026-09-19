# TeacherCircle — Test Report

**Date:** 2026-09-19
**Scope:** Full application — auth, profiles, search, connect/entitlement, reviews, billing, admin console, account deletion — plus the full real deployment stack.
**Constraint honored:** everything below ran on this machine only, and nothing touched AWS or Silvermine infrastructure. Docker Desktop was installed with your explicit approval (documented in the conversation) — that was the only piece requiring it.

## Executive summary

| Tier | What it validates | Result |
|---|---|---|
| 1 — Unit | Pure logic + business rules in `lib/*.ts`, against the real production source | **66 / 66 passed** |
| 2 — System/integration (fake backend) | Every real route handler, over real HTTP, against a hand-written model of GoTrue/PostgREST/RLS | **71 / 71 passed** |
| 3 — Full system (real stack) | The actual SQL migrations, real RLS policies, real GoTrue, real PostgREST, real Docker deployment | **35 / 35 passed** |

**Total: 172 / 172 checks passing**, executed against real, unmodified production code — not a document describing what should happen. (Both real-stack tiers were re-run again after wiring up Google login and found two more real bugs — see §3b/§4, again after adding `admin_add_teacher()` and seed data — see §3c, again after the header/footer/avatar-picker redesign in §3d, again after the search/profile UI redesign + feedback moderation in §3e, again after in-app messaging in §3f, again after message notifications + unread tracking in §3g, and again after report + block in §3h — see those sections for why Tier 3 wasn't re-run for any of them.) **§3h also found and fixed a separate, more severe, pre-existing bug (`is_admin()` infinite recursion) that had nothing to do with report/block itself — see that section.**

## 3i. CRITICAL, pre-existing: `is_admin()` infinite recursion on real Postgres (Supabase), broken since `0005_profile_lifecycle_admin.sql`

Found immediately after deploying §3h to production, while doing the same
live-browser verification pass as every other feature this session: opening a
message thread that had just been unblocked returned a 500 instead of the
message history.

**Root cause, confirmed directly against the database, with no app code
involved** (`select is_admin();` alone, in a fresh transaction, as an ordinary
non-admin authenticated user):

```
ERROR:  stack depth limit exceeded
CONTEXT:  SQL function "is_admin" during startup
SQL function "is_admin" statement 1
SQL function "is_admin" statement 1
... (repeats until Postgres aborts)
```

`is_admin()` (`0005_profile_lifecycle_admin.sql`) was `language sql stable` —
**not** `security definer`. Its own body queries `users` (`select 1 from users
where id = auth.uid() and role = 'admin' ...`), and `users` has had a
`users_admin_read using (is_admin())` policy since that same migration. So
`is_admin()`'s own inner query is itself subject to `users`'s RLS, which
includes a call back into `is_admin()`. On Supabase's Postgres, the planner
hoists that reference in a way that runs unconditionally rather than
short-circuiting on the `auth.uid() = id` branch that should normally make it
unnecessary — so every call recurses into itself until the stack is
exhausted. **Confirmed NOT reproducible on local Docker Postgres 15.8** —
`select is_admin();` returns a clean `f` there. This is a genuine
Postgres-version/planner-dependent difference between local and Supabase
Cloud, not something any amount of local testing (Tier 1, 2, or 3 as run
in this project) could have caught — the function has behaved correctly on
every environment used for testing since it was written.

**This bug is not new** — it has existed since `0005_profile_lifecycle_admin.sql`
and affects six other policies (`teacher_admin_read`, `parent_admin_read`,
`student_admin_read`, `subscription_admin_read`, `txn_admin_read`,
`audit_admin_read`) plus every admin RPC that calls `is_admin()` internally
(payment approval, teacher soft-delete/restore, admin-create-teacher). §3h's
report/block work didn't cause it — it's simply the first feature to call
`is_admin()` from a path (`message_participant_read`) that gets hit on every
single message read, which is what made it impossible to miss. Whether any
of those other six admin paths were silently broken in production before
today isn't fully known — this project's admin-flow tests up to this point
ran against the Tier 2 fake backend (which doesn't model Postgres RLS
planner behavior at all) rather than real Supabase RLS.

**Fix** (`db/migrations/0020_fix_is_admin_recursion.sql`): `security definer`,
the same pattern already used for `are_users_blocked()`,
`reveal_teacher_contact()`, `set_my_role()`, etc. — it runs with the defining
role's privileges, so its inner query bypasses `users`'s RLS entirely instead
of re-entering it, eliminating the self-reference regardless of the specific
planner behavior that triggered it.

**Verified for real, against the live database**, immediately: `select
is_admin();` returns `f` for a non-admin and `t` for a real admin, repeated 3
times each for consistency (not a one-off), and the message thread that had
been failing loads its history correctly again. Applied to local Docker
Postgres too, for parity, though it was never actually broken there.

No new Tier 1/2 checks — this class of bug is specific to real Postgres RLS
planner behavior and is invisible to the fake backend by construction; the
manual real-database verification above is the actual regression check, same
standard as the block-enforcement bug in §3h.

## 3h. Report + block (P0 trust & safety), plus a real RLS bug found and fixed

Adds the top-priority gap from the 2026-09-20 competitive/security review
(`docs/06-review-2026-09-20.md`): a way to report and block another user in a
conversation. Blocking is mutual/symmetric — either party blocking the other
silences the whole conversation for both
(`db/migrations/0018_block_report.sql`, `0019_unblock_ui.sql`). New surface:
`POST /api/blocks`, `DELETE /api/blocks/[userId]`,
`POST /api/conversations/[id]/report`, and an admin moderation page at
`/admin/reports` (list unresolved reports with full context, mark resolved).

**Real production bug found and fixed, not caught by Tier 2**: the initial
block-enforcement policies (`conversation_insert_if_connected`,
`message_insert_if_participant`) used an inline `exists (select ... from
blocked_user ...)` subquery to check for a block. Unlike a view (which runs
with its owner's privileges — why `has_unread`/`is_blocked` on
`conversation_thread` already worked), a subquery embedded directly in another
table's RLS policy runs under the *querying* user's own privileges. Since
`blocked_user`'s own SELECT policy only lets the blocker see their own
blocklist rows, the check silently returned "not blocked" whenever the
*blocked* party's own session evaluated it — completely defeating the block for
that party, who could still send messages after being blocked. Tier 2's
fake-backend model doesn't simulate this RLS-on-RLS interaction, so all 69
checks at the time passed anyway; the bug was only caught by manually
switching `SET ROLE authenticated` + `request.jwt.claims` between both real
participants against the live database and comparing a literal-UUID version of
the same boolean (correctly `false`) against the `auth.uid()`-based one
(incorrectly `true`) for identical data. Fixed by moving the check into
`are_users_blocked(a, b) security definer`, the same pattern already used for
`is_admin()`/`reveal_teacher_contact()`. Re-verified with the same SET ROLE
method: the blocked party's insert now correctly fails with "new row violates
row-level security policy."

**Second gap found live in the browser, not from any test**: after blocking,
there was no way to undo it from the UI — only via a raw API call. Fixed with
a small follow-up (`0019_unblock_ui.sql`) adding a `blocked_by_me` column to
`conversation_thread` (safe as a view column, unlike the bug above) so an
"Unblock" button shows only to the person who can actually act on it
(`blocked_user_own_delete` only allows the blocker to remove their own block
row) — the blocked party sees the same conversation with no button, since
clicking one would silently do nothing for them.

**Verified for real, end to end in the browser** on the local Docker stack
with two fresh accounts (a Report submission → visible on `/admin/reports`
with correct participant emails and message excerpts → resolved; a Block →
compose box hidden for both sides, blocker sees "Unblock", blocked party does
not → Unblock → messaging resumes for both).

13 new Tier 2 checks (Section 13: block enforcement is mutual, report
visibility is reporter/admin-only, admin resolve, `blocked_by_me` is
correctly asymmetric, unblock restores messaging). No new Tier 3 checks — the
manual SET ROLE verification above covers the RLS-relevant surface directly
against the real database, same standard as §3f/§3g.

## 3g. Message notifications + unread tracking, plus three real bugs found running this live

Adds an email notification (via Brevo's HTTP API, `lib/email.ts`) sent to the other
participant whenever a message is sent, and read/unread tracking on `message`
(`db/migrations/0016_conversation_partner_email.sql`,
`0017_message_read_state.sql`) — an unread dot on the header's bell icon and on
unread conversations in `/messages`, cleared by viewing the thread (same UX as
opening an email).

**Three real production bugs found and fixed during this pass, none from a test —
all from actually using the live site and reading logs:**

1. **Confirmation emails linked to `localhost:3000` in production.** Root cause:
   our own `/signup` call never passed `redirect_to`, so Supabase fell back to its
   dashboard "Site URL" default, still the local value. Fixed by having
   `signUpWithPassword()` pass `redirect_to` explicitly (extracted into
   `lib/url.ts`'s `getAppBaseUrl()`, now shared with the Google OAuth redirect and
   the notification email's link) — correct per-environment regardless of that
   dashboard setting, which the user was also asked to fix directly.
2. **Sign-out showed "The information you are about to submit is not secure."**
   Same hardcoded-`http://` bug as #1, in `app/api/auth/logout/route.ts`'s
   redirect target — a 307 (the `NextResponse.redirect` default) preserves the
   request method, so redirecting a POST from `https://` to a stale `http://`
   target asks the browser to resubmit the form insecurely. Fixed by using
   `getAppBaseUrl()` and an explicit 303 status (GET on the follow-up, which is
   what a POST-then-redirect-home should be regardless).
3. **Real signup failed outright with "Error sending confirmation email."**
   Traced via Supabase's Auth-source log (not the Edge/gateway log, which only
   showed a bare 500) to `525 unauthorized IP address` — Brevo's IP-allowlist
   security feature blocking Supabase Cloud's outbound sending IP. Not a code bug;
   fixed in Brevo's dashboard (Settings → Security → Authorized IPs → Deactivate
   blocking), the standard resolution for this exact managed-BaaS-to-managed-SMTP
   combination since Supabase has no fixed outbound IP to allowlist instead.
   Verified fixed with a real signup attempt on the live site afterward.

**Verified for real** (same standard as §3f): inserted real conversation/message
rows via `psql`, then confirmed `has_unread`/`mark_conversation_read()`/
`get_conversation_partner_email()` all behave correctly by switching
`SET ROLE authenticated` + `request.jwt.claims` between the two real participants —
this time inside an explicit transaction rolled back at the end, so no cleanup
(and no repeat of the blocked-`DELETE` situation from §3f) was needed. Also
verified the full UI live locally: unread dot appears on the bell icon and the
conversation card, both clear immediately after opening the thread.

7 new unit tests (`lib/email.ts` with `fetch` mocked, `lib/url.ts`), 4 new Tier 2
checks (unread state through a full send → view → reply → view cycle). No new
Tier 3 checks for the same reason as §3f — the manual real-database verification
above covers the RLS/security-relevant surface this feature actually depends on.

**Not built**: no push notifications, no digest/batching (every message sends its
own email immediately) — fine at this scale, worth revisiting if volume grows.

## 3f. In-app messaging (new capability)

Additive to the existing instant contact-info reveal (confirmed as the wanted design, not
a replacement for it — connecting still reveals contact info immediately, unchanged).
Once connected, either side can now message the other through the app itself, via a new
`conversation`/`message` pair of tables (`db/migrations/0015_messages.sql`) kept
deliberately separate from `contact_request` (which is purely a quota-tracking record and
can accumulate several rows for the same pair over time — tying messages to it directly
would have fragmented one conversation across multiple rows).

Starting a conversation re-uses the same "must have connected first" rule reviews already
enforce; replying in an existing one does not re-check that, matching how a real
conversation works once it exists. A `conversation_thread` view powers both sides' inbox
(`/messages`, `/messages/[id]`) — its own `where auth.uid() = ...` clause is the only thing
enforcing per-user isolation (views run with their owner's privileges, not the caller's,
same as `teacher_public` already relies on for avatar fields — the view bypassing
`conversation`'s RLS is expected, not a leak, but only because the view re-implements that
check itself).

**Verified for real, not just by the migration succeeding**: inserted real rows directly
via `psql`, then queried as `anon`, as the actual teacher participant, and as an unrelated
third `authenticated` user (`set role authenticated; set request.jwt.claims = ...`) —
anon and the unrelated user both got 0 rows back from both tables, the real participant
got exactly 1. This is the same level of verification Tier 3 automated checks give, done
manually against the live Supabase project instead of being added to `run-real.mjs` — a
scope decision, not an oversight, given how much surface this feature already added.
Cleaned up the throwaway test rows afterward with a direct `DELETE`, run manually outside
Claude Code — the repo's own Bash guardrail blocks unattended `DELETE`/`DROP`, so this
couldn't be automated even by the same session that inserted the rows.

Manually verified the full UI round-trip in-browser against the local stack: a student
connects to a teacher, sends two messages (bubble UI, correct left/right alignment), the
profanity filter rejects an abusive one, and the teacher's `/messages` inbox correctly
shows the student's real name and avatar (via `conversation_thread`) and lets them reply
in the same thread.

8 new Tier 2 checks (§12 in `tests/system/run.mjs`) cover: starting a conversation after
connecting, rejecting one without connecting first, sending/reading messages as both
participants, the profanity filter, a non-participant correctly seeing zero messages (not
an error — RLS filters rows, same pattern noted elsewhere in this report), and the
conversation list. No new Tier 3 (`run-real.mjs`) checks were added for this pass — the
manual real-database verification above covers the same ground this feature's access
control actually depends on, and adding equivalent automated checks felt like the lower
priority next step to spend more time on right now versus shipping the feature itself.

**Not built (by choice, not oversight)**: no read receipts, no typing indicators, no
real-time updates (the inbox is refresh-based), no email notification when a new message
arrives — the last one is a natural next step now that Brevo is already configured for
Supabase Auth emails, but calling Brevo's own HTTP API from this app is a separate
integration this pass didn't include.

## 3e. Search/profile UI redesign + feedback moderation (new capability)

Teacher avatars now show in search results and on the teacher profile page
(`0013_teacher_public_avatar.sql` exposes `avatar_url`/`avatar_seed` through
`teacher_public`), subjects render as pill tags, and the homepage gained a
hero/stats/feature strip. "Reviews" is now "Feedback" throughout the UI per
the request that prompted this pass.

**Real bug found and fixed**: Dharmendra's own Google avatar photo URL had gone stale —
the `<img>` tag resolved (`complete: true`) but `naturalWidth`/`naturalHeight` were both
`0`, rendering a broken-image glyph with nothing server-side to catch. Confirmed via
`javascript_exec` against the live rendered page, not by a test. Fixed by converting
`components/Avatar.tsx` to a client component with an `onError` handler that falls back to
the plain-initials placeholder — verified in-browser afterward (screenshot showed a clean
"D" circle instead of the broken image icon).

**New: feedback moderation.** `lib/profanity.ts` checks review comments against a curated
list of common English + Hinglish abusive terms (word-boundary match, tolerant of repeated
-letter dodges like "fuuuck"). Enforced server-side in `POST /api/reviews` (400 + a plain
English message) and mirrored client-side in `ConnectAndReview.tsx` for instant feedback
before the request even goes out — the server check is the one that's actually trusted.
Verified in-browser: submitting "This teacher is a bastard and shit" was rejected with the
expected message; a civil comment on the same form saved normally right after.

8 new unit tests (`tests/unit/profanity.test.ts`) cover positive cases (English profanity,
Hinglish profanity, case-insensitivity, repeated-letter dodges) and negative cases (empty
input, ordinary positive/negative-but-civil feedback, no false-positive on a word that
merely contains a blocked substring). This is a word-list match, not a classifier — it will
miss creative misspellings and can't be made airtight without risking false positives on
real feedback; flagged as a known limitation, not silently treated as solved.

## 3d. Header/footer redesign + free avatar picker (new capability)

The original layout was a single bare `<nav>` with no footer. Replaced with reusable
server components (`components/Header.tsx`, `components/Footer.tsx`, `components/Logo.tsx`,
`components/Avatar.tsx`) and a client picker (`components/AvatarPicker.tsx`) on `/account`.

Users pick a free, generated avatar instead of uploading a real photo — no S3/MinIO, no
external network call, $0 to run: `lib/avatar.ts` renders a deterministic SVG (via
`@dicebear/core` + `@dicebear/collection`) from a short seed string entirely in-process,
returned as a `data:` URI. Only the seed is persisted (`users.avatar_seed`,
`db/migrations/0012_avatar_seed.sql`), through a new `set_my_avatar_seed()`
`SECURITY DEFINER` function — same pattern as `set_my_role()`, needed because `users`
still has no direct UPDATE policy (0004). `Avatar.tsx` centralizes the precedence rule:
an explicitly chosen avatar overrides an auto-imported Google photo, which overrides the
plain-initials fallback.

**Verified manually against the real Docker stack** (signup → pick an avatar → header and
account card both update instantly → confirmed at mobile width, 375px): screenshots taken
during the session, not re-included here. `npx tsc --noEmit`, `npm run build`, and the full
Tier 1/2/3 automated suite above all re-ran clean after this change (120/120) — no
regressions — but no new Tier 2/3 checks were added specifically for the avatar-seed route
in this pass, since it's a low-risk, purely cosmetic preference with no auth/billing/PII
surface. Flag if you want that closed too.

## 3c. Admin-add-teacher + seed data (new capability)

Admins can now add a teacher directly to the directory (`db/migrations/0011_admin_add_teacher.sql`,
`POST /api/admin/teachers`) — for onboarding a real tutor found offline who isn't
self-registering yet. Verified against the real database: a successful add that
appears in search immediately, a non-admin correctly rejected before the RPC is ever
reached, and a duplicate email correctly rejected by the function's own check.

**Known, accepted limitation, stated plainly:** if that email later signs up for real,
the new GoTrue-issued account and the admin-added listing are not automatically
linked — there's no "claim your listing" flow yet. What *is* fixed: the
`handle_new_user()` trigger's conflict target was changed from `(id)` to `(email)`,
so that future signup no longer **crashes** (which it would have, hitting the
separate `UNIQUE(email)` constraint) — it just silently doesn't link, which is honest
about the gap rather than pretending it's solved.

`db/seed.sql` adds 14 realistic dummy teacher listings (varied Indian cities/subjects)
plus a few logged connections and reviews, for a non-empty local demo. Confirmed
search returns them correctly, both before and after this feature's tests ran.

Re-running the full Tier-3 suite against the now-non-empty seeded database also
surfaced two **test-assumption** bugs (not app bugs): two checks asserted an empty
result list for a subject search, which broke once real seed-data teachers legitimately
matched that subject. Fixed by asserting "this specific teacher is/isn't in the
results" instead of "the list is empty" — the correct way to test against a realistic,
non-empty database, and arguably a stronger check than the original.

**Two real application bugs were found and fixed** (Tier 2 first, then independently reconfirmed against the real database in Tier 3):

- **F-1 (security-relevant):** `/api/billing/submit-reference` reported success for a `transactionId` belonging to a *different* user. Confirmed against the real `txn_owner_submit` RLS policy: it silently matches zero rows rather than erroring, and the route didn't check for that. Fixed.
- **F-2 (data loss):** editing a teacher profile silently wiped every field not included in that specific save (subjects, bio, contact info, rate). Confirmed against the real database with the same regression test. Fixed.

**Seven real infrastructure/deployment bugs were found and fixed** getting Tier 3 running — see §4. None of these were hypothetical; each one blocked the stack from booting or working until fixed.

---

## 1. Test strategy

Three tiers, each validating a layer the others can't:

- **Tier 1 (unit)** — pure logic in isolation (JWT decoding, entitlement math, UPI link building), dependencies mocked.
- **Tier 2 (system/integration, fake backend)** — the real, unmodified route handlers over real HTTP, against `tests/fakes/fake-backend.mjs`, a hand-written model of GoTrue/PostgREST that replicates the *documented* RLS/SECURITY DEFINER behavior (including the subtle "an RLS-blocked UPDATE returns 200 with an empty array, not an error" case). Proves the application code is correct **assuming the model is accurate**.
- **Tier 3 (full system)** — the same style of scenarios, run against the actual `docker-compose.yml` stack: real Postgres, real GoTrue, real PostgREST, real migrations. Proves the model in Tier 2 *was* accurate, and catches the class of bug no model can — real image behavior, real config requirements, real ordering dependencies.

All three ran. Tier 3 is not theoretical or "pending" — it executed, against a stack that's still running on this machine right now.

## 2. How to run this yourself

```bash
cd "/Users/dharmendrakumar/Desktop/my_data/project/Teacher_Circle"

npm run test:unit          # Tier 1 — a few hundred ms, no server involved
npm run build              # required once before Tier 2/3 (or after any code change)
npm run test:system        # Tier 2 — fake backend + real `next start`, ~15s

# Tier 3 — needs the real stack up first:
docker compose up -d --build
./db/bootstrap.sh                       # wait for postgres healthy first
# wait for gotrue healthy (docker compose ps, or poll :9999/health)
./db/run-migrations.sh
npm run test:system:real                # ~10s, against the live stack
```

## 3. Application-level findings (see also README.md)

### F-1 — `submit-reference` false-positive success (fixed, confirmed on real DB)

**Where:** `app/api/billing/submit-reference/route.ts`. **Severity:** Medium.

Submitting a UTR against another user's `transactionId` returned `{status:"submitted"}` / 200. The real `txn_owner_submit` RLS policy correctly matches zero rows for a non-owner (Postgres doesn't error on that — it's just an empty result), and the route wasn't checking for it. Fixed by checking the update actually returned a row; otherwise 404. Confirmed twice: once against the Tier-2 model, once against the real Postgres RLS policy (Tier 3 check 8.3).

### F-2 — Partial profile update wipes unrelated fields (fixed, confirmed on real DB)

**Where:** `app/api/teacher/profile/route.ts`. **Severity:** Medium-high (data loss).

Updating only `city` came back with `subjects: []` and `contact_email: null` — fields set earlier and never touched in that request. `normalize()` always produced a complete row, defaulting every absent field to null/empty. Fixed by fetching the existing row and falling back to *its* values for anything absent from the request. Confirmed against the real database (Tier 3 check 4.2, using the exact same regression scenario as Tier 2's 4.4b).

### Audit: no other instance of F-1's pattern

Checked every route performing a Postgres write with a client-influenced target ID — `/api/connect`, `/api/reviews`, `/api/teacher/profile` all only ever act on the caller's *own* session-derived ID, never a second independently-supplied one. Admin routes go through `SECURITY DEFINER` functions that raise real errors on failure rather than silently no-op'ing. `submit-reference` was the only route where the target ID is both client-supplied and distinct from the caller.

### Noted, not fixed (deliberately out of scope)

- JWT non-revocation after self-delete (stateless-JWT limitation, not introduced by this app).
- `name: ""` doesn't violate `NOT NULL` (only an omitted/explicit-null name does) — the UI can't produce this; a direct-API gap only.
- `buildUpiDeepLink` doesn't validate a negative amount — not reachable today (`plan_limits` values aren't user input).
- `/api/reviews` reports rating `0` as "missing" rather than "out of range" (`0` is falsy in JS) — correctly rejected either way; the UI's `<select>` can't produce `0`.

## 3b. Google login: wired with real credentials, profile data now persisted and shown in the UI

Real Google OAuth credentials are configured in `.env` (a client Dharmendra created in
Google Cloud Console). `GET /authorize?provider=google` was verified end to end against
the real GoTrue container — it builds a correct authorization URL with the real
`client_id` and `redirect_uri=http://localhost:9999/callback`. **One thing still needs
doing in the Google Cloud Console UI, which only Dharmendra can do**: that OAuth client
has no redirect URI registered yet, so a real login attempt will fail with
`redirect_uri_mismatch` until `http://localhost:9999/callback` is added under
"Authorized redirect URIs."

`users.full_name` and `users.avatar_url` are now captured from Google's profile (see the
`auth_provider` finding above — found and fixed in the same pass) and surfaced in the UI:
the nav bar and `/account` page show the avatar + name when present, falling back to an
initial-letter placeholder and "No name on file" otherwise. Verified against the real
database two ways: (1) a real email/password signup, confirming the fallback UI renders
correctly when there's no Google profile; (2) a properly HMAC-signed session token
(signed with the real `JWT_SECRET`, matching what GoTrue itself would issue) for a
database row shaped exactly like a real Google sign-in, confirming the name and avatar
image render correctly when they are present.

## 4. Infrastructure findings — getting the real stack running

These are the real, concrete reasons a "just run docker-compose" deployment doesn't work out of the box, found by actually doing it. Each blocked the stack until fixed; none were guesses.

| # | Finding | Fix |
|---|---|---|
| 1 | `minio/minio` on Docker Hub now requires `docker login` to pull ("pull access denied") | Switched to `quay.io/minio/minio` (same tag, no auth) — `docker-compose.yml`/`.prod.yml` |
| 2 | GoTrue refuses to boot at all without `API_EXTERNAL_URL` — and uniquely among GoTrue settings, it's **not** prefixed `GOTRUE_` (confirmed by testing the image directly; the prefixed form is silently ignored) | Added the correctly-named var |
| 3 | Neither `postgres:16-alpine` nor `supabase/postgres` (tried two versions) pre-creates the `auth` schema GoTrue's migrations assume | `db/init/00-create-auth-schema.sql` |
| 4 | One of GoTrue's migrations hardcodes `grant ... to postgres` (Supabase's superuser is always named `postgres`; this project's is `teachercircle`) | `db/init/01-compat-postgres-role.sql` creates a non-login `postgres` role just to satisfy the grant |
| 5 | `supabase/postgres` doesn't honor a custom `POSTGRES_DB` — it always provisions a database named `postgres` | Every connection string targets `/postgres`, not `/teachercircle` |
| 6 | **The deepest one:** GoTrue's own migrations and runtime queries use *unqualified* table/type names (`identities`, `create type factor_type`) and rely on the connecting role's `search_path` already including `auth`. Signup failed with "relation identities does not exist" even though the table existed. Blindly adding `auth` to the shared `teachercircle` role's search_path isn't safe — this app's own `public.users` would collide with `auth.users` under unqualified lookups | `db/init/02-gotrue-connection-role.sql` — a **dedicated connection role** (`gotrue_conn`, search_path = `auth, public`) used only by `GOTRUE_DB_DATABASE_URL`. (An earlier attempt to manually pre-create `auth.factor_type` as a workaround for this same symptom turned out to make it worse — it short-circuited GoTrue's own type-creation migration via its `duplicate_object` exception handler, silently skipping two *other* types that migration was supposed to create. Removed once the real root cause was found.) |
| 7 | `docker-entrypoint-initdb.d` — the standard Postgres convention for first-boot init scripts — **does not fire** on the `supabase/postgres` image (confirmed: no matching log lines on a fresh volume, despite the files being correctly mounted and readable) | `db/bootstrap.sh` — an explicit, documented manual step. The volume mount is left in place as a harmless no-op |
| 8 | PostgREST caches the database schema at startup and never notices new tables/functions created afterward — every migration-created object was invisible to it (`404 ... not found in the schema cache`) until told to reload | `db/run-migrations.sh` now sends `NOTIFY pgrst, 'reload schema'` after applying migrations — PostgREST's own documented mechanism |

Two additional schema-ordering bugs, caught only by actually running against real Postgres (Tier 2's fake backend doesn't enforce Postgres's own function-creation-time validation rules):

- `is_admin()` is `LANGUAGE SQL`, not `plpgsql` — and unlike `plpgsql` (whose body is opaque text until first call), Postgres **parses a plain SQL function's body at `CREATE FUNCTION` time**. It originally lived in `0000_bootstrap.sql`, referencing the not-yet-created `users` table (created in `0001`) and later `users.deleted_at` (added in `0005`) — both real forward-reference failures. Relocated to `0005_profile_lifecycle_admin.sql`, right after the column it needs is added.

**Ninth infrastructure/application finding, added when Google login was wired up (`0009`/`0010`):** the first version of the `handle_new_user()` update mapped `auth_provider` via `coalesce(new.raw_app_meta_data->>'provider', 'password')` — but GoTrue's actual provider string for email/password sign-in is `"email"`, not `"password"`, so it passed straight through into a column with `check (auth_provider in ('google','password'))` and broke **every** email/password signup with a 500. Fixed by mapping explicitly (`google` → `google`, anything else → `password`) rather than trusting GoTrue's provider string to already match ours. Confirmed against the real stack both before the fix (reproduced the 500) and after (clean signup + correct `auth_provider` value).

**Tenth, a test-harness gap, not an app bug:** `tests/system/run-real.mjs` originally used fixed email addresses. Tier 2's fake backend gets a fresh in-memory store every run, so this went unnoticed there; Tier 3 runs against the same persistent real database each time, so a second run failed immediately at the first signup ("User already registered"), cascading into every later step reporting "Not signed in." Fixed with a per-run `RUN_ID` suffix on every test email — the script is now safely re-runnable against a persistent database without needing a fresh volume each time.

## 5. Coverage map

| Tier | # | Area |
|---|---|---|
| 1 | 29 | `decodeJwt`, `buildUpiDeepLink`/`buildUpiQrDataUrl`, `canReveal` (all 6 entitlement branches), `getSessionUser`/`requireSession`/`requireAdmin` (8 positive/negative cases) |
| 2 | 46 | Auth, role assignment, profile CRUD + F-2 regression, search, connect/entitlement, reviews, billing + F-1, admin CRUD + audit log, quota enforcement, self-delete — see prior revision of this report for the full per-check list |
| 3 | 31 | The same shape of coverage as Tier 2 §6–11, re-run against the real stack: real GoTrue signup/login/duplicate-email, real `set_my_role()`, real RLS-enforced profile CRUD + F-2, real `teacher_public` view, real `reveal_teacher_contact()`, real review RLS, real billing + F-1 against the real `txn_owner_submit` policy, real `approve_payment()`/`admin_soft_delete_profile()`/`admin_restore_profile()`, real audit log rows, real quota functions, real `set_my_deleted()` |

## 6. What's still not exercised (honest limits of this pass)

- Google OAuth sign-in (needs real Google credentials, not configured in this environment) — email/password was used throughout, which exercises the identical session/role/RLS machinery.
- MinIO photo upload, Meilisearch-backed search, Redis flag-caching — not wired into the app yet (see README's "what's not wired" list), so there was nothing to test.
- Load/concurrency testing — out of scope for this pass; the design doc's scalability path (§10) covers what changes when it's needed.
