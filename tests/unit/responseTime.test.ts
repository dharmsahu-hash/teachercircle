import { test, describe } from "node:test";
import assert from "node:assert";
import { responseTimeLabel } from "../../lib/responseTime";

describe("responseTimeLabel", () => {
  test("returns null with fewer than 3 replied conversations, regardless of speed", () => {
    assert.strictEqual(responseTimeLabel(1, 2), null);
    assert.strictEqual(responseTimeLabel(1, 0), null);
    assert.strictEqual(responseTimeLabel(1, null), null);
  });

  test("returns null when there's no average at all", () => {
    assert.strictEqual(responseTimeLabel(null, 10), null);
    assert.strictEqual(responseTimeLabel(undefined, 10), null);
  });

  test("buckets into honest, low-precision ranges rather than exact numbers", () => {
    assert.strictEqual(responseTimeLabel(2, 5), "Usually replies within a few hours");
    assert.strictEqual(responseTimeLabel(20, 5), "Usually replies within a day");
    assert.strictEqual(responseTimeLabel(50, 5), "Usually replies within a few days");
    assert.strictEqual(responseTimeLabel(200, 5), "Usually replies within a week or so");
  });

  test("boundary values fall into the faster bucket (<=), not the slower one", () => {
    assert.strictEqual(responseTimeLabel(3, 5), "Usually replies within a few hours");
    assert.strictEqual(responseTimeLabel(24, 5), "Usually replies within a day");
    assert.strictEqual(responseTimeLabel(72, 5), "Usually replies within a few days");
  });
});
