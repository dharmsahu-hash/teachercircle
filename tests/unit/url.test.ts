import { test, describe } from "node:test";
import assert from "node:assert";
import { getAppBaseUrl } from "../../lib/url";

describe("getAppBaseUrl", () => {
  test("uses http:// for localhost", () => {
    process.env.APP_HOSTNAME = "localhost:3000";
    assert.strictEqual(getAppBaseUrl(), "http://localhost:3000");
  });

  test("uses https:// for a real deployed hostname (the actual bug this fixes)", () => {
    process.env.APP_HOSTNAME = "teachercircle.vercel.app";
    assert.strictEqual(getAppBaseUrl(), "https://teachercircle.vercel.app");
  });

  test("falls back to localhost:3000 when APP_HOSTNAME is unset", () => {
    delete process.env.APP_HOSTNAME;
    assert.strictEqual(getAppBaseUrl(), "http://localhost:3000");
  });
});
