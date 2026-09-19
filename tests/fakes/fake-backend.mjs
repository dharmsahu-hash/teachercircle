// A faithful, in-memory stand-in for GoTrue + PostgREST, used only by the test
// suite. It does not prove the real SQL/RLS is correct — only that this app's
// route handlers behave correctly against a backend that enforces the same
// rules. See tests/system/run.mjs and the final report's "Tier 2 vs Tier 3"
// section for what this does and doesn't cover.
//
// Deliberately replicates one easy-to-miss real Postgres/PostgREST behavior:
// an UPDATE whose WHERE-matched row is invisible under RLS returns 200 with
// an EMPTY array, not an error — RLS filters rows, it doesn't raise on
// mismatch. An INSERT that violates a WITH CHECK, and a SECURITY DEFINER
// function that raises, both return real error statuses. Both are modeled
// below because the difference matters for how the app must handle each case.

import http from "node:http";
import crypto from "node:crypto";

function b64url(obj) {
  return Buffer.from(JSON.stringify(obj)).toString("base64url");
}

function mintJwt(userId, email) {
  const header = b64url({ alg: "none", typ: "JWT" });
  const payload = b64url({
    sub: userId,
    email,
    role: "authenticated",
    exp: Math.floor(Date.now() / 1000) + 3600,
  });
  return `${header}.${payload}.faketestsignature`;
}

