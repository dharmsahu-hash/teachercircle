import { test, describe } from "node:test";
import assert from "node:assert";
import { slugify } from "../../lib/directory";

describe("slugify", () => {
  test("lowercases and hyphenates spaces", () => {
    assert.strictEqual(slugify("Computer Science"), "computer-science");
  });

  test("trims and collapses repeated separators", () => {
    assert.strictEqual(slugify("  Bangalore  "), "bangalore");
    assert.strictEqual(slugify("Bangalore,  Kanpur"), "bangalore-kanpur");
  });

  test("strips leading/trailing separators produced by punctuation at the edges", () => {
    assert.strictEqual(slugify("-Maths-"), "maths");
  });

  test("two differently-formatted real inputs collapse to the same slug (the actual reason this exists)", () => {
    assert.strictEqual(slugify("Bengaluru"), slugify("bengaluru "));
  });

  test("empty or punctuation-only input slugifies to an empty string", () => {
    assert.strictEqual(slugify("   "), "");
    assert.strictEqual(slugify("---"), "");
  });
});
