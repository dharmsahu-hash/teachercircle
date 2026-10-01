import { test, describe } from "node:test";
import assert from "node:assert";
import { checkHealth } from "../../lib/health";

function setEnv() {
  process.env.POSTGREST_URL = "http://postgrest.test";
  process.env.GOTRUE_URL = "http://gotrue.test";
  process.env.SUPABASE_API_KEY = "anon-key";
  delete process.env.VERCEL_GIT_COMMIT_SHA;
}

describe("checkHealth", () => {
  test("ok when both the database read and GoTrue /health succeed; sends apikey", async (t) => {
    setEnv();
    const seen: { url: string; apikey?: string }[] = [];
    t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
      seen.push({ url: String(url), apikey: (init.headers as Record<string, string>)?.apikey });
      return new Response("[]", { status: 200 });
    });
    const report = await checkHealth();
    assert.strictEqual(report.status, "ok");
    assert.ok(report.checks.database.ok && report.checks.auth.ok);
    assert.ok(seen.some((s) => s.url === "http://postgrest.test/teacher_public?select=user_id&limit=1"));
    assert.ok(seen.some((s) => s.url === "http://gotrue.test/health"));
    assert.ok(seen.every((s) => s.apikey === "anon-key"));
  });

  test("degraded when the database answers with an error status", async (t) => {
    setEnv();
    t.mock.method(globalThis, "fetch", async (url: string) =>
      new Response("", { status: String(url).includes("postgrest") ? 503 : 200 })
    );
    const report = await checkHealth();
    assert.strictEqual(report.status, "degraded");
    assert.deepStrictEqual([report.checks.database.ok, report.checks.database.status], [false, 503]);
    assert.strictEqual(report.checks.auth.ok, true);
  });

  test("degraded, not thrown, when GoTrue is unreachable; no error text in the report", async (t) => {
    setEnv();
    t.mock.method(console, "error", () => {});
    t.mock.method(globalThis, "fetch", async (url: string) => {
      if (String(url).includes("gotrue")) throw new TypeError("fetch failed: connect ECONNREFUSED 10.0.0.5:9999");
      return new Response("[]", { status: 200 });
    });
    const report = await checkHealth();
    assert.strictEqual(report.status, "degraded");
    assert.strictEqual(report.checks.auth.ok, false);
    assert.doesNotMatch(JSON.stringify(report), /ECONNREFUSED|10\.0\.0\.5|gotrue\.test|anon-key/);
  });

  test("reports the short commit sha when Vercel provides it", async (t) => {
    setEnv();
    process.env.VERCEL_GIT_COMMIT_SHA = "28486e6abcdef0123";
    t.mock.method(globalThis, "fetch", async () => new Response("[]", { status: 200 }));
    assert.strictEqual((await checkHealth()).version, "28486e6");
    delete process.env.VERCEL_GIT_COMMIT_SHA;
  });
});
