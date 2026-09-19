// System/integration test runner — Tier 2 of the test strategy (see
// docs/04-test-report.md). Exercises the REAL Next.js route handlers over
// real HTTP, against the fake GoTrue/PostgREST backend in tests/fakes/. This
// validates application-layer correctness (request handling, status codes,
// auth wiring, business-rule sequencing). It does NOT validate the actual SQL
// migrations/RLS policies — that needs the real Postgres stack (Tier 3,
// blocked on Docker Desktop — see the report).
//
// Run with: node tests/system/run.mjs

import { spawn } from "node:child_process";
import { createFakeBackend } from "../fakes/fake-backend.mjs";

const APP_PORT = 3100;
const GOTRUE_PORT = 19999;
const POSTGREST_PORT = 13001;
const BASE = `http://localhost:${APP_PORT}`;

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass, detail: detail ?? "" });
  const mark = pass ? "PASS" : "FAIL";
  console.log(`[${mark}] ${name}${detail ? " — " + detail : ""}`);
}

// Auto-incrementing fake IP per client so the new rate limiter (keyed by
// x-forwarded-for, see lib/rateLimit.ts) doesn't treat every test "user" as
// one shared caller the way a real deployment never would — each makeClient()
// call represents a distinct real user in production, so it gets a distinct
// IP here too, unless a test deliberately passes one to exercise the limiter.
let nextFakeIp = 1;

function makeClient(ip) {
  const clientIp = ip ?? `10.0.0.${nextFakeIp++}`;
  let cookie = null;
  async function req(method, path, body) {
    const headers = { "Content-Type": "application/json", "x-forwarded-for": clientIp };
    if (cookie) headers["Cookie"] = cookie;
    const res = await fetch(BASE + path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      redirect: "manual",
    });
    const setCookie = res.headers.get("set-cookie");
    if (setCookie) {
      if (/tc_session=;/.test(setCookie) || /tc_session=$/.test(setCookie.split(";")[0])) {
        cookie = null;
      } else {
        const m = setCookie.match(/tc_session=([^;]*)/);
        if (m) cookie = `tc_session=${m[1]}`;
      }
    }
    const text = await res.text();
    let body_;
    try {
      body_ = text ? JSON.parse(text) : null;
    } catch {
      body_ = text;
    }
    return { status: res.status, body: body_, location: res.headers.get("location") };
  }
  return {
    get: (p) => req("GET", p),
    post: (p, b) => req("POST", p, b),
    patch: (p, b) => req("PATCH", p, b),
    del: (p) => req("DELETE", p),
    clearCookie: () => (cookie = null),
  };
}

async function waitForReady(url, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { redirect: "manual" });
      if (res.status < 500) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

