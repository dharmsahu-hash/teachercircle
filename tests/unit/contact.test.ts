import { test, describe } from "node:test";
import assert from "node:assert";
import { isValidPhone, isValidFullName } from "../../lib/contact";

describe("isValidPhone", () => {
  test("null/empty is valid (optional field)", () => {
    assert.strictEqual(isValidPhone(null), true);
    assert.strictEqual(isValidPhone(undefined), true);
    assert.strictEqual(isValidPhone(""), true);
  });

  test("accepts a plausible Indian mobile number with country code", () => {
    assert.strictEqual(isValidPhone("+91 90000 00000"), true);
  });

  test("accepts digits-only", () => {
    assert.strictEqual(isValidPhone("9000000000"), true);
  });

  test("rejects letters", () => {
    assert.strictEqual(isValidPhone("call me maybe"), false);
  });

  test("rejects something far too short to be a phone number", () => {
    assert.strictEqual(isValidPhone("123"), false);
  });

  test("rejects an absurdly long string", () => {
    assert.strictEqual(isValidPhone("1".repeat(30)), false);
  });
});

describe("isValidFullName", () => {
  test("rejects empty/whitespace-only", () => {
    assert.strictEqual(isValidFullName(""), false);
    assert.strictEqual(isValidFullName("   "), false);
    assert.strictEqual(isValidFullName(null), false);
  });

  test("accepts an ordinary name", () => {
    assert.strictEqual(isValidFullName("Priya Nair"), true);
  });

  test("rejects a name over 120 chars", () => {
    assert.strictEqual(isValidFullName("a".repeat(121)), false);
  });
});
