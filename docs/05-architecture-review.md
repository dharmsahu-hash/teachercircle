# TeacherCircle — Architecture Review & Naming Recommendation

> **Partially superseded** — see `docs/06-review-2026-09-20.md` for security/feature/
> competitive findings as of the Vercel+Supabase production launch and in-app
> messaging. This doc predates both and is kept for the parts still accurate
> (Part B naming discussion, and architecture findings not touched since).

**Date:** 2026-09-19
**Basis:** direct review of the actual codebase (not the design docs describing it),
cross-checked against what running the real stack for 111 automated tests actually
revealed. Findings are specific to this repo — file/line references throughout —
not generic checklist items.

---

## Part A — Architecture & design review

### A.0 Overall assessment

This is a genuinely well-built personal project — better-tested (111 real checks
across 3 tiers, including real RLS policy enforcement) than most funded startups'
MVPs, and honest in its own documentation about real limitations rather than papering
over them. The findings below are about closing the gap between "solid MVP" and
"production-grade," not about fundamental flaws.

**What's already right, worth naming explicitly so it doesn't get "fixed" by accident:**
- Authorization lives in the database (RLS + `SECURITY DEFINER` functions), not
  scattered `if` statements in route handlers — this is the single most important
  architectural decision in the whole system, and it's correct.
- Every admin write is audited by construction (`admin_audit_log`), not by
  discipline — the audit and the authorization check are the same code path
  (`lib/auth.ts`, `db/migrations/0005_profile_lifecycle_admin.sql`).
- Soft-delete everywhere, no destructive `DELETE` in any application code path.
- Business logic (`lib/entitlement.ts`, `lib/upi.ts`) is separated from route
  handlers — this is the right layering and it's already in place.
- The billing feature is fully built but flag-gated (`feature_flags.payments_enabled`),
  proven safe to enable/disable instantly — a genuinely mature pattern, not common
  in projects this size.

### A.1 Security

| # | Finding | Severity | Where | Recommendation |
|---|---|---|---|---|
| 1 | **Raw database error text leaks to API clients.** Every route's catch block returns `err.message` verbatim, and for a `PostgrestError` that's the literal Postgres/PostgREST error body — e.g. `{"code":"P0001","message":"not connected"}` is fine to show, but a real constraint violation would expose column/constraint names to any client. | **High** | `lib/db.ts` `PostgrestError`; ~15 route handlers | Add a `lib/errors.ts` with an explicit allowlist: business-rule messages raised deliberately by our own functions (`"role already assigned"`, `"not connected"`, `"not authorized"`, `"a user with this email already exists"`) pass through; anything else becomes a generic `"Something went wrong"` logged server-side with the real detail. |
| 2 | **No rate limiting on `/api/auth/signup` or `/api/auth/login`.** Brute-force and signup-spam are both open. | **High** (before any public launch) | `app/api/auth/{signup,login}/route.ts` | Redis is already provisioned and unused (see A.4) — a natural fit for a token-bucket limiter keyed by IP. Production docs already note Cloudflare rate limiting as a mitigation, but that only covers deployments actually behind Cloudflare. |
| 3 | `GOTRUE_MAILER_AUTOCONFIRM=true` means anyone can activate an account with an email they don't own. | **High**, already self-documented | `docker-compose.yml` | Already flagged with a loud comment as a pre-launch item — reiterating here because it's the kind of thing that's easy to forget once the app "just works." Flip to `false` + configure `GOTRUE_SMTP_*` before real users. |
| 4 | No CSP, `X-Content-Type-Options`, `X-Frame-Options`, or `Referrer-Policy` headers. | Medium | (none set anywhere) | Add via `next.config.mjs` `headers()` — cheap, no behavior change. |
| 5 | No schema-validation library — routes hand-roll checks like `if (!rating)`, which is exactly what let the "rating `0` reported as missing" cosmetic bug through (documented in `docs/04-test-report.md`). | Medium | Every route handler | Adopt `zod` for request body parsing. Would have caught that bug for free and makes validation consistent instead of ad hoc. |
| 6 | JWT sessions can't be revoked server-side; a captured token remains valid until its 1-hour expiry even after self-delete. | Medium, already self-documented | `lib/session.ts` | Acceptable for now; a real "sign out everywhere" needs a token blacklist or shorter-lived tokens + refresh rotation. Worth doing before payments go live for real. |
| 7 | CSRF: no explicit token, but every mutation is POST and cookies are `SameSite=Lax` — a reasonable baseline, not a gap that needs closing right now. | Low (informational) | `lib/session.ts` | No action needed unless this API is ever called cross-origin. |

### A.2 API design