async function main() {
  const backend = createFakeBackend();
  await backend.listen(GOTRUE_PORT, POSTGREST_PORT);
  console.log(`Fake GoTrue on :${GOTRUE_PORT}, fake PostgREST on :${POSTGREST_PORT}`);

  const child = spawn("npx", ["next", "start", "-p", String(APP_PORT)], {
    cwd: new URL("../../", import.meta.url).pathname,
    env: {
      ...process.env,
      POSTGREST_URL: `http://localhost:${POSTGREST_PORT}`,
      GOTRUE_URL: `http://localhost:${GOTRUE_PORT}`,
      UPI_PAYEE_VPA: "test@upi",
      UPI_PAYEE_NAME: "TestPayee",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let serverLog = "";
  child.stdout.on("data", (d) => (serverLog += d));
  child.stderr.on("data", (d) => (serverLog += d));

  const ready = await waitForReady(BASE, 30000);
  if (!ready) {
    console.error("Next.js server did not become ready in time. Server log:\n" + serverLog);
    child.kill();
    await backend.close();
    process.exit(2);
  }
  console.log(`Next.js app on :${APP_PORT}\n`);

  try {
    await runScenarios(backend);
  } catch (err) {
    console.error("Runner crashed:", err);
  } finally {
    child.kill();
    await backend.close();
  }

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length} checks, ${results.length - failed.length} passed, ${failed.length} failed.`);
  if (failed.length) {
    console.log("\nFailed checks:");
    for (const f of failed) console.log(`  - ${f.name}: ${f.detail}`);
  }

  // Machine-readable output for the report generator.
  console.log("\n---RESULTS-JSON---");
  console.log(JSON.stringify(results));

  process.exit(failed.length ? 1 : 0);
}

async function runScenarios(backend) {
  // ---------- 1. Unauthenticated access ----------
  {
    const c = makeClient();
    const r = await c.get("/api/teacher/profile");
    check("1.1 GET own teacher profile without session -> 401", r.status === 401, `got ${r.status}`);
  }
  {
    const c = makeClient();
    const r = await c.post("/api/connect/some-fake-id", {});
    check("1.2 POST connect without session -> 401", r.status === 401, `got ${r.status}`);
  }
  {
    const c = makeClient();
    const r = await c.get("/admin/users");
    check("1.3 GET /admin/users without session -> redirect (not 200)", r.status >= 300 && r.status < 400, `got ${r.status}`);
  }

  // ---------- 2. Signup — positive & negative ----------
  const teacherClient = makeClient();
  {
    const r = await teacherClient.post("/api/auth/signup", { email: "teacher1@test.local", password: "pw123456" });
    check("2.1 Signup with valid email+password -> 200", r.status === 200 && r.body?.ok === true, JSON.stringify(r.body));
  }
  {
    const c = makeClient();
    const r = await c.post("/api/auth/signup", { email: "", password: "" });
    check("2.2 Signup with empty email+password -> 400", r.status === 400, `got ${r.status}`);
  }
  {
    const c = makeClient();
    const r = await c.post("/api/auth/signup", { email: "teacher1@test.local", password: "different" });
    check("2.3 Signup with already-registered email -> non-200", r.status !== 200, `got ${r.status}`);
  }
  {
    const c = makeClient();
    const r = await c.post("/api/auth/login", { email: "teacher1@test.local", password: "wrong-password" });
    check("2.4 Login with wrong password -> 401", r.status === 401, `got ${r.status}`);
  }
  {
    const c = makeClient();
    const r = await c.post("/api/auth/login", { email: "teacher1@test.local", password: "pw123456" });
    check("2.5 Login with correct password -> 200", r.status === 200 && r.body?.ok === true, JSON.stringify(r.body));
  }

  // ---------- 3. Role assignment — positive & negative ----------
  {
    const r = await teacherClient.post("/api/auth/role", { role: "not-a-real-role" });
    check("3.1 Assign invalid role value -> 400", r.status === 400, `got ${r.status}`);
  }
  {
    const r = await teacherClient.post("/api/auth/role", { role: "teacher" });
    check("3.2 Assign valid role (teacher) -> 200", r.status === 200 && r.body?.ok, JSON.stringify(r.body));
  }
  {
    const r = await teacherClient.post("/api/auth/role", { role: "parent" });
    check("3.3 Re-assign role after already set -> 400 (immutable)", r.status === 400, `got ${r.status}: ${JSON.stringify(r.body)}`);
  }

  // ---------- 4. Teacher profile CRUD — positive & negative ----------
  {
    const r = await teacherClient.get("/api/teacher/profile");
    check("4.1 GET own profile before creating one -> 200 null", r.status === 200 && r.body === null, JSON.stringify(r.body));
  }
  {
    const r = await teacherClient.post("/api/teacher/profile", {
      name: "Meera Rao",
      subjects: "Maths, Physics",
      city: "Pune",
      rate_per_hour: "500",
      contact_email: "meera@example.com",
      contact_phone: "9990001111",
      is_listed: true,
    });
    check("4.2 Create teacher profile with required fields -> 200", r.status === 200 && r.body?.name === "Meera Rao", JSON.stringify(r.body));
  }
  {
    // `name` omitted on a brand-new profile (no existing row to fall back to)
    // -> normalize() maps that to `null`, which trips the NOT NULL
    // constraint. Uses a separate, fresh account so this exercises the
    // INSERT path, not the UPDATE path (see 4.4b below for why that split
    // matters after fixing F-2).
    const freshTeacher = makeClient();
    await freshTeacher.post("/api/auth/signup", { email: "teacher-noname@test.local", password: "pw123456" });
    await freshTeacher.post("/api/auth/role", { role: "teacher" });
    const r = await freshTeacher.post("/api/teacher/profile", { city: "Pune", is_listed: true });
    check("4.3 Create profile with name omitted (-> null) -> rejected (not-null constraint)", r.status !== 200, `got ${r.status}`);
  }
  {
    const r = await teacherClient.post("/api/teacher/profile", { name: "Meera R.", city: "Mumbai", is_listed: true });
    check("4.4 Update own profile (city change) -> 200", r.status === 200 && r.body?.city === "Mumbai", JSON.stringify(r.body));
  }
  {
    // Regression test for F-2: updating just the city must NOT wipe fields
    // that weren't part of this request (subjects, contact info, etc.).
    const r = await teacherClient.post("/api/teacher/profile", { name: "Meera R.", city: "Bengaluru", is_listed: true });
    check(
      "4.4b F-2 regression: partial update preserves fields not included in the request",
      r.status === 200 &&
        Array.isArray(r.body?.subjects) &&
        r.body.subjects.includes("Maths") &&
        r.body?.contact_email === "meera@example.com",
      JSON.stringify(r.body)
    );
  }

  // ---------- 4c. P2: self-attestation (honest, teacher-declared only) ----------
  let firstAttestedAt;
  {
    const r = await teacherClient.post("/api/teacher/profile", { name: "Meera R.", city: "Bengaluru", is_listed: true, self_attested: true });
    firstAttestedAt = r.body?.self_attested_at;
    check("4c.1 Checking self-attestation sets self_attested_at -> 200", r.status === 200 && Boolean(firstAttestedAt), JSON.stringify(r.body));
  }
  {
    // Saving again with the box still checked must NOT bump the timestamp
    // forward on every unrelated edit — it should read as "when they first
    // confirmed," not "when they last saved anything."
    const r = await teacherClient.post("/api/teacher/profile", { name: "Meera R.", city: "Pune", is_listed: true, self_attested: true });
    check("4c.2 Re-saving with the box still checked preserves the original timestamp", r.status === 200 && r.body?.self_attested_at === firstAttestedAt, JSON.stringify(r.body));
  }
  {
    const r = await teacherClient.post("/api/teacher/profile", { name: "Meera R.", city: "Pune", is_listed: true, self_attested: false });
    check("4c.3 Unchecking clears self_attested_at", r.status === 200 && r.body?.self_attested_at === null, JSON.stringify(r.body));
  }
  {
    // Re-listed as attested for the rest of the suite (e.g. search visibility below).
    await teacherClient.post("/api/teacher/profile", { name: "Meera R.", city: "Bengaluru", is_listed: true, self_attested: true });
  }

  // A second teacher, unlisted, for search-visibility negative tests.
  const teacher2Client = makeClient();
  await teacher2Client.post("/api/auth/signup", { email: "teacher2@test.local", password: "pw123456" });
  await teacher2Client.post("/api/auth/role", { role: "teacher" });
  await teacher2Client.post("/api/teacher/profile", { name: "Unlisted Teacher", subjects: "Chemistry", city: "Pune", is_listed: false });

  // ---------- 5. Search — positive & negative ----------
  {
    const r = await teacherClient.get("/api/search?subject=Maths");
    check("5.1 Search by matching subject -> finds the teacher", r.status === 200 && r.body.some((t) => t.name === "Meera R."), JSON.stringify(r.body));
    const meera = r.body.find((t) => t.name === "Meera R.");
    check("5.1b Search results include self_attested_at for a self-confirmed teacher", Boolean(meera?.self_attested_at), JSON.stringify(meera));
  }
  {
    const r = await teacherClient.get("/api/search?subject=French");
    check("5.2 Search by non-matching subject -> empty result", r.status === 200 && r.body.length === 0, JSON.stringify(r.body));
  }
  {
    const r = await teacherClient.get("/api/search?subject=Chemistry");
    check("5.3 Unlisted profile never appears in search", r.status === 200 && !r.body.some((t) => t.name === "Unlisted Teacher"), JSON.stringify(r.body));
  }

  // ---------- 6. Connect + entitlement (flag OFF) ----------
  const studentClient = makeClient();
  await studentClient.post("/api/auth/signup", { email: "student1@test.local", password: "pw123456" });
  await studentClient.post("/api/auth/role", { role: "student" });
  const meeraId = [...backend.db.teacher_profile.keys()].find((id) => backend.db.teacher_profile.get(id).name === "Meera R.");

  {
    const r = await studentClient.post(`/api/connect/${meeraId}`, {});
    check("6.1 Connect while payments_enabled=false -> 200 with contact info", r.status === 200 && r.body?.contact?.contact_email === "meera@example.com", JSON.stringify(r.body));
  }
  {
    const r = await studentClient.post(`/api/connect/${meeraId}`, {});
    check("6.2 Repeat connect (flag off) -> still 200, no quota applied", r.status === 200, JSON.stringify(r.body));
  }
  {
    const r = await studentClient.post("/api/connect/non-existent-teacher-id", {});
    check("6.3 Connect to a non-existent teacher id -> not a 200 success with contact", r.status !== 200 || !r.body?.contact, `status ${r.status}, body ${JSON.stringify(r.body)}`);
  }

  // ---------- 7. Reviews — positive & negative ----------
  {
    const r = await studentClient.post("/api/reviews", { teacherId: meeraId, rating: 5, comment: "Great!" });
    check("7.1 Review after connecting -> success", r.status === 200 || r.status === 201, JSON.stringify(r.body));
  }
  {
    const r = await studentClient.post("/api/reviews", { teacherId: meeraId, rating: 4, comment: "again" });
    check("7.2 Duplicate review same teacher -> rejected", r.status !== 200 && r.status !== 201, `got ${r.status}`);
  }
  const teacher2Id = [...backend.db.teacher_profile.keys()].find((id) => backend.db.teacher_profile.get(id).name === "Unlisted Teacher");
  {
    const r = await studentClient.post("/api/reviews", { teacherId: teacher2Id, rating: 5, comment: "never met them" });
    check("7.3 Review WITHOUT prior connection -> rejected", r.status !== 200 && r.status !== 201, `got ${r.status}`);
  }
  {
    const r = await studentClient.post("/api/reviews", { teacherId: meeraId, rating: 6, comment: "out of range" });
    check("7.4 Review with rating=6 (out of range) -> rejected", r.status !== 200 && r.status !== 201, `got ${r.status}`);
  }

  // ---------- 8. Billing — positive & negative ----------
  const parentClient = makeClient();
  await parentClient.post("/api/auth/signup", { email: "parent1@test.local", password: "pw123456" });
  await parentClient.post("/api/auth/role", { role: "parent" });

  let txnId;
  {
    const r = await parentClient.post("/api/billing/subscribe", {});
    txnId = r.body?.transactionId;
    check("8.1 Subscribe (parent) -> returns UPI QR + deep link", r.status === 200 && Boolean(r.body?.qrImageUrl) && r.body.amount === 999, JSON.stringify({ status: r.status, amount: r.body?.amount, hasQr: Boolean(r.body?.qrImageUrl) }));
  }
  {
    const r = await parentClient.post("/api/billing/submit-reference", { transactionId: txnId, utr: "UTR12345" });
    check("8.2 Submit UTR for own transaction -> 200 submitted", r.status === 200 && r.body?.status === "submitted", JSON.stringify(r.body));
  }
  {
    // SECURITY-RELEVANT NEGATIVE CASE: another signed-in user submits a UTR
    // against the FIRST user's transactionId (client-supplied, guessable/enumerable).
    const r = await studentClient.post("/api/billing/submit-reference", { transactionId: txnId, utr: "STOLEN-UTR" });
    check(
      "8.3 SECURITY: submit-reference for ANOTHER user's transactionId must NOT report success",
      r.status !== 200 || r.body?.status !== "submitted",
      `got status ${r.status}, body ${JSON.stringify(r.body)} — see report finding F-1`
    );
  }

  // ---------- 9. Admin console — positive & negative ----------
  const adminClient = makeClient();
  await adminClient.post("/api/auth/signup", { email: "admin1@test.local", password: "pw123456" });
  await adminClient.post("/api/auth/role", { role: "parent" }); // placeholder role before manual promotion
  backend.promoteAdmin("admin1@test.local");

  {
    const r = await studentClient.post(`/api/admin/users/${meeraId}/delete`, {});
    check("9.1 Non-admin calling admin delete route -> 403", r.status === 403, `got ${r.status}`);
  }
  {
    const r = await adminClient.get(`/api/admin/payments`);
    check("9.2 (sanity) no bespoke GET admin payments API route exists (page fetches server-side)", r.status === 404, `got ${r.status}`);
  }
  {
    const r = await adminClient.post(`/api/admin/payments/${txnId}/approve`, {});
    check("9.3 Admin approves the pending payment -> 200", r.status === 200, JSON.stringify(r.body));
    const sub = [...backend.db.subscription.values()].find((s) => s.status === "active");
    check("9.3b Subscription is now active after approval", Boolean(sub), "no active subscription found");
  }
  {
    const r = await adminClient.post(`/api/admin/payments/${txnId}/approve`, {});
    check("9.4 Re-approving an already-approved transaction -> rejected", r.status !== 200, `got ${r.status}`);
  }
  {
    const r = await adminClient.post(`/api/admin/users/${meeraId}/delete`, {});
    check("9.5 Admin soft-deletes a teacher profile -> 200", r.status === 200, JSON.stringify(r.body));
  }
  {
    const r = await studentClient.get("/api/search?subject=Maths");
    check("9.6 Admin-deleted profile disappears from search immediately", r.status === 200 && !r.body.some((t) => t.user_id === meeraId), JSON.stringify(r.body));
  }
  {
    const r = await adminClient.post(`/api/admin/users/${meeraId}/restore`, {});
    check("9.7 Admin restores the profile -> 200", r.status === 200, JSON.stringify(r.body));
    const auditRows = backend.db.admin_audit_log.filter((a) => a.target_id === meeraId);
    check("9.7b Both delete and restore are recorded in the audit log", auditRows.length >= 2, `${auditRows.length} entries`);
  }
  {
    // Real bug found while adding P2 tests, unrelated to P2 itself: restore
    // used to only clear deleted_at and never re-set is_listed, so a
    // restored profile stayed permanently invisible in search. Fixed in
    // 0023_fix_admin_restore_relisting.sql.
    const r = await studentClient.get("/api/search?subject=Maths");
    check("9.7c Restored profile is searchable again (not permanently unlisted)", r.status === 200 && r.body.some((t) => t.user_id === meeraId), JSON.stringify(r.body));
  }
  // FR-21: admin creates a profile for an already-registered, profile-less teacher.
  const teacher3Client = makeClient();
  await teacher3Client.post("/api/auth/signup", { email: "teacher3@test.local", password: "pw123456" });
  await teacher3Client.post("/api/auth/role", { role: "teacher" });
  const teacher3Id = [...backend.db.users.values()].find((u) => u.email === "teacher3@test.local").id;
  {
    const r = await adminClient.post(`/api/admin/users/${teacher3Id}/create-teacher`, { name: "Admin-Created Profile", city: "Delhi" });
    check("9.8 Admin creates a profile on behalf of a registered, profile-less teacher (FR-21)", r.status === 200, JSON.stringify(r.body));
    check("9.8b Profile now exists in the store", backend.db.teacher_profile.has(teacher3Id), "not found");
  }

  // ---------- 10. Entitlement enforcement (flag ON) ----------
  backend.db.feature_flags.payments_enabled = true;
  const student2Client = makeClient();
  await student2Client.post("/api/auth/signup", { email: "student2@test.local", password: "pw123456" });
  await student2Client.post("/api/auth/role", { role: "student" });

  const teacherIds = [meeraId, teacher2Id, teacher3Id];
  let allowedCount = 0;
  for (const tid of teacherIds) {
    const r = await student2Client.post(`/api/connect/${tid}`, {});
    if (r.status === 200) allowedCount++;
  }
  check("10.1 Student (limit 3) can connect to exactly 3 teachers with flag on", allowedCount === 3, `allowed ${allowedCount}/3`);

  // Need a 4th teacher to attempt exceeding the quota.
  const teacher4Client = makeClient();
  await teacher4Client.post("/api/auth/signup", { email: "teacher4@test.local", password: "pw123456" });
  await teacher4Client.post("/api/auth/role", { role: "teacher" });
  await teacher4Client.post("/api/teacher/profile", { name: "Fourth Teacher", subjects: "Biology", city: "Pune", is_listed: true, contact_email: "t4@test.local" });
  const teacher4Id = [...backend.db.users.values()].find((u) => u.email === "teacher4@test.local").id;
  {
    const r = await student2Client.post(`/api/connect/${teacher4Id}`, {});
    check("10.2 4th connect in the same month -> 402 upgrade_required", r.status === 402 && r.body?.error === "upgrade_required", JSON.stringify(r.body));
  }
  {
    // The parent from §8/§9 has an active subscription now — should bypass the quota entirely.
    const r = await parentClient.post(`/api/connect/${teacher4Id}`, {});
    check("10.3 User WITH active subscription bypasses the free-tier quota", r.status === 200, JSON.stringify(r.body));
  }
  backend.db.feature_flags.payments_enabled = false;

  // ---------- 11. Self-service account deletion ----------
  {
    const r = await teacher4Client.post("/api/account/delete", {});
    check("11.1 Self-delete own account -> 200", r.status === 200 && r.body?.ok, JSON.stringify(r.body));
  }
  {
    const r = await studentClient.get("/api/search?subject=Biology");
    check("11.2 Self-deleted profile disappears from search", r.status === 200 && !r.body.some((t) => t.user_id === teacher4Id), JSON.stringify(r.body));
  }
  {
    const r = await teacher4Client.get("/api/teacher/profile");
    check("11.3 SECURITY-adjacent: session cookie was cleared client-side by delete", r.status === 401, `got ${r.status} (see report note on JWT non-revocation)`);
  }

  // ---------- 12. In-app messaging (additive to the contact-info reveal) ----------
  let conversationId;
  {
    // studentClient connected to meeraId back in section 6 — messaging
    // reuses that same "already connected" fact, same rule reviews use.
    const r = await studentClient.post("/api/conversations", { teacherId: meeraId });
    check("12.1 Start a conversation with an already-connected teacher -> 200", r.status === 200 && r.body?.conversationId, JSON.stringify(r.body));
    conversationId = r.body?.conversationId;
  }
  {
    const r = await studentClient.post("/api/conversations", { teacherId: teacher2Id });
    check("12.2 Starting a conversation WITHOUT connecting first -> rejected", r.status !== 200, `got ${r.status}: ${JSON.stringify(r.body)}`);
  }
  {
    const r = await studentClient.post(`/api/conversations/${conversationId}/messages`, { body: "Hi, is Tuesday evening free?" });
    check("12.3 Send a message in a conversation you're part of -> 200", r.status === 200 && r.body?.body === "Hi, is Tuesday evening free?", JSON.stringify(r.body));
  }
  {
    const r = await studentClient.post(`/api/conversations/${conversationId}/messages`, { body: "you are a bastard" });
    check("12.4 Abusive message body -> rejected", r.status === 400, `got ${r.status}: ${JSON.stringify(r.body)}`);
  }
  {
    const r = await teacherClient.get("/api/conversations");
    const convo = r.body.find((c) => c.conversation_id === conversationId);
    check("12.4b Unread student message shows has_unread=true for the teacher", r.status === 200 && convo?.has_unread === true, JSON.stringify(convo));
  }
  {
    const r = await teacherClient.get(`/api/conversations/${conversationId}/messages`);
    check("12.5 The other participant (teacher) can read the thread", r.status === 200 && r.body.some((m) => m.body === "Hi, is Tuesday evening free?"), JSON.stringify(r.body));
  }
  {
    // Viewing the thread above should have marked it read.
    const r = await teacherClient.get("/api/conversations");
    const convo = r.body.find((c) => c.conversation_id === conversationId);
    check("12.5b Viewing the thread marks it read (has_unread=false afterward)", r.status === 200 && convo?.has_unread === false, JSON.stringify(convo));
  }
  {
    const r = await teacherClient.post(`/api/conversations/${conversationId}/messages`, { body: "Yes, 6pm works!" });
    check("12.6 The teacher can reply in the same conversation", r.status === 200 && r.body?.sender_id, JSON.stringify(r.body));
  }
  {
    const r = await studentClient.get("/api/conversations");
    const convo = r.body.find((c) => c.conversation_id === conversationId);
    check("12.6b The teacher's reply now shows has_unread=true for the student", r.status === 200 && convo?.has_unread === true, JSON.stringify(convo));
  }
  {
    await studentClient.get(`/api/conversations/${conversationId}/messages`);
    const r = await studentClient.get("/api/conversations");
    const convo = r.body.find((c) => c.conversation_id === conversationId);
    check("12.6c Student viewing the thread marks the teacher's reply read too", r.status === 200 && convo?.has_unread === false, JSON.stringify(convo));
  }
  {
    const r = await teacher2Client.get(`/api/conversations/${conversationId}/messages`);
    check(
      "12.7 SECURITY: a non-participant cannot read someone else's conversation",
      r.status === 200 && r.body.length === 0,
      `got ${r.status}, ${r.body?.length ?? "?"} messages (RLS filters rows silently, same pattern as F-1/F-2 elsewhere in this suite)`
    );
  }
  {
    const r = await teacherClient.get("/api/conversations");
    check("12.8 Conversation list includes this thread for the teacher", r.status === 200 && r.body.some((c) => c.conversation_id === conversationId), JSON.stringify(r.body));
  }
  {
    // P2: teacher_response_time is computed from the real reply that just
    // happened in 12.6 (the requester's first message -> the teacher's first
    // reply after it) — not hand-set test fixture data.
    const r = await teacherClient.get("/api/search?subject=Maths");
    const meera = r.body.find((t) => t.name === "Meera R.");
    check(
      "12.9 Search results reflect a real computed response time after one reply",
      meera?.replied_conversation_count === 1 && typeof meera?.avg_response_hours === "number" && meera.avg_response_hours >= 0,
      JSON.stringify(meera)
    );
  }

  // ---------- 13. Block + report ----------
  {
    const r = await studentClient.post("/api/blocks", { userId: meeraId });
    check("13.1 Student blocks the teacher -> 200", r.status === 200 && r.body?.ok, JSON.stringify(r.body));
  }
  {
    const r = await studentClient.get("/api/conversations");
    const convo = r.body.find((c) => c.conversation_id === conversationId);
    check("13.2 Conversation now shows is_blocked=true", r.status === 200 && convo?.is_blocked === true, JSON.stringify(convo));
    check("13.2b blocked_by_me is true for the blocker (student)", convo?.blocked_by_me === true, JSON.stringify(convo));
  }
  {
    const r = await teacherClient.get("/api/conversations");
    const convo = r.body.find((c) => c.conversation_id === conversationId);
    check("13.2c blocked_by_me is false for the blocked party (teacher) — asymmetric so only the blocker sees Unblock", convo?.blocked_by_me === false, JSON.stringify(convo));
  }
  {
    const r = await teacherClient.post(`/api/conversations/${conversationId}/messages`, { body: "Are you still there?" });
    check("13.3 SECURITY: blocked conversation rejects a new message from the teacher", r.status !== 200, `got ${r.status}: ${JSON.stringify(r.body)}`);
  }
  {
    const r = await studentClient.post(`/api/conversations/${conversationId}/messages`, { body: "Hello?" });
    check("13.4 Blocking is mutual — the blocker can't send either", r.status !== 200, `got ${r.status}: ${JSON.stringify(r.body)}`);
  }
  {
    const r = await studentClient.post(`/api/conversations/${conversationId}/report`, { reason: "Being unresponsive and rude" });
    check("13.5 Student reports the conversation -> 200", r.status === 200 && r.body?.ok, JSON.stringify(r.body));
  }
  {
    const r = await teacher2Client.get("/api/conversations");
    check("13.6 A non-participant, non-admin sees none of this in their own conversation list", r.status === 200 && !r.body.some((c) => c.conversation_id === conversationId), JSON.stringify(r.body));
  }
  {
    const r = await adminClient.get(`/api/admin/reports`);
    check("13.7 Admin can see the report (RLS allows admin read)", r.status === 200 && r.body.some((rep) => rep.reason === "Being unresponsive and rude"), JSON.stringify(r.body));
  }
  {
    const listRows = await adminClient.get(`/api/admin/reports`);
    const reportId = listRows.body?.find((rep) => rep.conversation_id === conversationId)?.id;
    const r = await adminClient.post(`/api/admin/reports/${reportId}/resolve`, {});
    check("13.8 Admin marks the report resolved -> 200", r.status === 200 && r.body?.ok, JSON.stringify(r.body));
  }
  {
    const r = await studentClient.del(`/api/blocks/${meeraId}`);
    check("13.9 Unblocking is a distinct, working action -> 200", r.status === 200 && r.body?.ok, JSON.stringify(r.body));
  }
  {
    const r = await studentClient.get("/api/conversations");
    const convo = r.body.find((c) => c.conversation_id === conversationId);
    check("13.10 After unblocking, is_blocked is false again", r.status === 200 && convo?.is_blocked === false, JSON.stringify(convo));
  }
  {
    const r = await studentClient.post(`/api/conversations/${conversationId}/messages`, { body: "Sorry, misclicked earlier!" });
    check("13.11 Messaging resumes after unblocking", r.status === 200 && r.body?.body, JSON.stringify(r.body));
  }

  // ---------- 14. Rate limiting (P1) ----------
  {
    // login is capped at 10 attempts / 5 min per IP (app/api/auth/login) —
    // deliberately share one IP across all 11 attempts here, unlike every
    // other client in this suite, to actually trip it.
    const rlIp = "203.0.113.50";
    let last;
    for (let i = 0; i < 11; i++) {
      const c = makeClient(rlIp);
      last = await c.post("/api/auth/login", { email: "nobody@test.local", password: "wrong" });
      if (i < 10) {
        if (last.status === 429) break; // fail fast with a clear signal below
      }
    }
    check("14.1 Login attempt #11 from the same IP within 5 min -> 429", last.status === 429, `got ${last.status}: ${JSON.stringify(last.body)}`);
  }
  {
    const rlIp = "203.0.113.51";
    let last;
    for (let i = 0; i < 6; i++) {
      const c = makeClient(rlIp);
      last = await c.post("/api/auth/signup", { email: `rl-signup-${i}@test.local`, password: "pw123456" });
    }
    check("14.2 Signup attempt #6 from the same IP within an hour -> 429", last.status === 429, `got ${last.status}: ${JSON.stringify(last.body)}`);
  }
  {
    // Positive-path regression: normal single-request use of the other
    // rate-limited endpoints (message/review/report) must NOT be affected —
    // each of these already ran exactly once earlier in this suite (each
    // client has its own distinct fake IP), so a fresh call here is well
    // under every limit and must still succeed.
    const r = await teacherClient.post(`/api/conversations/${conversationId}/messages`, { body: "One more, still well under the limit." });
    check("14.3 A single additional message is not rate-limited", r.status === 200, `got ${r.status}: ${JSON.stringify(r.body)}`);
  }
}

main();
