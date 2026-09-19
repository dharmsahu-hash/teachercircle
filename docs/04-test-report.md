# TeacherCircle — Test Report

**Date:** 2026-09-19
**Scope:** Full application — auth, profiles, search, connect/entitlement, reviews, billing, admin console, account deletion — plus the full real deployment stack.
**Constraint honored:** everything below ran on this machine only, and nothing touched AWS or Silvermine infrastructure. Docker Desktop was installed with your explicit approval (documented in the conversation) — that was the only piece requiring it.

## Executive summary

| Tier | What it validates | Result |
|---|---|---|
| 1 — Unit | Pure logic + business rules in `lib/*.ts`, against the real production source | **57 / 57 passed** |
| 2 — System/integration (fake backend) | Every real route handler, over real HTTP, against a hand-written model of GoTrue/PostgREST/RLS | **46 / 46 passed** |
| 3 — Full system (real stack) | The actual SQL migrations, real RLS policies, real GoTrue, real PostgREST, real Docker deployment | **35 / 35 passed** |

**Total: 138 / 138 checks passing**, executed against real, unmodified production code — not a document describing what should happen. (Both real-stack tiers were re-run again after wiring up Google login and found two more real bugs — see §3b/§4, again after adding `admin_add_teacher()` and seed data — see §3c, again after the header/footer/avatar-picker redesign in §3d, and again after the search/profile UI redesign + feedback moderation in §3e — 8 new unit tests for `lib/profanity.ts`, no new Tier 2/3 checks added for either UI pass since they're presentation-layer and were verified manually in-browser instead — see §3d/§3e.)

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
