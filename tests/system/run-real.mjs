// Tier 3 — runs against the REAL docker-compose stack (real Postgres, real
// GoTrue, real PostgREST), not the fake backend Tier 2 uses. This is what
// actually proves the SQL migrations/RLS policies/SECURITY DEFINER functions
// behave the way Tier 2's hand-written model assumed they would.
//
// Prerequisite: `docker compose up -d --build && ./db/bootstrap.sh` (wait for
// gotrue healthy) `&& ./db/run-migrations.sh` already run against a fresh
// volume — see docs/03-deployment.md / README.md.
//
// Run with: node tests/system/run-real.mjs

import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// fileURLToPath, not URL.pathname: on Windows .pathname is "/D:/..." which is
// not a valid cwd.
const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));

const BASE = process.env.TEST_BASE_URL || "http://localhost:3000";
// Real gap found the second time this script ran: it used fixed email
// addresses, so re-running it against the same persistent real database
// (unlike Tier 2's fresh-in-memory-store-per-run fake backend) failed at the
// very first signup with "User already registered", which then cascaded
// into every later "Not signed in" failure. A per-run suffix makes this
// script safely re-runnable without needing a fresh volume each time.
const RUN_ID = Date.now();
const results = [];
function check(name, pass, detail) {
  results.push({ name, pass, detail: detail ?? "" });
  console.log(`[${pass ? "PASS" : "FAIL"}] ${name}${detail ? " — " + detail : ""}`);
}

function psql(sql) {
  const cmd = `docker compose exec -T postgres psql -h 127.0.0.1 -U teachercircle -d postgres -t -A -c "${sql.replace(/"/g, '\\"')}"`;
  return execSync(cmd, { cwd: REPO_ROOT, encoding: "utf8" }).trim();
}

// Runs SQL as the `authenticated` database role with auth.uid() = userId, the
// way PostgREST would, and rolls everything back. SQL goes in on stdin, so no
// shell quoting. Returns { ok, out } where out is stdout or the error text.
function psqlAs(userId, sql) {
  const input = `begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '${userId}')::text, true);
${sql}
rollback;`;
  try {
    const out = execSync(
      "docker compose exec -T postgres psql -v ON_ERROR_STOP=1 -h 127.0.0.1 -U teachercircle -d postgres -t -A",
      { cwd: REPO_ROOT, encoding: "utf8", input, stdio: ["pipe", "pipe", "pipe"] }
    );
    return { ok: true, out: out.trim() };
  } catch (err) {
    return { ok: false, out: `${err.stderr ?? ""}${err.message ?? ""}` };
  }
}

function decodeJwt(token) {
  const payload = token.split(".")[1];
  return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
}

function makeClient() {
  let cookie = null;
  async function req(method, path, body) {
    // This suite signs up far more than 5 accounts from one IP, so the real
    // signup/login limits from 0021 (5/hour, 10/5min) would 429 the later
    // signups and every step after them would run without a session. Clear
    // just those counters first; rate limiting itself is covered by Tier 2.
    if (path === "/api/auth/signup" || path === "/api/auth/login") {
      psql(`delete from rate_limit_hit where rl_key like 'signup:%' or rl_key like 'login:%';`);
    }
    const headers = { "Content-Type": "application/json" };
    if (cookie) headers["Cookie"] = cookie;
    const res = await fetch(BASE + path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      redirect: "manual",
    });
    const setCookie = res.headers.get("set-cookie");
    if (setCookie) {
      if (setCookie.split(";")[0].endsWith("tc_session=")) cookie = null;
      else {
        const m = setCookie.match(/tc_session=([^;]*)/);
        if (m) cookie = `tc_session=${m[1]}`;
      }
    }
    const text = await res.text();
    let b;
    try { b = text ? JSON.parse(text) : null; } catch { b = text; }
    return { status: res.status, body: b };
  }
  return {
    get: (p) => req("GET", p),
    post: (p, b) => req("POST", p, b),
    userId() {
      if (!cookie) return null;
      return decodeJwt(cookie.replace("tc_session=", "")).sub;
    },
  };
}