| # | Finding | Severity | Recommendation |
|---|---|---|---|
| 8 | **No response envelope consistency.** Some routes return raw rows, some `{ok:true}`, some `{error:...}` — three different shapes across the same API surface. | Medium | Standardize on `{ data } \| { error: { message, code } }` before the API surface grows further; retrofitting later means touching every client call site. |
| 9 | **`/api/search` has no pagination.** Returns every matching row, unbounded. Fine at 14 seed teachers; a real problem at thousands. | Medium | PostgREST already supports `Range`/`limit`/`offset` for free — just not used yet. Add `limit`/`offset` query params now, before it's a performance incident. |
| 10 | Business-rule rejections (e.g. "role already assigned") and malformed-request rejections (missing field) both return 400, conflating two different failure classes. | Low | Consider 409/422 for business-rule rejections if API consumers beyond this app's own frontend ever need to distinguish them programmatically. |

### A.3 Observability & operations

| # | Finding | Severity | Recommendation |
|---|---|---|---|
| 11 | **No CI pipeline at all.** 111 automated tests exist across 3 tiers and none of them run automatically — there is no `.github/workflows/`. Given how much testing infrastructure already exists, this is the single highest-leverage gap in the whole review: the tests are only as good as how often they actually run. | **High** | Minimum viable CI: a GitHub Actions workflow running `npm run test:unit` + `npm run build` on every push (fast, no Docker needed). A scheduled/manual job for the Docker-based Tier 3 suite is the natural next step once the fast tier is in place. |
| 12 | No structured/correlated logging — diagnosing the real infrastructure bugs this session required manually reading and cross-referencing raw container logs by timestamp. | Medium | A lightweight request-id + structured logger would have cut debugging time significantly and pays for itself the next time something breaks at 11pm. |
| 13 | No dedicated `/api/health` endpoint checking downstream dependencies (PostgREST/GoTrue reachability) — monitoring guidance just hits `/`. | Low | Cheap to add; makes "is the app actually healthy" a real question instead of "did the homepage render." |
| 14 | Backups are documented (deployment runbook §9) but never actually drilled — no restore has ever been tested in this environment. | Medium | A backup nobody has restored from is a hope, not a backup. Worth one dry run before relying on it. |

### A.4 Scalability & performance

