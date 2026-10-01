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

const BASE = "http://localhost:3000";
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
