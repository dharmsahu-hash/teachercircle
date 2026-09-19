import { test, describe } from "node:test";
import assert from "node:assert";

const dbModuleUrl = new URL("../../lib/db.ts", import.meta.url).href;
const entitlementModuleUrl = new URL("../../lib/entitlement.ts", import.meta.url).href;

// Node caches an ES module the first time it's imported in this process, and
// mock.module only affects resolutions that happen AFTER it's registered —
// so re-importing entitlement.ts plainly would keep returning the first
// test's cached instance (bound to the first mock) forever. Appending a
// unique query string forces a fresh module instance per test, which then
// resolves "./db" against whatever mock is active *at that moment*.
let caseId = 0;
async function loadCanReveal(t: any, responses: Record<string, unknown>) {
  t.mock.module(dbModuleUrl, {
    exports: {
      pg: async () => null,
      pgRpc: async (name: string) => responses[name],
      PostgrestError: class PostgrestError extends Error {},
    },
  });
  const mod = await import(`${entitlementModuleUrl}?case=${caseId++}`);
  return mod.canReveal;
}

describe("canReveal — positive cases", () => {
  test("flag off -> always allowed, regardless of usage", async (t) => {
    const canReveal = await loadCanReveal(t, { is_payments_enabled: false });
    const result = await canReveal("tok", "user-1");
    assert.deepStrictEqual(result, { allowed: true, freeRemaining: null });
  });

  test("flag on + active subscription -> allowed, no quota applied", async (t) => {
    const canReveal = await loadCanReveal(t, { is_payments_enabled: true, has_active_subscription: true });
    const result = await canReveal("tok", "user-2");
    assert.deepStrictEqual(result, { allowed: true, freeRemaining: null });
  });

  test("flag on + no subscription + under the free quota -> allowed, reports remaining", async (t) => {
    const canReveal = await loadCanReveal(t, {
      is_payments_enabled: true,
      has_active_subscription: false,
      monthly_connection_count: 1,
      free_connections_limit_for: 3,
    });
    const result = await canReveal("tok", "user-3");
    assert.deepStrictEqual(result, { allowed: true, freeRemaining: 2 });
  });
});

describe("canReveal — negative cases", () => {
  test("flag on + no subscription + at the free quota -> blocked", async (t) => {
    const canReveal = await loadCanReveal(t, {
      is_payments_enabled: true,
      has_active_subscription: false,
      monthly_connection_count: 3,
      free_connections_limit_for: 3,
    });
    const result = await canReveal("tok", "user-4");
    assert.deepStrictEqual(result, { allowed: false, freeRemaining: 0 });
  });

  test("flag on + role with a zero free-connections limit (e.g. teacher) -> always blocked", async (t) => {
    const canReveal = await loadCanReveal(t, {
      is_payments_enabled: true,
      has_active_subscription: false,
      monthly_connection_count: 0,
      free_connections_limit_for: 0,
    });
    const result = await canReveal("tok", "user-5");
    assert.strictEqual(result.allowed, false);
  });

  test("usage far beyond the limit still reports freeRemaining clamped to 0, never negative", async (t) => {
    const canReveal = await loadCanReveal(t, {
      is_payments_enabled: true,
      has_active_subscription: false,
      monthly_connection_count: 50,
      free_connections_limit_for: 3,
    });
    const result = await canReveal("tok", "user-6");
    assert.strictEqual(result.freeRemaining, 0);
  });
});
