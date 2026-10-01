import { test, describe } from "node:test";
import assert from "node:assert";
import { PostgrestError, publicErrorMessage } from "../../lib/db";

const gotrueModuleUrl = new URL("../../lib/gotrue.ts", import.meta.url).href;

describe("publicErrorMessage", () => {
  test("maps one of our own raise-exception messages to friendly text", (t) => {
    t.mock.method(console, "error", () => {});
    const err = new PostgrestError(400, JSON.stringify({ code: "P0001", message: "not connected" }));
    assert.strictEqual(publicErrorMessage(err, "fallback"), "Connect with this teacher first.");
  });

  test("never returns raw Postgres text: constraint names fall back", (t) => {
    t.mock.method(console, "error", () => {});
    const err = new PostgrestError(
      409,
      JSON.stringify({ code: "23505", message: 'duplicate key value violates unique constraint "review_teacher_id_reviewer_id_key"' })
    );
    const msg = publicErrorMessage(err, "Could not save your feedback.");
    assert.strictEqual(msg, "Could not save your feedback.");
    assert.doesNotMatch(msg, /constraint|review_|PostgREST/);
  });

  test("RLS policy violations fall back instead of naming the table", (t) => {
    t.mock.method(console, "error", () => {});
    const err = new PostgrestError(
      403,
      JSON.stringify({ code: "42501", message: 'new row violates row-level security policy for table "review"' })
    );
    assert.strictEqual(publicErrorMessage(err, "fallback"), "fallback");
  });

  test("non-JSON bodies (gateway HTML) and plain errors fall back", (t) => {
    t.mock.method(console, "error", () => {});
    assert.strictEqual(publicErrorMessage(new PostgrestError(502, "<html>Bad Gateway</html>"), "fb"), "fb");
    assert.strictEqual(publicErrorMessage(new TypeError("fetch failed"), "fb"), "fb");
    assert.strictEqual(publicErrorMessage("weird", "fb"), "fb");
  });

  test("logs the full error server-side when falling back", (t) => {
    const logged: unknown[] = [];
    t.mock.method(console, "error", (e: unknown) => logged.push(e));
    const err = new PostgrestError(500, JSON.stringify({ message: "relation does not exist" }));
    publicErrorMessage(err, "fb");
    assert.strictEqual(logged[0], err);
  });
});

describe("GoTrueError", () => {
  test("keeps GoTrue's own user-facing message", async (t) => {
    process.env.GOTRUE_URL = "http://gotrue.test";
    t.mock.method(globalThis, "fetch", async () =>
      new Response(JSON.stringify({ error_description: "Invalid login credentials" }), { status: 400 })
    );
    const { signInWithPassword, GoTrueError } = await import(`${gotrueModuleUrl}?gotrue-error=1`);
    await assert.rejects(signInWithPassword("a@b.co", "Password1"), (err: Error) => {
      assert.ok(err instanceof GoTrueError);
      assert.strictEqual(err.message, "Invalid login credentials");
      return true;
    });
  });

  test("replaces an empty GoTrue error body with a generic message, not the path or status", async (t) => {
    process.env.GOTRUE_URL = "http://gotrue.test";
    t.mock.method(console, "error", () => {});
    t.mock.method(globalThis, "fetch", async () => new Response("", { status: 500 }));
    const { signInWithPassword } = await import(`${gotrueModuleUrl}?gotrue-error=2`);
    await assert.rejects(signInWithPassword("a@b.co", "Password1"), (err: Error) => {
      assert.doesNotMatch(err.message, /GoTrue|token|500/);
      return true;
    });
  });
});