function decodeJwt(token) {
  try {
    const payload = token.split(".")[1];
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

export function createFakeBackend() {
  const db = {
    users: new Map(), // id -> {id,email,role,auth_provider,deleted_at,created_at}
    teacher_profile: new Map(), // user_id -> row
    parent_profile: new Map(),
    student_profile: new Map(), // id -> row
    review: [],
    contact_request: [],
    feature_flags: { payments_enabled: false },
    plan_limits: {
      student: { role: "student", free_connections_per_month: 3, yearly_price_amount: 499, yearly_price_currency: "INR" },
      parent: { role: "parent", free_connections_per_month: 3, yearly_price_amount: 999, yearly_price_currency: "INR" },
      teacher: { role: "teacher", free_connections_per_month: 0, yearly_price_amount: 799, yearly_price_currency: "INR" },
    },
    subscription: new Map(), // id -> row
    payment_transaction: new Map(), // id -> row
    admin_audit_log: [],
    gotruePasswords: new Map(), // email -> password (fake auth store)
  };

  function reset() {
    db.users.clear();
    db.teacher_profile.clear();
    db.parent_profile.clear();
    db.student_profile.clear();
    db.review.length = 0;
    db.contact_request.length = 0;
    db.feature_flags.payments_enabled = false;
    db.subscription.clear();
    db.payment_transaction.clear();
    db.admin_audit_log.length = 0;
    db.gotruePasswords.clear();
  }

  function requesterFrom(req) {
    const auth = req.headers["authorization"];
    if (!auth) return null;
    const token = auth.replace(/^Bearer /, "");
    const claims = decodeJwt(token);
    if (!claims?.sub) return null;
    return db.users.get(claims.sub) ?? { id: claims.sub, email: claims.email, role: null };
  }

  function isAdmin(requester) {
    return Boolean(requester && db.users.get(requester.id)?.role === "admin" && !db.users.get(requester.id)?.deleted_at);
  }

  function parseFilters(url) {
    const filters = {};
    for (const [key, value] of url.searchParams) {
      if (["select", "order", "limit"].includes(key)) continue;
      filters[key] = value;
    }
    return filters;
  }

  function rowMatches(row, filters) {
    for (const [key, spec] of Object.entries(filters)) {
      const dot = spec.indexOf(".");
      const op = spec.slice(0, dot);
      const raw = spec.slice(dot + 1);
      const cell = row[key];
      if (op === "eq") {
        if (String(cell) !== raw) return false;
      } else if (op === "cs") {
        const inner = raw.replace(/^\{/, "").replace(/\}$/, "");
        if (!Array.isArray(cell) || !cell.includes(inner)) return false;
      } else if (op === "ilike") {
        const needle = raw.replace(/^\*/, "").replace(/\*$/, "").toLowerCase();
        if (typeof cell !== "string" || !cell.toLowerCase().includes(needle)) return false;
      }
    }
    return true;
  }

  function project(row, selectParam) {
    // Bug found while running the suite: "*" is PostgREST's real wildcard for
    // "all columns", not a literal column name — treating it as one produced
    // { "*": null } instead of the full row (test-harness bug, not an app bug).
    if (!selectParam || selectParam === "*") return { ...row };
    const cols = selectParam.split(",");
    const out = {};
    for (const c of cols) out[c] = row[c] ?? null;
    return out;
  }

  function applyOrder(rows, orderParam) {
    if (!orderParam) return rows;
    const clauses = orderParam.split(",").map((c) => {
      const [col, dir] = c.split(".");
      return { col, dir: dir || "asc" };
    });
    return [...rows].sort((a, b) => {
      for (const { col, dir } of clauses) {
        const av = a[col],
          bv = b[col];
        if (av === bv) continue;
        const cmp = av > bv ? 1 : -1;
        return dir === "desc" ? -cmp : cmp;
      }
      return 0;
    });
  }

  function teacherPublicRows() {
    const rows = [];
    for (const tp of db.teacher_profile.values()) {
      if (!tp.is_listed || tp.deleted_at) continue;
      const reviews = db.review.filter((r) => r.teacher_id === tp.user_id);
      const avg = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;
      rows.push({
        ...tp,
        avg_rating: Math.round(avg * 100) / 100,
        review_count: reviews.length,
      });
    }
    return rows;
  }

  function json(res, status, body) {
    const text = body === undefined ? "" : JSON.stringify(body);
    res.writeHead(status, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(text) });
    res.end(text);
  }

  function error(res, status, message) {
    json(res, status, { message });
  }

  async function readBody(req) {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    if (chunks.length === 0) return {};
    try {
      return JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      return {};
    }
  }

  // ---------------- GoTrue ----------------
  const gotrue = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://fake-gotrue");
    if (req.method === "GET" && url.pathname === "/health") return json(res, 200, { date: new Date().toISOString() });

    if (req.method === "POST" && url.pathname === "/signup") {
      const { email, password } = await readBody(req);
      if (!email || !password) return json(res, 400, { error_description: "email and password required" });
      if (db.gotruePasswords.has(email)) return json(res, 422, { error_description: "User already registered" });
      const id = crypto.randomUUID();
      db.gotruePasswords.set(email, password);
      // Mirrors the real handle_new_user trigger: role starts NULL.
      db.users.set(id, { id, email, role: null, auth_provider: "password", deleted_at: null, created_at: new Date().toISOString() });
      const access_token = mintJwt(id, email);
      return json(res, 200, { access_token, refresh_token: "fake-refresh", expires_in: 3600, user: { id, email } });
    }

    if (req.method === "POST" && url.pathname === "/token" && url.searchParams.get("grant_type") === "password") {
      const { email, password } = await readBody(req);
      const stored = db.gotruePasswords.get(email);
      if (!stored || stored !== password) return json(res, 400, { error_description: "Invalid login credentials" });
      const user = [...db.users.values()].find((u) => u.email === email);
      const access_token = mintJwt(user.id, email);
      return json(res, 200, { access_token, refresh_token: "fake-refresh", expires_in: 3600, user: { id: user.id, email } });
    }

    error(res, 404, "not found");
  });

  // ---------------- PostgREST ----------------
  const postgrest = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://fake-postgrest");
    const requester = requesterFrom(req);
    const filters = parseFilters(url);
    const select = url.searchParams.get("select");
    const order = url.searchParams.get("order");
    const limit = url.searchParams.get("limit");

    try {
      // ---- users ----
      if (url.pathname === "/users") {
        if (req.method === "GET") {
          if (!requester) return json(res, 200, []);
          let rows = [...db.users.values()].filter((u) => rowMatches(u, filters));
          // users_select_own OR users_admin_read
          rows = rows.filter((u) => u.id === requester.id || isAdmin(requester));
          rows = applyOrder(rows, order);
          if (limit) rows = rows.slice(0, Number(limit));
          return json(res, 200, rows.map((r) => project(r, select)));
        }
      }

      // ---- teacher_profile ----
      if (url.pathname === "/teacher_profile") {
        if (req.method === "GET") {
          let rows = [...db.teacher_profile.values()].filter((r) => rowMatches(r, filters));
          rows = rows.filter(
            (r) => (r.is_listed && !r.deleted_at) || (requester && (r.user_id === requester.id || isAdmin(requester)))
          );
          return json(res, 200, rows.map((r) => project(r, select)));
        }
        if (req.method === "POST") {
          const body = await readBody(req);
          if (!requester || body.user_id !== requester.id) return error(res, 403, "row-level security policy violation");
          if (db.teacher_profile.has(body.user_id)) return error(res, 409, "duplicate key value violates unique constraint");
          if (body.name === null || body.name === undefined) return error(res, 400, 'null value in column "name" violates not-null constraint');
          const row = {
            user_id: body.user_id,
            name: body.name ?? null,
            bio: body.bio ?? null,
            city: body.city ?? null,
            pincode: body.pincode ?? null,
            subjects: body.subjects ?? [],
            rate_per_hour: body.rate_per_hour ?? null,
            experience_years: body.experience_years ?? null,
            contact_email: body.contact_email ?? null,
            contact_phone: body.contact_phone ?? null,
            is_listed: body.is_listed ?? true,
            is_subscribed: false,
            subscription_expires_at: null,
            deleted_at: null,
          };
          db.teacher_profile.set(body.user_id, row);
          return json(res, 201, [row]);
        }
        if (req.method === "PATCH") {
          const targetId = filters.user_id?.replace(/^eq\./, "");
          const row = db.teacher_profile.get(targetId);
          if (!row) return json(res, 200, []);
          // RLS USING clause: only the owner's row is even visible to update.
          if (!requester || requester.id !== targetId) return json(res, 200, []);
          const patch = await readBody(req);
          if (patch.name === null) return error(res, 400, 'null value in column "name" violates not-null constraint');
          Object.assign(row, patch);
          return json(res, 200, [row]);
        }
      }

      // ---- teacher_public (view) ----
      if (url.pathname === "/teacher_public" && req.method === "GET") {
        let rows = teacherPublicRows().filter((r) => rowMatches(r, filters));
        rows = applyOrder(rows, order);
        return json(res, 200, rows.map((r) => project(r, select)));
      }

      // ---- parent_profile ----
      if (url.pathname === "/parent_profile") {
        if (req.method === "GET") {
          let rows = [...db.parent_profile.values()].filter((r) => rowMatches(r, filters));
          rows = rows.filter((r) => requester && (r.user_id === requester.id || isAdmin(requester)));
          return json(res, 200, rows.map((r) => project(r, select)));
        }
        if (req.method === "POST") {
          const body = await readBody(req);
          if (!requester || body.user_id !== requester.id) return error(res, 403, "row-level security policy violation");
          const row = { user_id: body.user_id, name: body.name ?? null, deleted_at: null };
          db.parent_profile.set(body.user_id, row);
          return json(res, 201, [row]);
        }
      }

      // ---- student_profile ----
      if (url.pathname === "/student_profile") {
        if (req.method === "GET") {
          let rows = [...db.student_profile.values()].filter((r) => rowMatches(r, filters));
          rows = rows.filter((r) => requester && (r.parent_id === requester.id || isAdmin(requester)));
          return json(res, 200, rows.map((r) => project(r, select)));
        }
        if (req.method === "POST") {
          const body = await readBody(req);
          if (!requester || body.parent_id !== requester.id) return error(res, 403, "row-level security policy violation");
          const row = { id: crypto.randomUUID(), parent_id: body.parent_id, name: body.name ?? null, grade: body.grade ?? null, deleted_at: null };
          db.student_profile.set(row.id, row);
          return json(res, 201, [row]);
        }
      }

      // ---- contact_request ----
      if (url.pathname === "/contact_request") {
        if (req.method === "POST") {
          const body = await readBody(req);
          if (!requester || body.requester_id !== requester.id) return error(res, 403, "row-level security policy violation");
          if (!db.teacher_profile.has(body.teacher_id)) return error(res, 409, "insert or update on table violates foreign key constraint");
          const row = { id: crypto.randomUUID(), teacher_id: body.teacher_id, requester_id: body.requester_id, created_at: new Date().toISOString() };
          db.contact_request.push(row);
          return json(res, 201, [row]);
        }
        if (req.method === "GET") {
          let rows = db.contact_request.filter((r) => rowMatches(r, filters));
          rows = rows.filter((r) => requester && r.requester_id === requester.id);
          return json(res, 200, rows.map((r) => project(r, select)));
        }
      }

      // ---- review ----
      if (url.pathname === "/review") {
        if (req.method === "GET") {
          let rows = db.review.filter((r) => rowMatches(r, filters));
          rows = applyOrder(rows, order);
          return json(res, 200, rows.map((r) => project(r, select)));
        }
        if (req.method === "POST") {
          const body = await readBody(req);
          if (!requester || body.reviewer_id !== requester.id) return error(res, 403, "row-level security policy violation");
          const connected = db.contact_request.some((c) => c.teacher_id === body.teacher_id && c.requester_id === body.reviewer_id);
          if (!connected) return error(res, 403, "new row violates row-level security policy for table review");
          if (db.review.some((r) => r.teacher_id === body.teacher_id && r.reviewer_id === body.reviewer_id)) {
            return error(res, 409, "duplicate key value violates unique constraint");
          }
          if (!(body.rating >= 1 && body.rating <= 5)) return error(res, 400, "new row for relation review violates check constraint");
          const row = { id: crypto.randomUUID(), teacher_id: body.teacher_id, reviewer_id: body.reviewer_id, rating: body.rating, comment: body.comment ?? null, created_at: new Date().toISOString() };
          db.review.push(row);
          return json(res, 201, [row]);
        }
      }

      // ---- plan_limits ----
      if (url.pathname === "/plan_limits" && req.method === "GET") {
        const role = filters.role?.replace(/^eq\./, "");
        const row = db.plan_limits[role];
        return json(res, 200, row ? [project(row, select)] : []);
      }

      // ---- subscription ----
      if (url.pathname === "/subscription") {
        if (req.method === "POST") {
          const body = await readBody(req);
          if (!requester || body.user_id !== requester.id) return error(res, 403, "row-level security policy violation");
          const row = { id: crypto.randomUUID(), user_id: body.user_id, billing_cycle: "yearly", status: body.status ?? "none", started_at: null, expires_at: null, created_at: new Date().toISOString() };
          db.subscription.set(row.id, row);
          return json(res, 201, [row]);
        }
        if (req.method === "GET") {
          const targetId = filters.id?.replace(/^eq\./, "");
          let rows = targetId ? [db.subscription.get(targetId)].filter(Boolean) : [...db.subscription.values()];
          rows = rows.filter((r) => requester && (r.user_id === requester.id || isAdmin(requester)));
          return json(res, 200, rows.map((r) => project(r, select)));
        }
      }

      // ---- payment_transaction ----
      if (url.pathname === "/payment_transaction") {
        if (req.method === "POST") {
          const body = await readBody(req);
          const sub = db.subscription.get(body.subscription_id);
          if (!requester || !sub || sub.user_id !== requester.id) return error(res, 403, "row-level security policy violation");
          const row = { id: crypto.randomUUID(), subscription_id: body.subscription_id, provider: body.provider, amount: body.amount, currency: body.currency, provider_ref: null, status: "created", verified_by: null, verified_at: null, created_at: new Date().toISOString() };
          db.payment_transaction.set(row.id, row);
          return json(res, 201, [row]);
        }
        if (req.method === "PATCH") {
          const targetId = filters.id?.replace(/^eq\./, "");
          const row = db.payment_transaction.get(targetId);
          if (!row) return json(res, 200, []);
          const sub = db.subscription.get(row.subscription_id);
          if (!requester || !sub || sub.user_id !== requester.id) return json(res, 200, []); // RLS: invisible, not an error
          const patch = await readBody(req);
          if (patch.status !== "submitted") return error(res, 403, "new row violates check constraint (with check)");
          Object.assign(row, patch);
          return json(res, 200, [row]);
        }
        if (req.method === "GET") {
          if (!isAdmin(requester)) return json(res, 200, []); // admin-only read policy
          let rows = [...db.payment_transaction.values()].filter((r) => rowMatches(r, filters));
          rows = applyOrder(rows, order);
          return json(res, 200, rows.map((r) => project(r, select)));
        }
      }

      // ---- admin_audit_log ----
      if (url.pathname === "/admin_audit_log" && req.method === "GET") {
        if (!isAdmin(requester)) return json(res, 200, []);
        let rows = db.admin_audit_log.filter((r) => rowMatches(r, filters));
        rows = applyOrder(rows, order);
        if (limit) rows = rows.slice(0, Number(limit));
        return json(res, 200, rows.map((r) => project(r, select)));
      }

      // ---- RPCs ----
      if (url.pathname.startsWith("/rpc/") && req.method === "POST") {
        const fn = url.pathname.slice(5);
        const args = await readBody(req);

        if (fn === "set_my_role") {
          if (!requester) return error(res, 401, "not signed in");
          const user = db.users.get(requester.id);
          if (!["student", "parent", "teacher"].includes(args.new_role)) return error(res, 400, "invalid role");
          if (user.role !== null) return error(res, 400, "role already assigned");
          user.role = args.new_role;
          return json(res, 200, undefined);
        }

        if (fn === "is_payments_enabled") return json(res, 200, db.feature_flags.payments_enabled);

        if (fn === "has_active_subscription") {
          const sub = [...db.subscription.values()].find((s) => s.user_id === args.u && s.status === "active" && new Date(s.expires_at) > new Date());
          return json(res, 200, Boolean(sub));
        }

        if (fn === "monthly_connection_count") {
          const now = new Date();
          const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
          const count = db.contact_request.filter((c) => c.requester_id === args.u && new Date(c.created_at) >= monthStart).length;
          return json(res, 200, count);
        }

        if (fn === "free_connections_limit_for") {
          const user = db.users.get(args.u);
          const limits = user && db.plan_limits[user.role];
          return json(res, 200, limits ? limits.free_connections_per_month : 0);
        }

        if (fn === "reveal_teacher_contact") {
          if (!requester) return error(res, 401, "not signed in");
          const connected = db.contact_request.some((c) => c.teacher_id === args.target_teacher_id && c.requester_id === requester.id);
          if (!connected) return error(res, 400, "not connected");
          const tp = db.teacher_profile.get(args.target_teacher_id);
          return json(res, 200, { contact_email: tp?.contact_email ?? null, contact_phone: tp?.contact_phone ?? null });
        }

        if (fn === "approve_payment") {
          if (!isAdmin(requester)) return error(res, 400, "not authorized");
          const txn = db.payment_transaction.get(args.txn_id);
          if (!txn || txn.status !== "submitted") return error(res, 400, "transaction not pending");
          txn.status = "approved";
          txn.verified_by = requester.id;
          txn.verified_at = new Date().toISOString();
          const sub = db.subscription.get(txn.subscription_id);
          sub.status = "active";
          sub.started_at = new Date().toISOString();
          sub.expires_at = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString();
          return json(res, 200, undefined);
        }

        if (fn === "set_my_deleted") {
          if (!requester) return error(res, 401, "not signed in");
          const user = db.users.get(requester.id);
          user.deleted_at = new Date().toISOString();
          user.email = `deleted-${user.id}@teachercircle.invalid`;
          const tp = db.teacher_profile.get(requester.id);
          if (tp) {
            tp.is_listed = false;
            tp.deleted_at = new Date().toISOString();
          }
          const pp = db.parent_profile.get(requester.id);
          if (pp) pp.deleted_at = new Date().toISOString();
          return json(res, 200, undefined);
        }

        if (fn === "admin_soft_delete_profile") {
          if (!isAdmin(requester)) return error(res, 400, "not authorized");
          const target = args.target_user_id;
          const user = db.users.get(target);
          if (user) user.deleted_at = new Date().toISOString();
          const tp = db.teacher_profile.get(target);
          if (tp) {
            tp.is_listed = false;
            tp.deleted_at = new Date().toISOString();
          }
          const pp = db.parent_profile.get(target);
          if (pp) pp.deleted_at = new Date().toISOString();
          db.admin_audit_log.push({ id: crypto.randomUUID(), actor_id: requester.id, target_table: "users", target_id: target, action: "delete", created_at: new Date().toISOString() });
          return json(res, 200, undefined);
        }

        if (fn === "admin_restore_profile") {
          if (!isAdmin(requester)) return error(res, 400, "not authorized");
          const target = args.target_user_id;
          const user = db.users.get(target);
          if (user) user.deleted_at = null;
          const tp = db.teacher_profile.get(target);
          if (tp) tp.deleted_at = null;
          db.admin_audit_log.push({ id: crypto.randomUUID(), actor_id: requester.id, target_table: "users", target_id: target, action: "update", created_at: new Date().toISOString() });
          return json(res, 200, undefined);
        }

        if (fn === "admin_create_teacher_profile") {
          if (!isAdmin(requester)) return error(res, 400, "not authorized");
          const target = args.target_user_id;
          if (!db.teacher_profile.has(target)) {
            db.teacher_profile.set(target, {
              user_id: target, name: args.p_name ?? null, bio: null, city: args.p_city ?? null, pincode: null,
              subjects: [], rate_per_hour: null, experience_years: null, contact_email: null, contact_phone: null,
              is_listed: true, is_subscribed: false, subscription_expires_at: null, deleted_at: null,
            });
          }
          db.admin_audit_log.push({ id: crypto.randomUUID(), actor_id: requester.id, target_table: "teacher_profile", target_id: target, action: "create", created_at: new Date().toISOString() });
          return json(res, 200, undefined);
        }

        if (fn === "admin_update_teacher_profile") {
          if (!isAdmin(requester)) return error(res, 400, "not authorized");
          const target = args.target_user_id;
          const tp = db.teacher_profile.get(target);
          if (tp) Object.assign(tp, args.patch);
          db.admin_audit_log.push({ id: crypto.randomUUID(), actor_id: requester.id, target_table: "teacher_profile", target_id: target, action: "update", created_at: new Date().toISOString() });
          return json(res, 200, undefined);
        }

        return error(res, 404, `unknown rpc ${fn}`);
      }

      error(res, 404, `no route for ${req.method} ${url.pathname}`);
    } catch (err) {
      error(res, 500, String(err));
    }
  });

  return {
    db,
    reset,
    listen(gotruePort, postgrestPort) {
      return Promise.all([
        new Promise((r) => gotrue.listen(gotruePort, r)),
        new Promise((r) => postgrest.listen(postgrestPort, r)),
      ]);
    },
    close() {
      return Promise.all([
        new Promise((r) => gotrue.close(r)),
        new Promise((r) => postgrest.close(r)),
      ]);
    },
    // test helper: promote a user directly, mirroring the one DB-only
    // operation the real system also has no self-service path for.
    promoteAdmin(email) {
      const user = [...db.users.values()].find((u) => u.email === email);
      if (user) user.role = "admin";
    },
  };
}