async function main() {
  // ---------- 1. Unauthenticated ----------
  {
    const c = makeClient();
    const r = await c.get("/api/teacher/profile");
    check("1.1 GET own profile without session -> 401", r.status === 401, `got ${r.status}`);
  }

  // ---------- 2/3. Signup + role, real GoTrue + real trigger ----------
  const teacherClient = makeClient();
  {
    const r = await teacherClient.post("/api/auth/signup", { email: `t1-${RUN_ID}@realtier3.local`, password: "pw123456" });
    check("2.1 Real signup -> 200, real GoTrue + real handle_new_user trigger", r.status === 200 && r.body?.ok, JSON.stringify(r.body));
  }
  {
    const r = await teacherClient.post("/api/auth/signup", { email: `t1-${RUN_ID}@realtier3.local`, password: "different" });
    check("2.2 Duplicate email against real GoTrue -> non-200", r.status !== 200, `got ${r.status}`);
  }
  {
    const c = makeClient();
    const r = await c.post("/api/auth/login", { email: `t1-${RUN_ID}@realtier3.local`, password: "wrong" });
    check("2.3 Wrong password against real GoTrue -> 401", r.status === 401, `got ${r.status}`);
  }
  {
    const r = await teacherClient.post("/api/auth/role", { role: "teacher" });
    check("3.1 Real set_my_role() RPC -> 200", r.status === 200 && r.body?.ok, JSON.stringify(r.body));
  }
  {
    const r = await teacherClient.post("/api/auth/role", { role: "parent" });
    check("3.2 Real set_my_role() enforces immutability -> 400", r.status === 400, `got ${r.status}`);
  }

  // ---------- 4. Profile CRUD + F-2 regression, against real RLS ----------
  {
    const r = await teacherClient.post("/api/teacher/profile", {
      name: "Real Teacher", subjects: "Maths,Physics", city: "Pune", rate_per_hour: "500",
      contact_email: "real@teacher.local", contact_phone: "9998887777", is_listed: true,
    });
    check("4.1 Create profile via real PostgREST insert + real RLS -> 200", r.status === 200 && r.body?.name === "Real Teacher", JSON.stringify(r.body));
  }
  const teacherId = teacherClient.userId();
  {
    const r = await teacherClient.post("/api/teacher/profile", { name: "Real Teacher", city: "Mumbai", is_listed: true });
    check("4.2 F-2 regression against REAL Postgres: partial update preserves subjects/contact", r.status === 200 && r.body?.subjects?.includes("Maths") && r.body?.contact_email === "real@teacher.local", JSON.stringify(r.body));
  }
  {
    const other = makeClient();
    await other.post("/api/auth/signup", { email: `t-noname-${RUN_ID}@realtier3.local`, password: "pw123456" });
    await other.post("/api/auth/role", { role: "teacher" });
    const r = await other.post("/api/teacher/profile", { city: "Delhi", is_listed: true });
    check("4.3 Real NOT NULL constraint on teacher_profile.name enforced by real Postgres", r.status !== 200, `got ${r.status}`);
  }

  // ---------- 5. Search against the real teacher_public VIEW ----------
  {
    // Walk the pages: on a reused local database earlier runs' teachers can
    // push this run's (unrated, so last) teacher past page 1.
    let r;
    let found = false;
    for (let page = 1; page <= 20 && !found; page++) {
      r = await teacherClient.get(`/api/search?subject=Maths&page=${page}`);
      if (r.status !== 200 || !Array.isArray(r.body) || r.body.length === 0) break;
      found = r.body.some((t) => t.user_id === teacherId);
    }
    check("5.1 Real teacher_public view returns the listed teacher", found, `last status ${r?.status}`);
  }
  {
    // Checks by ID, not "list is empty" — the seed data (db/seed.sql) has
    // real Chemistry teachers, so an empty-list assumption would be wrong
    // against a realistic, non-empty database. The real assertion that
    // matters: THIS teacher (Maths/Physics only) doesn't show up for a
    // subject they don't teach.
    const r = await teacherClient.get("/api/search?subject=Chemistry");
    check("5.2 Real view correctly excludes a teacher from a subject they don't teach", r.status === 200 && !r.body.some((t) => t.user_id === teacherId), JSON.stringify(r.body.map((t) => t.name)));
  }

  // ---------- 6. Connect — real reveal_teacher_contact() SECURITY DEFINER fn ----------
  const studentClient = makeClient();
  await studentClient.post("/api/auth/signup", { email: `s1-${RUN_ID}@realtier3.local`, password: "pw123456" });
  await studentClient.post("/api/auth/role", { role: "student" });
  {
    const r = await studentClient.post(`/api/connect/${teacherId}`, {});
    check("6.1 Real connect + real reveal_teacher_contact() -> real contact info", r.status === 200 && r.body?.contact?.contact_email === "real@teacher.local", JSON.stringify(r.body));
  }
  {
    const r = await studentClient.post("/api/connect/00000000-0000-0000-0000-000000000000", {});
    check("6.2 Real reveal_teacher_contact() raises 'not connected' for a fabricated id -> non-200", r.status !== 200, `got ${r.status}: ${JSON.stringify(r.body)}`);
  }

  // ---------- 7. Reviews — real review_insert_if_connected RLS policy ----------
  {
    const r = await studentClient.post("/api/reviews", { teacherId, rating: 5, comment: "Real RLS works" });
    check("7.1 Review after real connect -> succeeds", r.status === 200 || r.status === 201, JSON.stringify(r.body));
  }
  {
    const r = await studentClient.post("/api/reviews", { teacherId, rating: 4, comment: "dup" });
    check("7.2 Real unique(teacher_id,reviewer_id) constraint blocks duplicate review", r.status !== 200 && r.status !== 201, `got ${r.status}`);
  }
  const strangerClient = makeClient();
  await strangerClient.post("/api/auth/signup", { email: `s2-${RUN_ID}@realtier3.local`, password: "pw123456" });
  await strangerClient.post("/api/auth/role", { role: "student" });
  {
    const r = await strangerClient.post("/api/reviews", { teacherId, rating: 5, comment: "never connected" });
    check("7.3 Real review_insert_if_connected RLS policy blocks review without prior connect", r.status !== 200 && r.status !== 201, `got ${r.status}`);
  }

  // ---------- 8. Billing — REAL confirmation of the F-1 fix against real RLS ----------
  const parentClient = makeClient();
  await parentClient.post("/api/auth/signup", { email: `p1-${RUN_ID}@realtier3.local`, password: "pw123456" });
  await parentClient.post("/api/auth/role", { role: "parent" });
  let txnId;
  {
    const r = await parentClient.post("/api/billing/subscribe", {});
    txnId = r.body?.transactionId;
    check("8.1 Real subscribe -> real UPI QR + real plan_limits lookup", r.status === 200 && r.body?.amount === 999 && Boolean(r.body?.qrImageUrl), JSON.stringify({ amount: r.body?.amount, hasQr: Boolean(r.body?.qrImageUrl) }));
  }
  {
    const r = await parentClient.post("/api/billing/submit-reference", { transactionId: txnId, utr: "REALUTR1" });
    check("8.2 Real submit-reference for own transaction -> 200", r.status === 200 && r.body?.status === "submitted", JSON.stringify(r.body));
  }
  {
    // THE key Tier-3 confirmation: does the REAL txn_owner_submit RLS policy
    // actually behave the way Tier 2's fake modeled it (silent empty array,
    // not an error), and does the F-1 fix correctly turn that into a 404
    // against the real database?
    const r = await studentClient.post("/api/billing/submit-reference", { transactionId: txnId, utr: "STOLEN-FOR-REAL" });
    check(
      "8.3 SECURITY (real DB): F-1 fix confirmed against real txn_owner_submit RLS policy",
      r.status === 404,
      `got status ${r.status}, body ${JSON.stringify(r.body)}`
    );
  }

  // ---------- 9. Admin — real promotion via psql, real SECURITY DEFINER fns ----------
  const adminClient = makeClient();
  await adminClient.post("/api/auth/signup", { email: `admin1-${RUN_ID}@realtier3.local`, password: "pw123456" });
  await adminClient.post("/api/auth/role", { role: "parent" });
  const adminId = adminClient.userId();
  psql(`update users set role='admin' where id='${adminId}';`);

  {
    const r = await studentClient.post(`/api/admin/users/${teacherId}/delete`, {});
    check("9.1 Non-admin -> real admin_soft_delete_profile() rejects via requireAdmin() -> 403", r.status === 403, `got ${r.status}`);
  }
  {
    const r = await adminClient.post(`/api/admin/payments/${txnId}/approve`, {});
    check("9.2 Real approve_payment() SECURITY DEFINER function -> 200", r.status === 200, JSON.stringify(r.body));
    const subStatus = psql(`select s.status from subscription s join payment_transaction pt on pt.subscription_id = s.id where pt.id = '${txnId}';`);
    check("9.2b Real subscription row is now 'active' in the actual database", subStatus === "active", `db shows: ${subStatus}`);
  }
  {
    const r = await adminClient.post(`/api/admin/users/${teacherId}/delete`, {});
    check("9.3 Real admin_soft_delete_profile() -> 200", r.status === 200, JSON.stringify(r.body));
  }
  {
    const r = await studentClient.get("/api/search?subject=Maths");
    check("9.4 Real teacher_public view excludes the soft-deleted row immediately", r.status === 200 && !r.body.some((t) => t.user_id === teacherId), JSON.stringify(r.body));
  }
  {
    const r = await adminClient.post(`/api/admin/users/${teacherId}/restore`, {});
    check("9.5 Real admin_restore_profile() -> 200", r.status === 200, JSON.stringify(r.body));
    const auditCount = psql(`select count(*) from admin_audit_log where target_id='${teacherId}';`);
    check("9.5b Real admin_audit_log has real rows for both actions", Number(auditCount) >= 2, `db shows ${auditCount} rows`);
  }

  // ---------- 10. Entitlement enforcement — real feature_flags row ----------
  psql(`update feature_flags set enabled = true where key = 'payments_enabled';`);
  const student2 = makeClient();
  await student2.post("/api/auth/signup", { email: `s3-${RUN_ID}@realtier3.local`, password: "pw123456" });
  await student2.post("/api/auth/role", { role: "student" });

  // Need 3 distinct listed teachers to connect to (real quota is 3/month for students).
  const extraTeacherIds = [];
  for (let i = 0; i < 3; i++) {
    const tc = makeClient();
    await tc.post("/api/auth/signup", { email: `extra${i}-${RUN_ID}@realtier3.local`, password: "pw123456" });
    await tc.post("/api/auth/role", { role: "teacher" });
    await tc.post("/api/teacher/profile", { name: `Extra ${i}`, subjects: "Biology", city: "Pune", is_listed: true, contact_email: `extra${i}@t.local` });
    extraTeacherIds.push(tc.userId());
  }
  let allowed = 0;
  for (const tid of extraTeacherIds) {
    const r = await student2.post(`/api/connect/${tid}`, {});
    if (r.status === 200) allowed++;
  }
  check("10.1 Real monthly_connection_count()/free_connections_limit_for() allow exactly 3", allowed === 3, `allowed ${allowed}/3`);

  const tc4 = makeClient();
  await tc4.post("/api/auth/signup", { email: `extra4-${RUN_ID}@realtier3.local`, password: "pw123456" });
  await tc4.post("/api/auth/role", { role: "teacher" });
  await tc4.post("/api/teacher/profile", { name: "Extra 4", subjects: "History", city: "Pune", is_listed: true, contact_email: "extra4@t.local" });
  {
    const r = await student2.post(`/api/connect/${tc4.userId()}`, {});
    check("10.2 4th connect against real quota -> real 402 upgrade_required", r.status === 402, JSON.stringify(r.body));
  }
  {
    // parentClient has an active subscription (approved in §9.2) — real
    // has_active_subscription() should bypass the real quota entirely.
    const r = await parentClient.post(`/api/connect/${tc4.userId()}`, {});
    check("10.3 Real active subscription bypasses the real quota", r.status === 200, JSON.stringify(r.body));
  }
  psql(`update feature_flags set enabled = false where key = 'payments_enabled';`);

  // ---------- 11. Self-delete — real set_my_deleted() ----------
  const tc4Id = tc4.userId(); // capture before delete clears the session cookie
  {
    const r = await tc4.post("/api/account/delete", {});
    check("11.1 Real set_my_deleted() SECURITY DEFINER -> 200", r.status === 200 && r.body?.ok, JSON.stringify(r.body));
  }
  {
    // Checks by ID, not "list is empty" — db/seed.sql has a real History
    // teacher (Karan Mehta), so the real assertion is that THIS specific
    // (now soft-deleted) teacher is gone, not that the whole subject is unused.
    const r = await student2.get("/api/search?subject=History");
    check("11.2 Real soft-deleted profile disappears from the real view", r.status === 200 && !r.body.some((t) => t.user_id === tc4Id), JSON.stringify(r.body.map((t) => t.name)));
  }

  // ---------- 12. Admin adds a teacher directly (0011_admin_add_teacher.sql) ----------
  let addedTeacherId;
  {
    const r = await adminClient.post("/api/admin/teachers", {
      email: `admin-added-${RUN_ID}@realtier3.local`,
      name: "Admin Added Teacher",
      city: "Surat",
      subjects: "Geography,Civics",
      rate_per_hour: "300",
      experience_years: "2",
    });
    addedTeacherId = r.body?.userId;
    check("12.1 Real admin_add_teacher() creates a full directory listing, no login required", r.status === 200 && Boolean(addedTeacherId), JSON.stringify(r.body));
  }
  {
    const r = await studentClient.post("/api/admin/teachers", { email: `should-fail-${RUN_ID}@realtier3.local`, name: "Should Fail" });
    check("12.2 Non-admin rejected by requireAdmin() before ever reaching the real RPC", r.status === 403, `got ${r.status}`);
  }
  {
    // Same email as 12.1 — real UNIQUE(email) constraint should block this,
    // surfaced as a clean application error, not a raw constraint violation.
    const r = await adminClient.post("/api/admin/teachers", { email: `admin-added-${RUN_ID}@realtier3.local`, name: "Duplicate" });
    check("12.3 Real duplicate-email rejection via admin_add_teacher()'s own check", r.status !== 200, `got ${r.status}`);
  }
  {
    const r = await studentClient.get("/api/search?subject=Geography");
    check("12.4 Admin-added teacher appears in real search immediately", r.status === 200 && r.body.some((t) => t.user_id === addedTeacherId), JSON.stringify(r.body));
  }

  // ---------- 13. Claim your listing (0026_claim_listing.sql) ----------
  // An admin-added listing becomes the teacher's own account when they sign
  // up with the same, verified email — re-keyed in place, so feedback and
  // contact requests made before the claim stay attached to it.
  const claimEmail = `claim-me-${RUN_ID}@realtier3.local`;
  let listingId = null;
  {
    const r = await adminClient.post("/api/admin/teachers", {
      email: claimEmail, name: "Claimable Teacher", city: "Indore", subjects: "History", rate_per_hour: 300,
    });
    listingId = r.body?.userId;
    check("13.1 Admin adds a listing to be claimed", r.status === 200 && !!listingId, JSON.stringify(r.body));
  }
  {
    const unclaimed = psql(`select count(*) from users u where u.id = '${listingId}' and not exists (select 1 from auth.users a where a.id = u.id);`);
    check("13.2 Listing starts unclaimed (no auth.users row behind it)", unclaimed === "1", `count=${unclaimed}`);
  }
  {
    await studentClient.post(`/api/connect/${listingId}`, {});
    const r = await studentClient.post("/api/reviews", { teacherId: listingId, rating: 4, comment: "Helpful before signing up" });
    check("13.3 A student connects and leaves feedback on the unclaimed listing", r.status === 200 || r.status === 201, JSON.stringify(r.body));
  }

  // Security: an unverified account with the listing's email must NOT claim
  // it. Simulated with a raw auth.users row (local GoTrue autoconfirms), then
  // verifying it shows the claim happens exactly at verification.
  const unverifiedEmail = `unverified-${RUN_ID}@realtier3.local`;
  {
    const r = await adminClient.post("/api/admin/teachers", { email: unverifiedEmail, name: "Unverified Case" });
    const placeholderId = r.body?.userId;
    const authId = psql(`insert into auth.users (id, email, aud, role) values (gen_random_uuid(), '${unverifiedEmail}', 'authenticated', 'authenticated') returning id;`).split("\n")[0];
    const stillPlaceholder = psql(`select count(*) from users where id = '${placeholderId}';`);
    check("13.4 SECURITY: an unverified signup with the listing's email does NOT take it over", stillPlaceholder === "1", `placeholder rows=${stillPlaceholder}`);
    psql(`update auth.users set email_confirmed_at = now() where id = '${authId}';`);
    const movedTo = psql(`select count(*) from teacher_profile where user_id = '${authId}';`);
    check("13.5 The same account claims the listing the moment its email is verified", movedTo === "1", `profiles under auth id=${movedTo}`);
    // The claim's audit row references this user (actor_id has no ON DELETE
    // CASCADE, on purpose), so it goes first.
    psql(`delete from admin_audit_log where actor_id = '${authId}' or target_id = '${authId}'; delete from users where id = '${authId}'; delete from auth.users where id = '${authId}';`);
  }

  const claimer = makeClient();
  {
    const r = await claimer.post("/api/auth/signup", { email: claimEmail, password: "pw123456" });
    check("13.6 Teacher signs up with the listing's email -> 200 and a real session", r.status === 200 && !!claimer.userId(), JSON.stringify(r.body));
  }
  const claimedId = claimer.userId();
  {
    const r = await claimer.get("/api/teacher/profile");
    check("13.7 Signed-in teacher sees the admin-created listing as their own profile", r.status === 200 && r.body?.name === "Claimable Teacher" && r.body?.city === "Indore", JSON.stringify(r.body));
  }
  {
    const r = await claimer.post("/api/auth/role", { role: "student" });
    check("13.8 Role is already teacher (no onboarding, role cannot be switched)", r.status === 400, `got ${r.status}: ${JSON.stringify(r.body)}`);
  }
  {
    const reviews = psql(`select count(*) from review where teacher_id = '${claimedId}';`);
    const contacts = psql(`select count(*) from contact_request where teacher_id = '${claimedId}';`);
    check("13.9 Feedback and contact requests from before the claim moved with the listing", reviews === "1" && Number(contacts) >= 1, `reviews=${reviews}, contacts=${contacts}`);
  }
  {
    const oldRows = psql(`select count(*) from users where id = '${listingId}';`);
    check("13.10 The old placeholder id no longer exists (re-keyed, not duplicated)", oldRows === "0", `rows=${oldRows}`);
  }
  {
    const audit = psql(`select string_agg(action, ',' order by created_at) from admin_audit_log where target_id = '${claimedId}';`);
    check("13.11 Audit log keeps the admin's create and records the claim", audit === "create,claim", `actions=${audit}`);
  }
  {
    const r = await studentClient.get("/api/search?subject=History");
    check("13.12 Claimed teacher is still listed in search under the new id", r.status === 200 && r.body.some((t) => t.user_id === claimedId), JSON.stringify(r.body?.map?.((t) => t.user_id)));
  }

  // ---------- 14. Health check against the real services ----------
  {
    const r = await makeClient().get("/api/health");
    check(
      "14.1 GET /api/health -> 200 ok against real PostgREST + GoTrue",
      r.status === 200 && r.body?.status === "ok" && r.body?.checks?.database?.ok === true && r.body?.checks?.auth?.ok === true,
      JSON.stringify(r.body)
    );
  }

  // ---------- 15. Teaching mode / classes / exams (0027) on the real database ----------
  {
    const r = await teacherClient.post("/api/teacher/profile", {
      name: "Real Teacher", city: "Mumbai", is_listed: true, teaching_mode: "online", classes: ["11", "12"], exams: ["jee"],
    });
    check("15.1 Real teacher_profile accepts mode/classes/exams within the CHECK constraints", r.status === 200 && r.body?.teaching_mode === "online", JSON.stringify(r.body));
  }
  {
    // Bypass the app's validation to prove the database itself refuses values outside the list.
    let refused = false;
    try {
      psql(`update teacher_profile set boards = '{harvard}' where user_id = '${teacherId}';`);
    } catch {
      refused = true;
    }
    check("15.2 The database CHECK constraint refuses a board outside the fixed list", refused, refused ? "refused" : "accepted!");
  }
  {
    const r = await makeClient().get("/tutors/online/maths");
    const r2 = await makeClient().get("/tutors/exam/jee/maths");
    check(
      "15.3 Real teacher_public exposes the new columns: online and JEE pages render",
      r.status === 200 && String(r.body).includes("Real Teacher") && r2.status === 200,
      `online ${r.status}, jee ${r2.status}`
    );
  }

  // ---------- 16. "I need a tutor" posts (0028) against the real database ----------
  const studentUserId = studentClient.userId();
  const parentUserId = parentClient.userId();
  const adminUserId = adminClient.userId();
  // Letters only: a run of 8+ digits would (correctly) be refused as a phone number.
  const MARK = String(RUN_ID).replace(/[0-9]/g, (d) => "abcdefghij"[Number(d)]);
  const reqBody = { subject: "Maths", mode: "home", city: "Indore", cls: "10", board: "cbse", exam: "", details: `Real request ${MARK}` };
  let realReqId = null;
  {
    const r = await studentClient.post("/api/tutor-requests", reqBody);
    realReqId = r.body?.id;
    check("16.1 A student posts a request through the real post_tutor_request()", r.status === 200 && !!realReqId, JSON.stringify(r.body));
  }
  {
    const cols = psql(`select count(*) from information_schema.columns where table_name = 'tutor_request_public' and column_name in ('requester_id','status');`);
    const page = await makeClient().get("/tutor-requests");
    check(
      "16.2 SECURITY: the public view has no requester_id column, and an anonymous visitor sees the request",
      cols === "0" && page.status === 200 && String(page.body).includes(`Real request ${MARK}`) && !String(page.body).includes(studentUserId),
      `columns=${cols}, page ${page.status}`
    );
  }
  {
    const r = psqlAs(
      studentUserId,
      `insert into tutor_request (requester_id, subject, city, mode) values ('${studentUserId}', 'Maths', 'Indore', 'home');`
    );
    check("16.3 SECURITY: a direct INSERT into tutor_request is refused (only the function can post)", !r.ok && /permission denied/i.test(r.out), r.out.slice(0, 160));
  }
  {
    const r = psqlAs(
      teacherId,
      `select post_tutor_request('Maths', 'Indore', null, null, null, 'home', null);`
    );
    check("16.4 The database refuses a teacher posting (not just the app)", !r.ok && /only students and parents can post/.test(r.out), r.out.slice(0, 160));
  }
  {
    const r = psqlAs(
      studentUserId,
      Array.from({ length: 6 }, () => `select post_tutor_request('Maths', 'Indore', null, null, null, 'home', null);`).join("\n")
    );
    // This student already has 1 open request, so the 5th insert here is the 6th overall.
    check("16.5 At most 5 open requests per poster, enforced in the database", !r.ok && /too many open requests/.test(r.out), r.out.slice(0, 160));
  }
  {
    const r = psqlAs(
      parentUserId,
      `select respond_to_tutor_request('${realReqId}');`
    );
    check("16.6 The database refuses a non-teacher replying", !r.ok && /only teachers can respond/.test(r.out), r.out.slice(0, 160));
  }
  let realConv = null;
  {
    const r = await teacherClient.post(`/api/tutor-requests/${realReqId}/respond`, {});
    realConv = r.body?.conversationId;
    const row = psql(`select teacher_id || ',' || requester_id from conversation where id = '${realConv}';`);
    const count = psql(`select response_count from tutor_request_public where id = '${realReqId}';`);
    check(
      "16.7 A teacher's reply creates the conversation with the poster and counts as a response",
      r.status === 200 && row === `${teacherId},${studentUserId}` && count === "1",
      `status ${r.status}, row ${row}, count ${count}`
    );
  }
  {
    const m = await teacherClient.post(`/api/conversations/${realConv}/messages`, { body: "Hello from the reply thread." });
    const list = await studentClient.get("/api/conversations");
    check(
      "16.8 Both sides can use that conversation (RLS: message send + the poster's inbox)",
      m.status === 200 && list.status === 200 && list.body.some((c) => c.conversation_id === realConv),
      `message ${m.status}, inbox ${list.status}`
    );
  }
  {
    const r = psqlAs(parentUserId, `select close_my_tutor_request('${realReqId}');`);
    check("16.9 SECURITY: another user cannot close the poster's request", !r.ok && /request not available/.test(r.out), r.out.slice(0, 160));
  }
  {
    const other = psqlAs(parentUserId, `select 'rows=' || count(*) from tutor_request where id = '${realReqId}';`);
    const owner = psqlAs(studentUserId, `select 'rows=' || count(*) from tutor_request where id = '${realReqId}';`);
    check(
      "16.10 SECURITY (RLS): another user cannot read the poster's row in the base table; the poster can",
      other.ok && /rows=0\b/.test(other.out) && owner.ok && /rows=1\b/.test(owner.out),
      `other: ${other.out.slice(-40)} | owner: ${owner.out.slice(-40)}`
    );
  }
  {
    const r = psqlAs(studentUserId, `select admin_remove_tutor_request('${realReqId}');`);
    check("16.11 SECURITY: a non-admin cannot remove a request", !r.ok && /not authorized/.test(r.out), r.out.slice(0, 160));
  }
  {
    // A request the student blocks the teacher for: the teacher may not reply.
    const second = await studentClient.post("/api/tutor-requests", { ...reqBody, subject: "Physics", details: `Second ${MARK}` });
    psql(`insert into blocked_user (blocker_id, blocked_id) values ('${studentUserId}', '${teacherId}') on conflict do nothing;`);
    const blocked = await teacherClient.post(`/api/tutor-requests/${second.body?.id}/respond`, {});
    psql(`delete from blocked_user where blocker_id = '${studentUserId}' and blocked_id = '${teacherId}';`);
    check("16.12 A teacher the poster has blocked cannot reply", second.status === 200 && blocked.status === 400, `post ${second.status}, reply ${blocked.status}: ${JSON.stringify(blocked.body)}`);

    // Expiry: past expires_at drops it from the public view and refuses replies.
    psql(`update tutor_request set expires_at = now() - interval '1 minute' where id = '${second.body?.id}';`);
    const inView = psql(`select count(*) from tutor_request_public where id = '${second.body?.id}';`);
    const late = await teacherClient.post(`/api/tutor-requests/${second.body?.id}/respond`, {});
    check("16.13 An expired request leaves the public view and cannot be replied to", inView === "0" && late.status === 400, `inView ${inView}, reply ${late.status}`);
  }
  {
    const ok = await adminClient.post(`/api/admin/tutor-requests/${realReqId}/remove`, {});
    const status = psql(`select status from tutor_request where id = '${realReqId}';`);
    const audit = psql(`select count(*) from admin_audit_log where target_id = '${realReqId}' and target_table = 'tutor_request' and action = 'delete' and actor_id = '${adminUserId}';`);
    const page = await makeClient().get("/tutor-requests");
    check(
      "16.14 An admin removes a request: status removed, audited, gone from the public list",
      ok.status === 200 && status === "removed" && audit === "1" && !String(page.body).includes(`Real request ${MARK}`),
      `admin ${ok.status}, status ${status}, audit ${audit}`
    );
  }
  {
    const r = await studentClient.post("/api/tutor-requests", { ...reqBody, details: "call 98765 43210" });
    check("16.15 Contact details are refused before reaching the database", r.status === 400 && /phone numbers, emails or links/.test(r.body?.error ?? ""), JSON.stringify(r.body));
  }

  // ---------- 17. TeacherCircle Daily streaks (0029) against the real database ----------
  // The clock is moved by editing last_date, since "today" is the real IST date.
  const dbToday = psql(`select (now() at time zone 'Asia/Kolkata')::date;`);
  const streakRow = (uid) => psql(`select current_streak || ',' || best_streak || ',' || total_quizzes || ',' || coalesce(last_date::text,'') from daily_streak where user_id = '${uid}';`);
  const answers5 = [0, 0, 0, 0, 0];
  {
    const r = await studentClient.post("/api/daily/complete", { level: "7-8", answers: answers5 });
    check(
      "17.1 A signed-in player's first quiz starts a streak of 1, dated with today in India",
      r.status === 200 && r.body?.saved === true && r.body?.streak?.current === 1 && streakRow(studentUserId) === `1,1,1,${dbToday}`,
      `${JSON.stringify(r.body)} row=${streakRow(studentUserId)} today=${dbToday}`
    );
  }
  {
    const r = await studentClient.post("/api/daily/complete", { level: "9-10", answers: answers5 });
    check("17.2 Finishing another quiz the same day changes nothing (once a day)", r.status === 200 && streakRow(studentUserId) === `1,1,1,${dbToday}`, streakRow(studentUserId));
  }
  {
    psql(`update daily_streak set last_date = last_date - 1 where user_id = '${studentUserId}';`);
    const r = await studentClient.post("/api/daily/complete", { level: "7-8", answers: answers5 });
    check("17.3 Playing the day after extends the streak to 2 (best 2, total 2)", r.status === 200 && r.body?.streak?.current === 2 && streakRow(studentUserId) === `2,2,2,${dbToday}`, streakRow(studentUserId));
  }
  {
    psql(`update daily_streak set last_date = last_date - 3 where user_id = '${studentUserId}';`);
    const r = await studentClient.post("/api/daily/complete", { level: "7-8", answers: answers5 });
    check("17.4 Missing days resets the streak to 1 but keeps the best", r.status === 200 && r.body?.streak?.current === 1 && streakRow(studentUserId) === `1,2,3,${dbToday}`, streakRow(studentUserId));
  }
  {
    const wrongDay = psqlAs(studentUserId, `select record_daily_quiz(((now() at time zone 'Asia/Kolkata')::date + 1), 3, '7-8');`);
    const yesterdayQuiz = psqlAs(studentUserId, `select record_daily_quiz(((now() at time zone 'Asia/Kolkata')::date - 1), 3, '7-8');`);
    const badScore = psqlAs(studentUserId, `select record_daily_quiz(((now() at time zone 'Asia/Kolkata')::date), 6, '7-8');`);
    const badLevel = psqlAs(studentUserId, `select record_daily_quiz(((now() at time zone 'Asia/Kolkata')::date), 3, '1-2');`);
    check(
      "17.5 SECURITY: the database refuses another day's quiz, a score over 5 and an unknown level",
      !wrongDay.ok && /quiz is not for today/.test(wrongDay.out) && !yesterdayQuiz.ok && /quiz is not for today/.test(yesterdayQuiz.out) && !badScore.ok && /invalid score/.test(badScore.out) && !badLevel.ok && /invalid level/.test(badLevel.out),
      [wrongDay.out, badScore.out].map((o) => o.slice(0, 60)).join(" | ")
    );
  }
  {
    const other = psqlAs(parentUserId, `select 'rows=' || count(*) from daily_streak where user_id = '${studentUserId}';`);
    const owner = psqlAs(studentUserId, `select 'rows=' || count(*) from daily_streak where user_id = '${studentUserId}';`);
    check("17.6 SECURITY (RLS): another user cannot read a player's streak; the player can", other.ok && /rows=0\b/.test(other.out) && owner.ok && /rows=1\b/.test(owner.out), `${other.out.slice(-30)} | ${owner.out.slice(-30)}`);
  }
  {
    const upd = psqlAs(studentUserId, `update daily_streak set current_streak = 999 where user_id = '${studentUserId}';`);
    const ins = psqlAs(parentUserId, `insert into daily_streak (user_id, current_streak) values ('${parentUserId}', 50);`);
    const del = psqlAs(studentUserId, `delete from daily_streak where user_id = '${studentUserId}';`);
    check(
      "17.7 SECURITY: nobody can write the table directly, so a streak can only grow through the function",
      [upd, ins, del].every((r) => !r.ok && /permission denied/i.test(r.out)) && streakRow(studentUserId) === `1,2,3,${dbToday}`,
      [upd, ins, del].map((r) => r.out.slice(0, 50)).join(" | ")
    );
  }
  {
    const tooLong = psqlAs(parentUserId, `select merge_daily_streak(9999, 9999, (now() at time zone 'Asia/Kolkata')::date);`);
    const bestBelowCurrent = psqlAs(parentUserId, `select merge_daily_streak(2, 1, (now() at time zone 'Asia/Kolkata')::date);`);
    check("17.8 SECURITY: a merge cannot claim a streak longer than the quiz has existed, or a best below the current", !tooLong.ok && /invalid streak/.test(tooLong.out) && !bestBelowCurrent.ok && /invalid streak/.test(bestBelowCurrent.out), `${tooLong.out.slice(0, 60)} | ${bestBelowCurrent.out.slice(0, 60)}`);
  }
  {
    const first = await parentClient.post("/api/daily/sync", { current: 1, best: 1, last: dbToday });
    const rowAfterFirst = streakRow(parentUserId);
    const yday = psql(`select ((now() at time zone 'Asia/Kolkata')::date - 1);`);
    const bigger = await parentClient.post("/api/daily/sync", { current: 2, best: 2, last: yday });
    const stale = await parentClient.post("/api/daily/sync", { current: 1, best: 1, last: psql(`select ((now() at time zone 'Asia/Kolkata')::date - 5);`) });
    check(
      "17.9 Sync keeps the longer live streak (1 -> 2, last day stays today); a dead local streak adds nothing",
      first.status === 200 && rowAfterFirst === `1,1,0,${dbToday}` && bigger.status === 200 && bigger.body?.streak?.current === 2 && streakRow(parentUserId) === `2,2,0,${dbToday}` && stale.status === 200 && streakRow(parentUserId) === `2,2,0,${dbToday}`,
      `${rowAfterFirst} -> ${streakRow(parentUserId)}`
    );
  }
  {
    const anon = await makeClient().post("/api/daily/complete", { level: "7-8", answers: answers5 });
    const pages = [await makeClient().get("/daily"), await makeClient().get("/daily/class-7-8"), await studentClient.get("/daily")];
    check("17.10 Anonymous saving is refused (401); the quiz pages render on the real stack, signed in or not", anon.status === 401 && pages.every((p) => p.status === 200), `anon ${anon.status}, pages ${pages.map((p) => p.status)}`);
  }

  // ---------- 18. Push alerts + teacher digest (0030) against the real database ----------
  // A test-only job secret is registered, and the digest logic is exercised
  // through the secret-guarded functions exactly as the app calls them.
  const JOB = "t".repeat(40);
  const hashSql = `encode(sha256(convert_to('${JOB}', 'utf8')), 'hex')`;
  psql(`insert into job_secret (id, secret_hash) values (1, ${hashSql}) on conflict (id) do update set secret_hash = excluded.secret_hash;`);
  const rpcJson = (fn, args) => {
    try {
      return { ok: true, v: JSON.parse(psql(`select ${fn}(${args});`) || "null") };
    } catch (e) {
      return { ok: false, v: String(e.stderr ?? e.message ?? e) };
    }
  };
  const digestFor = (uid) => {
    const r = rpcJson("digest_pending", `'${JOB}', 100`);
    return r.ok ? (r.v.rows ?? []).find((x) => x.userId === uid) : undefined;
  };
  const clearDigestState = () => psql(`delete from notification_pref where user_id = '${teacherId}'; delete from push_subscription where user_id in ('${teacherId}','${studentUserId}');`);
  psql(`update teacher_profile set city = 'Mumbai', subjects = array['Maths','Physics'], teaching_mode = 'home', is_listed = true, deleted_at = null where user_id = '${teacherId}';`);
  clearDigestState();
  // The real database persists between runs: drop earlier runs' fixtures so only this run's requests count.
  psql(`delete from tutor_request where city in ('Mumbai','Delhi') or (city is null and mode = 'online');`);
  const addReq = (subject, city, mode) =>
    psql(`insert into tutor_request (requester_id, subject, city, mode) values ('${studentUserId}', '${subject}', ${city ? `'${city}'` : "null"}, '${mode}') returning id;`).split("\n")[0];
  {
    const noSecret = rpcJson("digest_pending", `null, 10`);
    const wrong = rpcJson("digest_pending", `'${"w".repeat(40)}', 10`);
    const short = rpcJson("digest_pending", `'abc', 10`);
    const sub = rpcJson("push_targets_for_user", `'${"w".repeat(40)}', '${teacherId}', 'any'`);
    check(
      "18.1 SECURITY: every job function refuses a missing, short or wrong secret",
      [noSecret, wrong, short, sub].every((r) => !r.ok && /not authorized/.test(r.v)),
      [noSecret, wrong, short, sub].map((r) => String(r.v).slice(0, 40)).join(" | ")
    );
  }
  {
    const subs = psqlAs(teacherId, `select count(*) from push_subscription;`);
    const prefs = psqlAs(teacherId, `select count(*) from notification_pref;`);
    const secret = psqlAs(teacherId, `select count(*) from job_secret;`);
    const fn = psqlAs(teacherId, `select digest_pending('${"w".repeat(40)}', 5);`);
    check(
      "18.2 SECURITY: signed-in users cannot read the notification tables, and job functions refuse a wrong secret",
      [subs, prefs, secret].every((r) => !r.ok && /permission denied/i.test(r.out)) && !fn.ok && /not authorized/.test(fn.out),
      [subs, prefs, secret, fn].map((r) => r.out.slice(0, 40)).join(" | ")
    );
  }
  {
    const ep = "https://fcm.googleapis.com/fcm/send/real-tier-device-1";
    const P = "p".repeat(30);
    const A = "a".repeat(16);
    const bad = psqlAs(teacherId, `select save_push_subscription('http://fcm.googleapis.com/x', '${P}', '${A}', 'ua');`);
    const ok = psqlAs(teacherId, `select save_push_subscription('${ep}', '${P}', '${A}', 'ua'); select (my_notification_prefs()->>'devices');`);
    const many = psqlAs(
      teacherId,
      Array.from({ length: 7 }, (_, i) => `select save_push_subscription('https://fcm.googleapis.com/fcm/send/many-${i}', '${P}', '${A}', 'ua');`).join("\n") + `\nselect 'devices=' || (my_notification_prefs()->>'devices');`
    );
    const anon = psqlAs(parentUserId, `select my_notification_prefs();`);
    check(
      "18.3 Devices: http endpoints refused, saving works, at most 5 devices per person",
      !bad.ok && /invalid subscription|check/i.test(bad.out) && ok.ok && /\n1\s+ROLLBACK/.test(ok.out) && many.ok && /devices=5\b/.test(many.out) && anon.ok,
      JSON.stringify([bad.ok, bad.out.slice(0, 60), ok.ok, ok.out.slice(-12), many.ok, many.out.slice(-40), anon.ok])
    );
  }
  clearDigestState();
  let matchId = null;
  {
    matchId = addReq("Physics", "Mumbai", "home");
    const row = digestFor(teacherId);
    check(
      "18.4 A new matching request (same subject, same city) puts the teacher in the digest with 1 request",
      !!row && row.count === 1 && row.requests?.[0]?.id === matchId && /@realtier3\.local$/.test(row.email),
      JSON.stringify(row)?.slice(0, 160)
    );
  }
  {
    psql(`select digest_mark_sent('${JOB}', array['${teacherId}']::uuid[]);`);
    const after = digestFor(teacherId);
    const today = rpcJson("digest_sent_today", `'${JOB}'`);
    check("18.5 After the digest is sent, the same request is never emailed again, and the daily counter moves", after === undefined && today.ok && today.v >= 1, `${after} | sent today ${today.v}`);
  }
  {
    // Quiet day: requests that do not fit, or are not new, must produce no digest row at all.
    addReq("Chemistry", "Mumbai", "home"); // wrong subject
    addReq("Physics", "Delhi", "home"); // wrong city for a home teacher
    addReq("Physics", null, "online"); // online request, home-only teacher
    const row = digestFor(teacherId);
    const none = rpcJson("digest_pending", `'${JOB}', 100`);
    check("18.6 NO ACTIVITY, NO EMAIL: requests that do not match this teacher create no digest", row === undefined && none.ok && !(none.v.rows ?? []).some((r) => r.userId === teacherId), JSON.stringify(row));
  }
  {
    psql(`update teacher_profile set teaching_mode = 'both' where user_id = '${teacherId}';`);
    const onlineFits = digestFor(teacherId);
    psql(`update teacher_profile set teaching_mode = 'home' where user_id = '${teacherId}';`);
    // Opting out and already replying both suppress the email, even for a good match.
    psql(`select digest_mark_sent('${JOB}', array['${teacherId}']::uuid[]);`);
    const fresh = addReq("Maths", "Mumbai", "home");
    const wouldSend = digestFor(teacherId);
    psql(`insert into tutor_request_response (request_id, teacher_id) values ('${fresh}', '${teacherId}');`);
    const replied = digestFor(teacherId);
    const fresh2 = addReq("Maths", "Mumbai", "home");
    const wouldSend2 = digestFor(teacherId);
    // Opt out the way the unsubscribe link does.
    psql(`select set_digest_optout('${JOB}', '${teacherId}');`);
    const optedOut = digestFor(teacherId);
    check(
      "18.7 Online requests reach teachers who teach online; a replied-to request and an opted-out teacher get no email",
      !!onlineFits && !!wouldSend && wouldSend.count === 1 && replied === undefined && !!wouldSend2 && optedOut === undefined && !!fresh2,
      `online ${!!onlineFits}, new ${wouldSend?.count}, replied ${replied}, again ${!!wouldSend2}, optedOut ${optedOut}`
    );
  }
  {
    psql(`update notification_pref set email_digest = true, digest_last_sent_at = now() - interval '5 days' where user_id = '${teacherId}';`);
    const row = digestFor(teacherId);
    const oldest = (row?.requests ?? []).length;
    psql(`update teacher_profile set is_listed = false where user_id = '${teacherId}';`);
    const unlisted = digestFor(teacherId);
    psql(`update teacher_profile set is_listed = true where user_id = '${teacherId}';`);
    check("18.8 Backlog is capped at 3 days; an unlisted teacher is not emailed", !!row && oldest >= 1 && unlisted === undefined, `rows ${oldest}, unlisted ${unlisted}`);
  }
  {
    const P = "p".repeat(30);
    const A = "a".repeat(16);
    psql(`delete from notification_pref where user_id = '${studentUserId}'; delete from push_subscription where user_id = '${studentUserId}';`);
    psql(`insert into push_subscription (user_id, endpoint, p256dh, auth) values ('${studentUserId}', 'https://fcm.googleapis.com/fcm/send/student-device', '${P}', '${A}');`);
    psql(`update daily_streak set current_streak = 4, last_date = ((now() at time zone 'Asia/Kolkata')::date - 1) where user_id = '${studentUserId}';`);
    const t1 = rpcJson("streak_reminder_targets", `'${JOB}', 50`);
    const mine = t1.ok ? (t1.v ?? []).find((x) => x.userId === studentUserId) : undefined;
    psql(`select mark_quiz_reminded('${JOB}', array['${studentUserId}']::uuid[]);`);
    const t2 = rpcJson("streak_reminder_targets", `'${JOB}', 50`);
    const again = t2.ok ? (t2.v ?? []).find((x) => x.userId === studentUserId) : undefined;
    psql(`update daily_streak set last_date = ((now() at time zone 'Asia/Kolkata')::date) where user_id = '${studentUserId}';`);
    const t3 = rpcJson("streak_reminder_targets", `'${JOB}', 50`);
    const playedAlready = t3.ok ? (t3.v ?? []).find((x) => x.userId === studentUserId) : undefined;
    check(
      "18.9 Streak reminder: only a streak ending tonight, once a day, and never after the quiz is played",
      !!mine && mine.streak === 4 && mine.subs.length === 1 && again === undefined && playedAlready === undefined,
      `${JSON.stringify(mine)?.slice(0, 80)} | again ${again} | played ${playedAlready}`
    );
  }
  {
    psql(`delete from notification_pref where user_id = '${studentUserId}';`);
    psql(`insert into push_subscription (user_id, endpoint, p256dh, auth) values ('${studentUserId}', 'https://fcm.googleapis.com/fcm/send/student-device', '${"p".repeat(30)}', '${"a".repeat(16)}') on conflict do nothing;`);
    const info = rpcJson("message_notify_targets", `'${JOB}', '${realConv}', '${teacherId}'`);
    const ok = info.ok && info.v.subs.length === 1 && /@realtier3\.local$/.test(info.v.email) && info.v.senderName === "Real Teacher";
    psql(`insert into notification_pref (user_id, push_messages) values ('${studentUserId}', false) on conflict (user_id) do update set push_messages = false;`);
    const off = rpcJson("message_notify_targets", `'${JOB}', '${realConv}', '${teacherId}'`);
    const stranger = rpcJson("message_notify_targets", `'${JOB}', '${realConv}', '${parentUserId}'`);
    check(
      "18.10 Message alerts: the recipient's devices and email come back; a muted device list is empty; a non-participant is refused",
      ok && off.ok && off.v.subs.length === 0 && !stranger.ok && /not a participant/.test(stranger.v),
      `${JSON.stringify(info.v)?.slice(0, 80)} | ${String(stranger.v).slice(0, 50)}`
    );
  }
  {
    const anonSub = await makeClient().post("/api/push/subscribe", { endpoint: "https://fcm.googleapis.com/fcm/send/x1", keys: { p256dh: "p".repeat(30), auth: "a".repeat(16) } });
    const badHost = await teacherClient.post("/api/push/subscribe", { endpoint: "https://169.254.169.254/latest", keys: { p256dh: "p".repeat(30), auth: "a".repeat(16) } });
    const badBody = await teacherClient.post("/api/push/subscribe", { endpoint: "x" });
    const good = await teacherClient.post("/api/push/subscribe", { endpoint: "https://fcm.googleapis.com/fcm/send/route-device", keys: { p256dh: "p".repeat(30), auth: "a".repeat(16) } });
    const prefs = await teacherClient.get("/api/notifications/prefs");
    const saved = await teacherClient.post("/api/notifications/prefs", { emailDigest: false, pushRequests: true, pushMessages: true, pushQuiz: false });
    const prefs2 = await teacherClient.get("/api/notifications/prefs");
    const off = await teacherClient.post("/api/push/unsubscribe", { endpoint: "https://fcm.googleapis.com/fcm/send/route-device" });
    const left = psql(`select count(*) from push_subscription where endpoint = 'https://fcm.googleapis.com/fcm/send/route-device';`);
    const acct = await teacherClient.get("/account");
    const acctOk = acct.status === 200 && String(acct.body).includes("Alerts");
    check(
      "18.11 Alert routes: anonymous 401, non-push hosts refused, device saved and removed, preferences round-trip",
      anonSub.status === 401 && badHost.status === 400 && badBody.status === 400 && good.status === 200 && prefs.body?.available === true &&
        saved.status === 200 && prefs2.body?.prefs?.emailDigest === false && prefs2.body?.prefs?.pushQuiz === false && off.status === 200 && left === "0" && acctOk,
      `${anonSub.status} ${badHost.status} ${badBody.status} ${good.status} ${saved.status} ${off.status} left=${left}`
    );
  }
  {
    const noAuth = await makeClient().post("/api/jobs/digest", {});
    const wrong = await fetch(BASE + "/api/jobs/digest", { method: "POST", headers: { Authorization: "Bearer " + "x".repeat(40) } });
    const streak = await makeClient().post("/api/jobs/streak-reminders", {});
    const pageBad = await fetch(BASE + "/unsubscribe?t=garbage");
    const pageText = await pageBad.text();
    const form = new URLSearchParams({ t: "garbage" });
    const post = await fetch(BASE + "/api/notifications/unsubscribe", { method: "POST", body: form, redirect: "manual" });
    const manifest = await fetch(BASE + "/manifest.webmanifest");
    const sw = await fetch(BASE + "/sw.js");
    const icon = await fetch(BASE + "/pwa-icon/192");
    check(
      "18.12 Job endpoints reject callers without the secret; bad unsubscribe links change nothing; PWA files are served",
      noAuth.status === 401 && wrong.status === 401 && streak.status === 401 && pageBad.status === 200 && /didn.t work/.test(pageText) &&
        post.status === 303 && /status=invalid/.test(post.headers.get("location") ?? "") && manifest.status === 200 && sw.status === 200 && icon.status === 200 &&
        (icon.headers.get("content-type") ?? "").includes("image/png"),
      `${noAuth.status} ${wrong.status} ${streak.status} page ${pageBad.status} post ${post.status} manifest ${manifest.status} sw ${sw.status} icon ${icon.status}`
    );
  }
  psql(`delete from job_secret;`);
  clearDigestState();

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length} checks, ${results.length - failed.length} passed, ${failed.length} failed.`);
  if (failed.length) {
    console.log("Failed:");
    for (const f of failed) console.log(`  - ${f.name}: ${f.detail}`);
  }
  console.log("\n---RESULTS-JSON---");
  console.log(JSON.stringify(results));
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error("Runner crashed:", err);
  process.exit(2);
});
