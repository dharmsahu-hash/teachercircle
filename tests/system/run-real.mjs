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
  return execSync(cmd, { cwd: new URL("../../", import.meta.url).pathname, encoding: "utf8" }).trim();
}

function decodeJwt(token) {
  const payload = token.split(".")[1];
  return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
}

function makeClient() {
  let cookie = null;
  async function req(method, path, body) {
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
    const r = await teacherClient.get("/api/search?subject=Maths");
    check("5.1 Real teacher_public view returns the listed teacher", r.status === 200 && r.body.some((t) => t.user_id === teacherId), JSON.stringify(r.body.map((t) => t.name)));
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
