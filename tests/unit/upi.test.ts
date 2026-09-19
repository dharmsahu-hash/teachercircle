import { test, describe } from "node:test";
import assert from "node:assert";
import { buildUpiDeepLink, buildUpiDonationLink, buildUpiQrDataUrl } from "../../lib/upi";

describe("buildUpiDeepLink — positive cases", () => {
  test("builds a upi://pay link with the configured VPA and name", () => {
    process.env.UPI_PAYEE_VPA = "teacher@upi";
    process.env.UPI_PAYEE_NAME = "TeacherCircle";
    const link = buildUpiDeepLink(999, "SUB-abc123");
    assert.ok(link.startsWith("upi://pay?"));
    const params = new URLSearchParams(link.replace("upi://pay?", ""));
    assert.strictEqual(params.get("pa"), "teacher@upi");
    assert.strictEqual(params.get("pn"), "TeacherCircle");
    assert.strictEqual(params.get("am"), "999.00");
    assert.strictEqual(params.get("cu"), "INR");
    assert.strictEqual(params.get("tn"), "SUB-abc123");
  });

  test("formats amounts to exactly two decimal places", () => {
    process.env.UPI_PAYEE_VPA = "teacher@upi";
    process.env.UPI_PAYEE_NAME = "TeacherCircle";
    const link = buildUpiDeepLink(499.5, "note");
    const params = new URLSearchParams(link.replace("upi://pay?", ""));
    assert.strictEqual(params.get("am"), "499.50");
  });

  test("falls back to default payee values when env vars are unset", () => {
    delete process.env.UPI_PAYEE_VPA;
    delete process.env.UPI_PAYEE_NAME;
    const link = buildUpiDeepLink(100, "note");
    const params = new URLSearchParams(link.replace("upi://pay?", ""));
    assert.strictEqual(params.get("pa"), "yourname@upi");
    assert.strictEqual(params.get("pn"), "TeacherCircle");
  });
});

describe("buildUpiDeepLink — negative / edge cases", () => {
  test("URL-encodes special characters in the note so the link stays a single valid URI", () => {
    process.env.UPI_PAYEE_VPA = "teacher@upi";
    process.env.UPI_PAYEE_NAME = "TeacherCircle";
    const link = buildUpiDeepLink(100, "note with spaces & an & ampersand");
    // A raw space/ampersand would corrupt the query string (extra params);
    // URLSearchParams round-trips correctly only if encoding was correct.
    const params = new URLSearchParams(link.replace("upi://pay?", ""));
    assert.strictEqual(params.get("tn"), "note with spaces & an & ampersand");
    assert.strictEqual([...params.keys()].length, 5); // pa, pn, am, cu, tn — nothing extra leaked in
  });

  test("a negative amount still formats without throwing (caller's responsibility to validate)", () => {
    process.env.UPI_PAYEE_VPA = "teacher@upi";
    process.env.UPI_PAYEE_NAME = "TeacherCircle";
    assert.doesNotThrow(() => buildUpiDeepLink(-50, "note"));
  });
});

describe("buildUpiDonationLink", () => {
  test("omits the amount param entirely so the payer's UPI app prompts for one", () => {
    process.env.UPI_PAYEE_VPA = "teacher@upi";
    process.env.UPI_PAYEE_NAME = "TeacherCircle";
    const link = buildUpiDonationLink();
    const params = new URLSearchParams(link.replace("upi://pay?", ""));
    assert.strictEqual(params.has("am"), false);
    assert.strictEqual(params.get("pa"), "teacher@upi");
    assert.strictEqual(params.get("tn"), "Support TeacherCircle");
  });

  test("accepts a custom note", () => {
    process.env.UPI_PAYEE_VPA = "teacher@upi";
    process.env.UPI_PAYEE_NAME = "TeacherCircle";
    const link = buildUpiDonationLink("Buy us a coffee");
    const params = new URLSearchParams(link.replace("upi://pay?", ""));
    assert.strictEqual(params.get("tn"), "Buy us a coffee");
  });
});

describe("buildUpiQrDataUrl", () => {
  test("returns a PNG data URL for a valid deep link", async () => {
    const dataUrl = await buildUpiQrDataUrl("upi://pay?pa=x@upi&pn=X&am=1.00&cu=INR&tn=t");
    assert.ok(dataUrl.startsWith("data:image/png;base64,"), `unexpected prefix: ${dataUrl.slice(0, 40)}`);
    assert.ok(dataUrl.length > 100, "data URL looks too short to be a real QR image");
  });
});
