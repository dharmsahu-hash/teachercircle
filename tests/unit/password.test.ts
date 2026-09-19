import { test, describe } from "node:test";
import assert from "node:assert";
import { passwordStrengthError } from "../../lib/password";

describe("passwordStrengthError", () => {
  test("rejects passwords under 8 characters", () => {
    assert.match(passwordStrengthError("Ab1defg") ?? "", /at least 8/);
  });

  test("rejects absurdly long passwords", () => {
    assert.match(passwordStrengthError("a".repeat(200)) ?? "", /too long/);
  });

  test("rejects passwords with only one character class, even if long", () => {
    assert.match(passwordStrengthError("aaaaaaaaaaaaaaaa") ?? "", /too weak/);
    assert.match(passwordStrengthError("11111111") ?? "", /too weak/);
  });

  test("accepts a password mixing just two character classes (matches existing test fixtures)", () => {
    assert.strictEqual(passwordStrengthError("pw123456"), null);
  });

  test("accepts a password mixing three or four character classes", () => {
    assert.strictEqual(passwordStrengthError("TestPass123!"), null);
  });
});
