# TeacherCircle — Low-Level Design

Reflects the actual code in this repo (`db/migrations/`, `app/`, `lib/`) — not an
aspirational spec. Where a design decision changed while building it, that's called
out explicitly rather than left to drift silently from the docs.

## 1. Data model

| Table | Key columns | Notes |
|---|---|---|
| `users` | `id, email, role, auth_provider, deleted_at` | `role` is nullable until onboarding; mirrors `auth.users` via a trigger (§2) |
| `teacher_profile` | `user_id (PK), subjects[], city, rate_per_hour, contact_email, contact_phone, is_listed, is_subscribed, deleted_at` | `contact_*` only ever returned via `reveal_teacher_contact()` (§4), never a plain `SELECT` |
| `parent_profile` | `user_id (PK), name, deleted_at` | Had **no RLS policy at all** in the first draft — fixed in `0005` |
| `student_profile` | `id, parent_id, name, grade, deleted_at` | Owned entirely by the parent |
| `review` | `teacher_id, reviewer_id, rating, comment` | Insert blocked unless a `contact_request` row already links reviewer→teacher |
| `contact_request` | `teacher_id, requester_id, created_at` | The audit trail "connect" leaves behind |
| `feature_flags` | `key, enabled` | One row: `payments_enabled` |
| `plan_limits` | `role, free_connections_per_month, yearly_price_amount, yearly_price_currency` | Per-role pricing/quota, not hardcoded |
| `subscription` | `user_id, status, started_at, expires_at` | Yearly only, no auto-renew (personal UPI can't push a recurring charge) |
| `payment_transaction` | `subscription_id, provider, amount, provider_ref, status, verified_by` | `verified_by` is null until an admin approves |
| `admin_audit_log` | `actor_id, target_table, target_id, action` | Written only by the `admin_*` functions, never directly |
| `teacher_public` (view) | aggregates `avg_rating`/`review_count` | What `/api/search` actually queries — see §7 |

Full column definitions: `db/migrations/0001_core_schema.sql` and
`0003_billing_schema.sql`.

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
| `POST /api/auth/signup`, `/login` | Server-to-server call to GoTrue's password grant; sets an httpOnly session cookie |
| `GET /auth/callback` (page) + `POST /api/auth/set-session` | Picks up the Google OAuth token from the URL fragment and stores it the same way |
| `POST /api/auth/role` | Calls `set_my_role()` |
| `GET/POST /api/teacher/profile` | Own-profile read/create/update |
| `GET /api/search` | Queries the `teacher_public` view |
| `POST /api/connect/[teacherId]` | Entitlement check → `contact_request` insert → `reveal_teacher_contact()` |
| `POST /api/reviews` | Insert, blocked by RLS unless connected |
| `POST /api/billing/subscribe` | Creates `subscription`+`payment_transaction`, returns a UPI deep link + QR (`lib/upi.ts`) |
| `POST /api/billing/submit-reference` | Records the payer's UTR, status → `submitted` |
| `POST /api/admin/payments/[id]/approve` | Calls `approve_payment()` |
| `POST /api/admin/users/[id]/{update,delete,restore,create-teacher}` | Calls the matching `admin_*` function |
| `POST /api/account/delete` | Calls `set_my_deleted()` — self-service soft-delete |

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
