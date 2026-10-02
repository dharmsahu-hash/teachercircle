import { test, describe } from "node:test";
import assert from "node:assert";
import { canonicalHost, canonicalRedirectUrl, cleanHost, twinHost, type HostEnv } from "../../lib/canonicalHost";

const prod: HostEnv = { VERCEL_ENV: "production", APP_HOSTNAME: "teacherscircle.co.in" };
const go = (host: string | null, env: HostEnv = prod, pathname = "/search", search = "?subject=Maths") =>
  canonicalRedirectUrl({ host, pathname, search, env });

describe("canonical host redirect", () => {
  test("the vercel.app production hostname redirects to the custom domain, keeping path and query", () => {
    assert.strictEqual(go("teachercircle.vercel.app"), "https://teacherscircle.co.in/search?subject=Maths");
  });

  test("any deployment-specific *.vercel.app host on production also redirects", () => {
    assert.strictEqual(go("teachercircle-abc123-knowledge-wala.vercel.app", prod, "/", ""), "https://teacherscircle.co.in/");
  });

  test("www redirects to the apex domain (and the reverse when www is canonical)", () => {
    assert.strictEqual(go("www.teacherscircle.co.in", prod, "/blog", ""), "https://teacherscircle.co.in/blog");
    assert.strictEqual(
      go("teacherscircle.co.in", { ...prod, APP_HOSTNAME: "www.teacherscircle.co.in" }, "/", ""),
      "https://www.teacherscircle.co.in/"
    );
  });

  test("the canonical host itself is served, with or without a port or capitals", () => {
    assert.strictEqual(go("teacherscircle.co.in"), null);
    assert.strictEqual(go("TeachersCircle.co.in:443"), null);
  });

  test("preview deployments (the stage branch) and local dev are never redirected", () => {
    assert.strictEqual(go("teachercircle-git-stage-knowledge-wala.vercel.app", { ...prod, VERCEL_ENV: "preview" }), null);
    assert.strictEqual(go("localhost:3000", { APP_HOSTNAME: "teacherscircle.co.in" }), null);
    assert.strictEqual(go("teachercircle.vercel.app", { APP_HOSTNAME: "teacherscircle.co.in" }), null); // VERCEL_ENV unset
  });

  test("SAFETY: with no custom domain configured nothing redirects (no loop, no dead end)", () => {
    assert.strictEqual(go("teachercircle.vercel.app", { VERCEL_ENV: "production" }), null);
    assert.strictEqual(go("teachercircle.vercel.app", { VERCEL_ENV: "production", APP_HOSTNAME: "teachercircle.vercel.app" }), null);
    assert.strictEqual(go("teachercircle.vercel.app", { VERCEL_ENV: "production", APP_HOSTNAME: "localhost:3000" }), null);
  });

  test("falls back to Vercel's production domain when it is a custom one", () => {
    const env = { VERCEL_ENV: "production", VERCEL_PROJECT_PRODUCTION_URL: "teacherscircle.co.in" };
    assert.strictEqual(go("teachercircle.vercel.app", env, "/", ""), "https://teacherscircle.co.in/");
    assert.strictEqual(go("teachercircle.vercel.app", { ...env, VERCEL_PROJECT_PRODUCTION_URL: "teachercircle.vercel.app" }), null);
  });

  test("the off switch disables it", () => {
    assert.strictEqual(go("teachercircle.vercel.app", { ...prod, DISABLE_CANONICAL_REDIRECT: "1" }), null);
  });

  test("an unknown host is left alone, and a missing host never throws", () => {
    assert.strictEqual(go("example.org"), null);
    assert.strictEqual(go(null), null);
    assert.strictEqual(go(""), null);
  });

  test("helpers", () => {
    assert.strictEqual(cleanHost("https://Example.com:8080/x"), "example.com");
    assert.strictEqual(twinHost("teacherscircle.co.in"), "www.teacherscircle.co.in");
    assert.strictEqual(twinHost("www.teacherscircle.co.in"), "teacherscircle.co.in");
    assert.strictEqual(canonicalHost({ APP_HOSTNAME: "x.vercel.app", VERCEL_PROJECT_PRODUCTION_URL: "teacherscircle.co.in" }), "teacherscircle.co.in");
  });
});
