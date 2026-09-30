import { test, describe } from "node:test";
import assert from "node:assert";
import { getAppBaseUrl } from "../../lib/url";

function clearUrlEnv() {
  delete process.env.APP_HOSTNAME;
  delete process.env.VERCEL_ENV;
  delete process.env.VERCEL_URL;
  delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
}

describe("getAppBaseUrl", () => {
  test("uses http:// for localhost", () => {
    clearUrlEnv();
    process.env.APP_HOSTNAME = "localhost:3000";
    assert.strictEqual(getAppBaseUrl(), "http://localhost:3000");
  });

  test("uses https:// for a real deployed hostname (the actual bug this fixes)", () => {
    clearUrlEnv();
    process.env.APP_HOSTNAME = "teachercircle.vercel.app";
    assert.strictEqual(getAppBaseUrl(), "https://teachercircle.vercel.app");
  });

  test("falls back to localhost:3000 when APP_HOSTNAME is unset", () => {
    clearUrlEnv();
    assert.strictEqual(getAppBaseUrl(), "http://localhost:3000");
  });

  test("a localhost APP_HOSTNAME does not override the public host the user signed up on", () => {
    clearUrlEnv();
    process.env.APP_HOSTNAME = "localhost:3000";
    assert.strictEqual(getAppBaseUrl("teachercircle.vercel.app"), "https://teachercircle.vercel.app");
  });

  test("production Vercel domain wins over a localhost APP_HOSTNAME", () => {
    clearUrlEnv();
    process.env.APP_HOSTNAME = "localhost:3000";
    process.env.VERCEL_ENV = "production";
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "teachercircle.vercel.app";
    assert.strictEqual(getAppBaseUrl(), "https://teachercircle.vercel.app");
  });

  test("an explicit public APP_HOSTNAME wins over a different request host", () => {
    clearUrlEnv();
    process.env.APP_HOSTNAME = "teachercircle.vercel.app";
    assert.strictEqual(getAppBaseUrl("evil.example"), "https://teachercircle.vercel.app");
  });
});