| # | Finding | Severity | Recommendation |
|---|---|---|---|
| 15 | **Redis and Meilisearch run as containers and do nothing** — search hits Postgres directly, entitlement checks hit Postgres directly, no caching layer is wired. This isn't wrong (both are legitimate deferred-scope decisions, already self-documented), but running unused infrastructure has a real resource cost on a memory-constrained free-tier VM and is worth naming as a decision to revisit, not just a footnote. | Low-Medium | Either wire them up (as originally designed) or remove them from the compose file until there's a concrete need — "provisioned but unused" is itself a smell worth resolving one way or the other. |
| 16 | `teacher_public` view recomputes `avg()`/`count()` over ALL reviews on every single search query — no materialized aggregate. | Low today, real at scale | Fine at hundreds of reviews. Before thousands: either a materialized view refreshed by a trigger, or denormalized `avg_rating`/`review_count` columns on `teacher_profile` maintained by a trigger on `review` insert/delete. |
| 17 | No index on `payment_transaction.subscription_id` (the join column used by every admin-payments query and by this review's own verification queries). | Low today | `create index on payment_transaction(subscription_id);` — cheap, do it now while it's a one-line migration instead of a production incident later. |

### A.5 Code quality & maintainability

| # | Finding | Severity | Recommendation |
|---|---|---|---|
| 18 | `eslint: { ignoreDuringBuilds: true }` in `next.config.mjs` — lint errors never block a build. A deliberate speed choice early on; worth revisiting now that the app has stabilized. | Low | Flip it once the existing lint debt (if any) is triaged. |
| 19 | Nearly every route uses `catch (err: any)`, losing type safety on the error shape. | Low | Cosmetic TypeScript hygiene; `catch (err: unknown)` + a narrowing helper is the stricter pattern. |
| 20 | No `docs/decisions/` (ADR) folder — several genuinely non-obvious calls this session (the `gotrue_conn` search_path fix, the `on conflict (email)` trigger change) only live in migration comments and `docs/04-test-report.md` prose. | Low | Not urgent, but the next non-obvious call is easier to make well if there's a two-paragraph precedent to read first. |

### A.6 Data model

| # | Finding | Severity | Recommendation |
|---|---|---|---|
| 21 | No `updated_at` columns anywhere (only `created_at`) — no way to tell when a profile was last edited without a dedicated audit table. | Low | Add if "recently updated" sorting or debugging ever needs it; not urgent. |
| 22 | Soft-delete has no periodic hard-purge job. Fine now; a real compliance question (GDPR-style "right to erasure") if this ever handles EU users at scale — soft-delete alone doesn't satisfy that. | Low today | Revisit if/when the user base includes anyone covered by such a regulation. |

### A.7 Testing

Already a genuine strength — 111 checks across unit/fake-integration/real-stack tiers
is well beyond what most projects this size have. Two real gaps:
- No browser/E2E testing (Playwright/Cypress) — every existing check is API-level;
  the actual rendered UI has only been spot-checked manually (this session's
  `grep`-on-HTML verification of the avatar/name display, for example).
- No load/concurrency testing — already self-documented as out of scope, restated
  here because it's the natural next investment once CI (A.3 #11) exists to run it.

### A.8 Priority summary

| Priority | Items |
|---|---|
| **P0 — before any real users** | #1 error sanitization, #2 rate limiting, #3 disable mailer autoconfirm + real SMTP, #4 security headers |
| **P1 — soon** | #11 CI pipeline, #5 zod validation, #9 search pagination, #8 response envelope, #12 structured logging |
| **P2 — scale-triggered** | #15 wire-or-remove Redis/Meilisearch, #16 materialized ratings, #17 the one missing index, Playwright E2E, ADRs, #6 JWT revocation |

None of these were implemented in this pass — they're recommendations for you to
prioritize, not applied changes. Say which ones you want done and I'll implement them
the same way everything else in this repo was built: with real tests against the
real stack, not just code that looks right.

---

## Part B — Naming recommendation

### B.1 Assessment of "TeacherCircle"

Not bad, but two real concerns, one confirmed by actual research rather than guessing:

1. **The "___Circle" pattern is generic in ed-tech.** A quick trademark/product
   search this session surfaced *EdCircle*, *MyCircle*, *SmallCircle*, and
   *NewCircle* as existing marks/products in adjacent space. No direct collision
   with "TeacherCircle" itself was found, but the pattern reads as a template
   rather than a distinctive brand — the kind of name five different people would
   independently arrive at.
2. **It doesn't carry the product's actual differentiators** — direct
   student/parent-to-teacher connection (no agency cut) and India-first pricing
   (UPI, INR) aren't present in the name at all.

### B.2 What was actually checked (and what wasn't)

Real web searches were run this session for several candidate names — this is a
lightweight collision check, **not** a trademark clearance or domain-availability
check. Treat "no results found" as "nothing obvious surfaced," not "confirmed free."

| Name | Result |
|---|---|
| TutorMitra | **Taken** — live platform at tutormitra.com (Ranchi-based, NEET/science focus) |
| TutorSetu | **Taken** — an existing production-grade tutor marketplace (Kolkata/Howrah) |
| Sikho / Shikho | **Taken** — multiple existing apps (an AI-tutor app and a large Bangladesh ed-tech platform) |
| GyanKonnect | **Taken** — an existing (different-sector) app of the same name |
| TeacherCircle | No direct collision found; "___Circle" pattern is common (see above) |
| Vidyaan | No collision found in this search |
| TeachKaksha | No collision found in this search |
| PadhaoConnect | No collision found in this search |
| GyanNear | No collision found in this search |

### B.3 Recommendation

Two strong candidates, in order of preference:

1. **Vidyaan** (from *vidya*, Sanskrit/Hindi for "knowledge") — short, distinctive,
   pronounceable across Indian languages, doesn't collide with an existing product
   in this search, and reads as a real brand rather than a generic compound. Domain
   pattern: `vidyaan.com` / `vidyaan.in` (availability not checked).
2. **TutorSetu**-*style* naming is clearly a validated pattern in this exact market
   (it's a working competitor's name) — but since that exact name is taken, a
   variant like **GyanSetu** ("knowledge bridge") keeps the resonant "setu" pattern
   without the collision. No hit found in this search, but check directly before
   committing — "setu" names are popular enough in Indian tech that a closer variant
   may exist.

**If you'd rather keep "TeacherCircle,"** that's a defensible choice — no direct
collision was found, and a consistent, already-built brand has real value over a
marginally-more-distinctive name. This is a judgment call between "correct enough,
already in use everywhere in this codebase" and "measurably more distinctive." I'd
lean toward keeping it unless you're about to invest in real marketing/SEO spend,
at which point the "___Circle" genericness becomes a real cost (harder to rank,
harder to trademark defensibly).

**Before committing to any new name**, do a proper check I can't do from here:
USPTO/India Trademark Registry search, and actual domain availability for
`.com`/`.in`. This session's web searches are a sanity check, not clearance.
