import { test, describe } from "node:test";
import assert from "node:assert";

const emailModuleUrl = new URL("../../lib/email.ts", import.meta.url).href;

let caseId = 0;
async function loadEmail(t: any, apiKey: string | undefined) {
  if (apiKey === undefined) delete process.env.BREVO_API_KEY;
  else process.env.BREVO_API_KEY = apiKey;
  return import(`${emailModuleUrl}?case=${caseId++}`);
}

describe("sendEmail — not configured", () => {
  test("no-ops (never calls fetch) when BREVO_API_KEY is unset", async (t) => {
    let called = false;
    t.mock.method(globalThis, "fetch", async () => {
      called = true;
      return new Response("{}", { status: 200 });
    });
    const { sendEmail } = await loadEmail(t, undefined);
    await sendEmail("someone@example.com", "Subject", "<p>Body</p>");
    assert.strictEqual(called, false);
  });
});

describe("sendEmail — configured", () => {
  test("calls Brevo's API with the correct method, headers, and body shape", async (t) => {
    let capturedUrl: string | undefined;
    let capturedInit: any;
    t.mock.method(globalThis, "fetch", async (url: string, init: any) => {
      capturedUrl = url;
      capturedInit = init;
      return new Response(JSON.stringify({ messageId: "abc" }), { status: 201 });
    });

    const { sendEmail } = await loadEmail(t, "test-api-key");
    await sendEmail("recipient@example.com", "New message on TeacherCircle", "<p>Hi</p>");

    assert.strictEqual(capturedUrl, "https://api.brevo.com/v3/smtp/email");
    assert.strictEqual(capturedInit.method, "POST");
    assert.strictEqual(capturedInit.headers["api-key"], "test-api-key");
    assert.strictEqual(capturedInit.headers["Content-Type"], "application/json");

    const body = JSON.parse(capturedInit.body);
    assert.strictEqual(body.to[0].email, "recipient@example.com");
    assert.strictEqual(body.subject, "New message on TeacherCircle");
    assert.strictEqual(body.htmlContent, "<p>Hi</p>");
    assert.ok(body.sender?.email, "sender.email should be set");
  });

  test("does not throw when Brevo returns a non-2xx response", async (t) => {
    t.mock.method(globalThis, "fetch", async () => new Response("bad request", { status: 400 }));
    const { sendEmail } = await loadEmail(t, "test-api-key");
    await assert.doesNotReject(() => sendEmail("recipient@example.com", "Subject", "<p>Body</p>"));
  });

  test("does not throw when fetch itself rejects (network error)", async (t) => {
    t.mock.method(globalThis, "fetch", async () => {
      throw new Error("network down");
    });
    const { sendEmail } = await loadEmail(t, "test-api-key");
    await assert.doesNotReject(() => sendEmail("recipient@example.com", "Subject", "<p>Body</p>"));
  });
});
