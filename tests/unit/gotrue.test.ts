import { test, describe } from "node:test";
import assert from "node:assert";

const gotrueModuleUrl = new URL("../../lib/gotrue.ts", import.meta.url).href;

describe("signUpWithPassword confirmation redirect", () => {
  test("puts redirect_to on the query string and leaves it out of the JSON body", async (t) => {
    process.env.GOTRUE_URL = "http://gotrue.test";
    process.env.APP_HOSTNAME = "teachercircle.vercel.app";
    delete process.env.SUPABASE_API_KEY;

    let capturedUrl = "";
    let capturedBody = "";
    t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
      capturedUrl = String(url);
      capturedBody = String(init.body);
      return new Response(JSON.stringify({ id: "user-1", email: "a@b.co" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const { signUpWithPassword } = await import(`${gotrueModuleUrl}?signup-redirect=1`);
    const result = await signUpWithPassword("a@b.co", "Password1");

    const url = new URL(capturedUrl);
    assert.strictEqual(url.origin + url.pathname, "http://gotrue.test/signup");
    assert.strictEqual(url.searchParams.get("redirect_to"), "https://teachercircle.vercel.app/auth/callback");
    assert.deepStrictEqual(JSON.parse(capturedBody), { email: "a@b.co", password: "Password1" });
    assert.deepStrictEqual(result, { confirmationRequired: true, user: { id: "user-1", email: "a@b.co" } });
  });

  test("confirmation redirect uses the public request host when APP_HOSTNAME is localhost", async (t) => {
    process.env.GOTRUE_URL = "http://gotrue.test";
    process.env.APP_HOSTNAME = "localhost:3000";
    delete process.env.VERCEL_ENV;
    delete process.env.VERCEL_URL;
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
    delete process.env.SUPABASE_API_KEY;

    let capturedUrl = "";
    t.mock.method(globalThis, "fetch", async (url: string) => {
      capturedUrl = String(url);
      return new Response(JSON.stringify({ id: "user-3", email: "c@d.co" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const { signUpWithPassword } = await import(`${gotrueModuleUrl}?signup-public-host=1`);
    await signUpWithPassword("c@d.co", "Password1", "teachercircle.vercel.app");

    const url = new URL(capturedUrl);
    assert.strictEqual(url.searchParams.get("redirect_to"), "https://teachercircle.vercel.app/auth/callback");
  });

  test("still returns the session when GoTrue autoconfirms and sends an access token", async (t) => {
    process.env.GOTRUE_URL = "http://gotrue.test";
    process.env.APP_HOSTNAME = "localhost:3000";
    delete process.env.SUPABASE_API_KEY;

    t.mock.method(globalThis, "fetch", async () => {
      return new Response(
        JSON.stringify({
          access_token: "tok",
          refresh_token: "ref",
          expires_in: 3600,
          user: { id: "user-2", email: "b@c.co" },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    });

    const { signUpWithPassword } = await import(`${gotrueModuleUrl}?signup-session=1`);
    const result = await signUpWithPassword("b@c.co", "Password1");
    assert.ok(!("confirmationRequired" in result));
    if ("confirmationRequired" in result) return;
    assert.strictEqual(result.access_token, "tok");
  });
});
