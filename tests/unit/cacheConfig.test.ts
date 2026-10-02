import { test, describe } from "node:test";
import assert from "node:assert";
import { cacheSeconds } from "../../lib/cacheConfig";

describe("cacheSeconds", () => {
  test("production deploys cache for 5 minutes by default", () => {
    assert.strictEqual(cacheSeconds({ VERCEL_ENV: "production" }), 300);
  });

  test("previews, local dev and tests never cache (they must read fresh data)", () => {
    assert.strictEqual(cacheSeconds({ VERCEL_ENV: "preview" }), 0);
    assert.strictEqual(cacheSeconds({}), 0);
  });

  test("DIRECTORY_CACHE_SECONDS overrides, including 0 to switch it off in production", () => {
    assert.strictEqual(cacheSeconds({ VERCEL_ENV: "production", DIRECTORY_CACHE_SECONDS: "60" }), 60);
    assert.strictEqual(cacheSeconds({ VERCEL_ENV: "production", DIRECTORY_CACHE_SECONDS: "0" }), 0);
    assert.strictEqual(cacheSeconds({ DIRECTORY_CACHE_SECONDS: "30" }), 30);
  });

  test("a bad value never enables a weird cache: it means no cache", () => {
    for (const bad of ["abc", "-5", "NaN"]) assert.strictEqual(cacheSeconds({ VERCEL_ENV: "production", DIRECTORY_CACHE_SECONDS: bad }), 0, bad);
    assert.strictEqual(cacheSeconds({ VERCEL_ENV: "production", DIRECTORY_CACHE_SECONDS: "" }), 300);
  });
});
