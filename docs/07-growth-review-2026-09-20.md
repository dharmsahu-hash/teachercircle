# TeacherCircle — Traffic Growth Review (2026-09-20)

**Method:** direct inspection of the current codebase (confirmed via grep/read, not
assumed) to find real gaps specific to organic traffic growth for a directory site —
not a generic "SEO checklist," and not overlapping what P1 (§06 review) already
shipped (sitemap.xml, robots.txt, per-teacher metadata, schema.org JSON-LD).

**Confirmed absent right now** (checked directly, not guessed):
- No blog/content section anywhere in `app/`
- No city or subject hub/index pages — `app/search` is the only search surface,
  purely `?subject=X&city=Y` query strings, no crawlable pretty URLs
- No WhatsApp/social share button anywhere in the UI
- No referral/invite mechanism
- `app/sitemap.ts` only lists 4 static routes + one entry per real teacher —
  currently **1 real listing**, `db/seed.sql`'s 14 rows are demo data, not real supply
- No Google Search Console verification set up — nothing has ever told Google
  to actually crawl/index this site on demand; it's relying on passive discovery

**The core problem, stated plainly:** a directory site's organic traffic is a
function of how many distinct, keyword-matchable pages it has. Today there is
effectively **one** real indexable listing and **zero** city/subject landing pages.
No amount of on-page SEO polish (already done in P1) fixes a content-volume
problem — the recommendations below are ordered by how directly they address that,
not by which is flashiest to build.

---

## Recommendations, prioritized by traffic-growth leverage vs. effort

### G1 — City + subject SEO landing pages (highest leverage)

Add crawlable, pretty-URL pages like `/tutors/bangalore/maths` (city + subject) and
`/tutors/bangalore` (city only) that render the same underlying `teacher_public`
query as `/search` today, but with real, unique on-page copy per combination
("Find a Maths tutor in Bangalore — X verified listings, real feedback from
parents...") and their own `generateMetadata`/JSON-LD, added to `sitemap.ts`.

**Why this is #1**: this is exactly how JustDial/UrbanPro/Sulekha rank for
thousands of long-tail searches ("physics tutor kanpur") that a single generic
`/search` page never will — Google needs a *page*, not a query string, to rank for
a specific search intent. Critically, **this works even with today's tiny listing
count** — build the template once, and every new teacher who signs up in a new
city/subject automatically gets a new indexable page with zero extra work. This is
the highest-leverage, longest-compounding item on this list precisely because it
starts paying off before there's much content, not after.

**Honest caveat**: a landing page with 0–1 teachers reads as thin content to
Google, and pages should probably only be generated (and included in the sitemap)
for city/subject combinations that actually have at least one real listing —
worth deciding the exact threshold before shipping, not guessing at a number now.

### G2 — WhatsApp share button on teacher profiles

A single `wa.me/?text=...` link on `/teacher/[id]` ("Share this teacher") —
trivial to build, no new schema, no third-party account needed. WhatsApp is the
dominant sharing channel in India specifically (unlike most Western markets), so
this converts "I found a good tutor" into a real, tracked (via a UTM-tagged link)
referral channel that Google's algorithm has no say over at all.

### G3 — City/subject browse (hub) pages

`/tutors` (or similar) listing every city with at least one real listing, and every
subject, as plain internal links. Two things at once: a genuinely more usable
"I don't know exactly what to search" entry point for real visitors, *and* the
internal-linking scaffold that helps Google actually discover and crawl all of
G1's individual landing pages — a page search engines can't find any link to is
functionally invisible no matter how well-optimized it is.

### G4 — Google Search Console setup (not code — a deployment step)

Nothing today actively tells Google "here's the sitemap, please crawl this."
Add site verification (a meta tag or DNS record — Search Console gives you the
exact one) and submit `sitemap.xml` there. This is the difference between passive
"maybe a bot finds it eventually" and actively requesting indexing, plus it's the
only way to actually *see* what's ranking, what's getting impressions, and what
search terms are already finding the site — real, free data neither Analytics nor
AdSense usage. Belongs in `docs/03-deployment.md` as a numbered step, same
treatment as GA4/AdSense.

### G5 — Lightweight referral / "invite a teacher" mechanism

A shareable link on `/account` ("Invite a teacher you know") that pre-fills a
signup flow, plus a small counter so the inviter sees it worked. This is the
two-sided-marketplace growth loop that actually fixes the root problem named
above (more listings → more indexable pages from G1 → more organic search
traffic → more students → more reason for more teachers to join). Ranked below
G1–G4 only because it depends on people acting on it, not because it's lower-
leverage in principle — a referral mechanism with 14 teachers is much less
valuable than the same mechanism once G1's SEO pages start pulling in real search
traffic to convert.

### G6 — Blog / content pages (lower priority for this stage)

Evergreen articles ("How to choose a Maths tutor for CBSE Class 10 boards",
"Tutor vs. coaching center: what's actually different") drive long-tail search
traffic and are a real, standard growth lever — but they need genuinely written
content, not just a template, and pay off over months rather than being switched
on. Worth doing once G1–G4 are live and there's bandwidth for regular writing;
premature to build the infrastructure for zero articles today.

---

## What's deliberately not on this list

- **Paid acquisition (Google Ads)** — the user already clarified this session
  that the goal is earning money (AdSense), not spending it on ads; growth here
  means organic/free channels only, consistent with that decision.
- **Core Web Vitals / performance tuning** — already fast (Next.js SSR, minimal
  client JS); not a real bottleneck at current traffic levels. Revisit if
  Search Console (G4) ever actually flags it.
- **Additional structured data types** (BreadcrumbList, etc.) — genuinely useful
  once G1/G3's hub pages exist to put breadcrumbs on; premature before that.

None of G1–G6 has been implemented in this pass — this is a review and
recommendation, same standard as `docs/06-review-2026-09-20.md` before it. Say
which ones to build and they'll be implemented the same way everything else in
this repo was: real tests, applied locally and on production, verified live —
not just code that looks right.
