import { test, describe } from "node:test";
import assert from "node:assert";
import { checkRateLimit, getClientIp } from "../../lib/rateLimit";

describe("checkRateLimit", () => {
  test("calls the check_rate_limit RPC with the right key/max/window and returns true when allowed", async (t) => {
    let capturedUrl: string | undefined;
    let capturedBody: any;
    t.mock.method(globalThis, "fetch", async (url: string, init: any) => {
      capturedUrl = url;
      capturedBody = JSON.parse(init.body);
      return new Response("true", { status: 200 });
    });

    const allowed = await checkRateLimit("login:1.2.3.4", 10, 300, null);
    assert.strictEqual(allowed, true);
    assert.ok(capturedUrl?.endsWith("/rpc/check_rate_limit"));
    assert.deepStrictEqual(capturedBody, { p_key: "login:1.2.3.4", p_max: 10, p_window_seconds: 300 });
  });

  test("returns false when the RPC reports the limit was exceeded", async (t) => {
    t.mock.method(globalThis, "fetch", async () => new Response("false", { status: 200 }));
    const allowed = await checkRateLimit("login:1.2.3.4", 10, 300, null);
    assert.strictEqual(allowed, false);
  });
});

describe("getClientIp", () => {
  test("reads the first address from x-forwarded-for", () => {
    const req = { headers: new Headers({ "x-forwarded-for": "203.0.113.5, 10.0.0.1" }) } as any;
    assert.strictEqual(getClientIp(req), "203.0.113.5");
  });

  test("falls back to 'unknown' when the header is missing", () => {
    const req = { headers: new Headers() } as any;
    assert.strictEqual(getClientIp(req), "unknown");
  });
});
