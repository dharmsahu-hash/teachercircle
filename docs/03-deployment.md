# TeacherCircle — Deployment

Two paths: local (your Mac, for development) and production (a free cloud VM,
for a real public URL). Both are $0.

---

## Part A — Local development

### Prerequisite: Docker Desktop

Installed and verified on this machine — the full stack below has actually been run,
not just described. See [docs/04-test-report.md](04-test-report.md) for the current
209/209 passing checks (35 of them against this real stack), and the real deployment
bugs found and fixed getting it there (a stale PostgREST schema cache, a missing
GoTrue connection role, an image that no longer pulls without login, and more).

### Run it

```bash
cd "/Users/dharmendrakumar/Desktop/my_data/project/Teacher_Circle"
docker compose up -d --build
docker compose ps                # wait until postgres shows healthy
./db/bootstrap.sh                # required — see docker-compose.yml for why
docker compose ps gotrue         # wait until gotrue shows healthy too
./db/run-migrations.sh           # also reloads PostgREST's schema cache
open http://localhost:3000
```

GoTrue will show `Restarting` for a bit after step 1 — that's expected; it
crash-loops harmlessly until `bootstrap.sh` runs, then recovers on its own
next retry (usually well under 60s, no restart needed).

Sign up with email/password (Google isn't configured locally by default),
pick a role, and if "teacher," fill in a profile. Open an incognito window,
sign up as "student," search, connect, and review.

### Becoming an admin locally

```bash
docker compose exec postgres psql -h 127.0.0.1 -U teachercircle -d postgres \
  -c "update users set role = 'admin' where email = 'you@example.com';"
```

Full local details, including enabling Google OAuth and the billing flag, live
in the repo's `README.md`.

---

## Part B — Production (free, no credit card)

**Superseded plan, kept below for history**: the original version of this section
documented an Oracle Cloud Free Tier VM + DuckDNS + Caddy. That's blocked for this
deployment — Oracle's Always Free tier still requires a card for identity
verification, and the user deploying this has none. Researched alternatives
(DigitalOcean, Fly.io, Netlify, Render) before landing here — all either require a
card outright, or (Render) delete free Postgres databases after ~44 days, unusable
for a real database. See the git history of this file for the old VM instructions if
you ever do get a VM with a card.

**Current plan: Vercel (app) + Supabase Cloud (Postgres + GoTrue + PostgREST,
managed).** Both confirmed free with no credit card. This isn't a different stack —
Supabase Cloud *is* Postgres+GoTrue+PostgREST, hosted; `db/migrations/*.sql` applies
almost unchanged. Meilisearch/Redis/MinIO are dropped entirely for this
deployment — none of them are actually wired into the app yet (see the "not wired
yet" list in `README.md`), so this costs nothing.

### Accounts needed (all $0, no card)

| Account | Note |
|---|---|
| GitHub | Holds the repo; Vercel and Supabase both authenticate via "Sign in with GitHub" |
| Supabase | Free project = hosted Postgres + Auth (GoTrue) + REST (PostgREST) |
| Vercel | Free Hobby plan; deploys the Next.js app straight from the GitHub repo |
| Google Cloud Console | OAuth client creation is free and unmetered — create a **fresh** client for production, never reuse the local-dev one |

### Step 1 — Supabase project

Supabase dashboard → New project → note the project URL
(`https://<project-ref>.supabase.co`) and the `sb_publishable_...` API key
(Settings → API). Keep the database password you set — you'll need it once, to run
migrations.

### Step 2 — Apply migrations

Run every migration **except `0000_bootstrap.sql`** — that file exists only to patch
around a plain-Postgres + standalone-GoTrue setup (a hand-rolled `auth.uid()`, `anon`/
`authenticated` roles); Supabase already provides all of that, better. Running it
against Supabase would overwrite Supabase's own `auth.uid()` function — confirmed by
inspecting it before and after on a real project, not assumed.

```bash
brew install postgresql@16   # for the psql client only — no local server needed

for f in db/migrations/00[0-9][0-9]_*.sql; do
  [[ "$f" == *0000_bootstrap.sql ]] && continue
  echo "Applying $f"
  PGPASSWORD='<your DB password>' psql -v ON_ERROR_STOP=1 \
    -h db.<project-ref>.supabase.co -p 5432 -U postgres -d postgres -f "$f"
done

PGPASSWORD='<your DB password>' psql -h db.<project-ref>.supabase.co -p 5432 \
  -U postgres -d postgres -c "NOTIFY pgrst, 'reload schema';"
```

(As of 2026-09-20 that's migrations `0001` through `0024`; the glob above
picks up whatever exists at the time you run it rather than needing to be
kept in sync by hand — the earlier version of this doc hardcoded the file
list through `0014` and had already gone stale by `0015`.)

**Critical, learned the hard way**: PostgREST caches the database schema at
startup and never notices a new table/view/function until told. The
`NOTIFY pgrst, 'reload schema';` above covers a full batch apply, but if you
apply a *single* migration later while iterating (patching something, adding
one more table), you must run that same `NOTIFY` again right after — skipping
it doesn't error loudly, it just makes the new capability silently 404/500 on
exactly the endpoint that needs it. This bit real work in this project twice
(rate limiting's `check_rate_limit` RPC, and the `teacher_response_time`/
`favorite_teacher` additions) before the habit stuck.

Verify: `curl -H "apikey: <publishable key>" https://<project-ref>.supabase.co/rest/v1/feature_flags?select=*`
should return the seeded row, not a 401.

### Step 3 — Google OAuth (fresh client, production only)

```
console.cloud.google.com → new project → APIs & Services → Credentials
→ Create Credentials → OAuth client ID → Web application
  Authorized redirect URI: https://<project-ref>.supabase.co/auth/v1/callback
```

Then paste the Client ID + Secret into **Supabase Dashboard → Authentication →
Providers → Google** and toggle it on — that's a Supabase control-plane setting, not
something any env var here can flip.

### Step 4 — Vercel

Vercel dashboard → Add New → Project → import the GitHub repo. In the project's
Environment Variables settings, add everything from `.env.production.example`:
`APP_HOSTNAME` (Vercel gives you this once the first deploy finishes, e.g.
`teachercircle.vercel.app` — circle back and fill it in after), `POSTGREST_URL`,
`GOTRUE_URL`, `GOTRUE_URL_BROWSER`, `SUPABASE_API_KEY`, `GOOGLE_OAUTH_ENABLED`,
`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `UPI_PAYEE_VPA`, `UPI_PAYEE_NAME`,
`BREVO_API_KEY` (message notifications — see `.env.production.example` for
why this is safe to leave unset if you don't need email notifications yet),
optionally `EMAIL_SENDER_ADDRESS`/`EMAIL_SENDER_NAME`. Deploy.

### Step 5 — Verify

```bash
curl -I https://<your-app>.vercel.app        # HTTP/2 200, Vercel's own free TLS
```

Then in a browser: sign in with Google end to end, complete role onboarding, create
a teacher profile, search, connect, leave feedback.

### Step 6 — First admin (production)

```bash
PGPASSWORD='<your DB password>' psql -h db.<project-ref>.supabase.co -p 5432 \
  -U postgres -d postgres -c "update users set role = 'admin' where email = 'you@example.com';"
```

### Step 7 — Keeping the free Supabase project awake

Free Supabase projects pause after 7 days with no database activity (first request
after that takes 10-30s to cold-start — not broken, just slow once). A scheduled
GitHub Actions workflow hitting the project on a cron is the standard free fix; add
one once the app is live.

### Step 8 — Turning on billing

Still ships UI-disabled — see `lib/featureToggles.ts` (`SUBSCRIPTION_UI_ENABLED`).
The underlying flow is unaffected by any of the above and works exactly as it did
locally once that flag flips.

### Step 9 — Google Analytics + Google AdSense (monetization)

The code for both already exists and does nothing until you set the two env
vars below — `components/GoogleAnalytics.tsx`, `components/AdSense.tsx`, and
`app/ads.txt/route.ts`. **The account creation and site-review steps have to
be done by you, signed into your own Google account** — this isn't something
that can be scripted or done on your behalf: it requires agreeing to
Google's own terms of service, and AdSense specifically requires a real
human review of the live site.

**Google Analytics (a few minutes, no review/approval needed):**
1. [analytics.google.com](https://analytics.google.com) → sign in with your Google account →
   Admin → Create Account → Create Property → give it a name (e.g. "TeacherCircle") →
   Web data stream → enter your production URL.
2. Copy the **Measurement ID** (starts `G-...`) from the data stream's details.
3. Add `NEXT_PUBLIC_GA_MEASUREMENT_ID=G-...` to Vercel's Environment Variables,
   redeploy. Traffic shows up in the GA4 dashboard within minutes (Realtime report is
   the fastest way to confirm it's working — open the site in another tab and watch
   yourself show up).

**Google AdSense (real review, can take days to a few weeks):**
1. [google.com/adsense](https://www.google.com/adsense) → sign in with your Google
   account → Sign up → enter your production site URL → connect your site.
2. AdSense needs a **Privacy Policy** disclosing use of cookies and personalized
   advertising before it will approve a site — already built at `/privacy`
   (`app/privacy/page.tsx`); nothing to add here unless you want to customize the wording.
3. Google gives you a snippet (`<script ... data-ad-client="ca-pub-...">`) — you
   don't need to paste this manually. Instead, take just the `ca-pub-XXXXXXXXXXXXXXXX`
   value and set `NEXT_PUBLIC_ADSENSE_CLIENT_ID` in Vercel, then redeploy. The same
   script `components/AdSense.tsx` adds is what Google's crawler uses to verify
   ownership, so this one step covers both "add the code" and "verify the site."
4. `app/ads.txt/route.ts` automatically publishes a correct `/ads.txt` once that env
   var is set — verify it directly (`curl https://<your-app>/ads.txt`) shows
   `google.com, pub-XXXXXXXXXXXXXXXX, DIRECT, f08c47fec0942fa0`. AdSense checks for
   this specifically; a missing or wrong ads.txt is one of the most common reasons ad
   revenue doesn't get attributed even after approval.
5. Google reviews the live site against its [AdSense program
   policies](https://support.google.com/adsense/answer/48182) — this takes real time
   (anywhere from under a day to a few weeks) and can be rejected if the site doesn't
   have enough original content or navigable structure yet. **Realistic expectation
   for this specific site right now**: with a single real teacher listing, approval
   may be rejected or delayed for "low value content" — growing real listings and
   traffic first will make approval more likely, not just faster.
6. Once approved, Auto Ads (Google's automatic ad placement, no manual ad-unit setup)
   starts showing ads with zero further code changes — this is already what
   `components/AdSense.tsx` enables. Toggle Auto Ads on/off or adjust ad density
   later from the AdSense dashboard itself, not from this codebase.

**What this doesn't include, on purpose**: no cookie-consent banner. Google's own
EU User Consent Policy technically expects one for EEA/UK visitors using
AdSense/Analytics; this app is India-focused per its own description and a full
consent-management setup is a real feature, not a one-line addition — revisit if
meaningful EU traffic ever shows up in Analytics.

### Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Every request to Supabase returns 401 | Missing `apikey` header | Confirm `SUPABASE_API_KEY` is set in Vercel — required on every `/rest/v1` and `/auth/v1` call, bearer token or not |
| Google sign-in errors after redirect | Redirect URI mismatch | Must exactly match `https://<project-ref>.supabase.co/auth/v1/callback` in both Google Console and Supabase's Google provider settings |
| Email/password signup succeeds but never logs the user in | Supabase's `mailer_autoconfirm` defaults to `false` (unlike local dev) | Expected — the UI now shows "check your email" (see `lib/gotrue.ts`'s `SignUpResult`); confirm the emailed link before signing in |
| App works, then goes slow/404s after a week of no traffic | Free Supabase project auto-paused | First request wakes it in 10-30s; set up the Step 7 keep-alive to avoid this going forward |
| `PGRST202 ... Could not find the function` from an RPC that definitely exists in a migration | PostgREST's schema cache hasn't been reloaded since that migration was applied | Run `NOTIFY pgrst, 'reload schema';` again — see the callout in Step 2 |
| Any real admin action, or any page whose RLS touches `is_admin()`, returns a 500 with no other explanation | You're on a copy of this database from before `0020_fix_is_admin_recursion.sql` was applied | Apply `0020` — `is_admin()` recurses into itself infinitely on Supabase's specific Postgres build otherwise (not reproducible on local Postgres 15.8); see `docs/04-test-report.md` §3i for the full story |
| `/ads.txt` is empty or 404s | `NEXT_PUBLIC_ADSENSE_CLIENT_ID` isn't set in Vercel, or you haven't redeployed since setting it | `NEXT_PUBLIC_*` vars are inlined at build time — setting one in Vercel's dashboard requires a new deploy to take effect, not just a page refresh |
| AdSense review comes back rejected | Usually "low value content" on a very new site, or the Privacy Policy link isn't easy to find | Grow real listings/content first and re-submit; confirm `/privacy` is reachable and linked from the footer (it is, by default) |
