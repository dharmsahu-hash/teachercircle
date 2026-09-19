import { test, describe } from "node:test";
import assert from "node:assert";

const sessionModuleUrl = new URL("../../lib/session.ts", import.meta.url).href;
const dbModuleUrl = new URL("../../lib/db.ts", import.meta.url).href;
const authModuleUrl = new URL("../../lib/auth.ts", import.meta.url).href;

function b64url(obj: unknown) {
  return Buffer.from(JSON.stringify(obj)).toString("base64url");
}
function mintToken(claims: Record<string, unknown>) {
  return `h.${b64url(claims)}.sig`;
}

// See entitlement.test.ts for why the module-under-test needs a cache-busted
// re-import per test case rather than a single top-level import.
let caseId = 0;
async function loadAuth(t: any, opts: { token: string | null; userRows: unknown[] | null }) {
  t.mock.module(sessionModuleUrl, {
    exports: {
      getAccessToken: () => opts.token,
      setSessionCookie: () => {},
      clearSessionCookie: () => {},
    },
  });
  t.mock.module(dbModuleUrl, {
    exports: {
      pg: async () => opts.userRows,
      pgRpc: async () => null,
      PostgrestError: class PostgrestError extends Error {},
    },
  });
  return import(`${authModuleUrl}?case=${caseId++}`);
}

describe("getSessionUser — negative cases", () => {
  test("no cookie at all -> null", async (t) => {
    const { getSessionUser } = await loadAuth(t, { token: null, userRows: [] });
    assert.strictEqual(await getSessionUser(), null);
  });

  test("token with no 'sub' claim -> null", async (t) => {
    const { getSessionUser } = await loadAuth(t, { token: mintToken({ email: "x@test.local" }), userRows: [] });
    assert.strictEqual(await getSessionUser(), null);
  });

  test("expired token -> null, even though the row would otherwise resolve", async (t) => {
    const token = mintToken({ sub: "u1", exp: Math.floor(Date.now() / 1000) - 3600 });
    const { getSessionUser } = await loadAuth(t, { token, userRows: [{ id: "u1", email: "u1@test.local", role: "student" }] });
    assert.strictEqual(await getSessionUser(), null);
  });

  test("valid, unexpired token but the row is gone (e.g. hard-deleted) -> null", async (t) => {
    const token = mintToken({ sub: "u2", exp: Math.floor(Date.now() / 1000) + 3600 });
    const { getSessionUser } = await loadAuth(t, { token, userRows: [] });
    assert.strictEqual(await getSessionUser(), null);
  });
});

describe("getSessionUser — positive cases", () => {
  test("valid token + matching row -> populated SessionUser", async (t) => {
    const token = mintToken({ sub: "u3", exp: Math.floor(Date.now() / 1000) + 3600 });
    const { getSessionUser } = await loadAuth(t, { token, userRows: [{ id: "u3", email: "u3@test.local", role: "teacher" }] });
    const user = await getSessionUser();
    assert.deepStrictEqual(user, { id: "u3", email: "u3@test.local", role: "teacher", fullName: null, avatarUrl: null, avatarSeed: null, phone: null, token });
  });

  test("Google profile fields (full_name/avatar_url) map through to fullName/avatarUrl", async (t) => {
    const token = mintToken({ sub: "u3b", exp: Math.floor(Date.now() / 1000) + 3600 });
    const { getSessionUser } = await loadAuth(t, {
      token,
      userRows: [{ id: "u3b", email: "u3b@test.local", role: "student", full_name: "Test Googler", avatar_url: "https://example.com/pic.jpg" }],
    });
    const user = await getSessionUser();
    assert.strictEqual(user?.fullName, "Test Googler");
    assert.strictEqual(user?.avatarUrl, "https://example.com/pic.jpg");
  });

  test("avatar_seed maps through to avatarSeed", async (t) => {
    const token = mintToken({ sub: "u3c", exp: Math.floor(Date.now() / 1000) + 3600 });
    const { getSessionUser } = await loadAuth(t, {
      token,
      userRows: [{ id: "u3c", email: "u3c@test.local", role: "student", avatar_seed: "comet" }],
    });
    const user = await getSessionUser();
    assert.strictEqual(user?.avatarSeed, "comet");
  });

  test("phone maps through when set", async (t) => {
    const token = mintToken({ sub: "u3d", exp: Math.floor(Date.now() / 1000) + 3600 });
    const { getSessionUser } = await loadAuth(t, {
      token,
      userRows: [{ id: "u3d", email: "u3d@test.local", role: "parent", phone: "+91 98765 43210" }],
    });
    const user = await getSessionUser();
    assert.strictEqual(user?.phone, "+91 98765 43210");
  });

  test("role is null before onboarding -> still a valid session, role field is null", async (t) => {
    const token = mintToken({ sub: "u4", exp: Math.floor(Date.now() / 1000) + 3600 });
    const { getSessionUser } = await loadAuth(t, { token, userRows: [{ id: "u4", email: "u4@test.local", role: null }] });
    const user = await getSessionUser();
    assert.strictEqual(user?.role, null);
  });
});

describe("requireSession / requireAdmin", () => {
  test("requireSession throws when there is no session", async (t) => {
    const { requireSession, UnauthorizedError } = await loadAuth(t, { token: null, userRows: [] });
    await assert.rejects(() => requireSession(), UnauthorizedError);
  });

  test("requireSession resolves when there is a valid session", async (t) => {
    const token = mintToken({ sub: "u5", exp: Math.floor(Date.now() / 1000) + 3600 });
    const { requireSession } = await loadAuth(t, { token, userRows: [{ id: "u5", email: "u5@test.local", role: "student" }] });
    const user = await requireSession();
    assert.strictEqual(user.id, "u5");
  });

  test("requireAdmin throws for a signed-in NON-admin (security-relevant negative case)", async (t) => {
    const token = mintToken({ sub: "u6", exp: Math.floor(Date.now() / 1000) + 3600 });
    const { requireAdmin, UnauthorizedError } = await loadAuth(t, { token, userRows: [{ id: "u6", email: "u6@test.local", role: "teacher" }] });
    await assert.rejects(() => requireAdmin(), UnauthorizedError);
  });

  test("requireAdmin resolves for an admin", async (t) => {
    const token = mintToken({ sub: "u7", exp: Math.floor(Date.now() / 1000) + 3600 });
    const { requireAdmin } = await loadAuth(t, { token, userRows: [{ id: "u7", email: "u7@test.local", role: "admin" }] });
    const user = await requireAdmin();
    assert.strictEqual(user.role, "admin");
  });
});
