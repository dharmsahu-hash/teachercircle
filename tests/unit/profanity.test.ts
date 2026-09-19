import { test, describe } from "node:test";
import assert from "node:assert";
import { containsAbusiveLanguage } from "../../lib/profanity";

describe("containsAbusiveLanguage — positive cases (should block)", () => {
  test("flags a plain English profanity", () => {
    assert.strictEqual(containsAbusiveLanguage("This teacher is shit"), true);
  });

  test("flags a common Hinglish profanity", () => {
    assert.strictEqual(containsAbusiveLanguage("Yeh teacher bahut madarchod hai"), true);
  });

  test("is case-insensitive", () => {
    assert.strictEqual(containsAbusiveLanguage("What a BASTARD"), true);
  });

  test("catches repeated-letter dodges (e.g. 'fuuuck')", () => {
    assert.strictEqual(containsAbusiveLanguage("fuuuck this"), true);
  });
});

describe("containsAbusiveLanguage — negative cases (should allow)", () => {
  test("empty/undefined-ish input is not flagged", () => {
    assert.strictEqual(containsAbusiveLanguage(""), false);
  });

  test("ordinary positive feedback is not flagged", () => {
    assert.strictEqual(containsAbusiveLanguage("Great teacher, very patient and clear!"), false);
  });

  test("ordinary negative-but-civil feedback is not flagged", () => {
    assert.strictEqual(
      containsAbusiveLanguage("Was often late and did not explain topics well."),
      false
    );
  });

  test("does not false-positive on a substring inside an unrelated word", () => {
    // 'assassin' contains 'ass' but not as a whole word — must not be flagged.
    assert.strictEqual(containsAbusiveLanguage("He teaches history, including assassinations."), false);
  });
});
