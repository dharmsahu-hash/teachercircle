import { test, describe } from "node:test";
import assert from "node:assert";
import { decodeJwt } from "../../lib/jwt";

function b64url(obj: unknown) {
  return Buffer.from(JSON.stringify(obj)).toString("base64url");
}

describe("decodeJwt — positive cases", () => {
  test("decodes a well-formed three-part token", () => {
    const token = `${b64url({ alg: "none" })}.${b64url({ sub: "user-1", role: "authenticated", exp: 9999999999 })}.sig`;
    const claims = decodeJwt(token);
    assert.strictEqual(claims?.sub, "user-1");
    assert.strictEqual(claims?.role, "authenticated");
  });

  test("decodes claims containing unicode without throwing", () => {
    const token = `h.${b64url({ sub: "user-2", email: "tëst@example.com" })}.sig`;
    const claims = decodeJwt(token);
    assert.strictEqual(claims?.email, "tëst@example.com");
  });
});

describe("decodeJwt — negative cases", () => {
  test("returns null for an empty string", () => {
    assert.strictEqual(decodeJwt(""), null);
  });

  test("returns null for a token with no '.' separators", () => {
    assert.strictEqual(decodeJwt("not-a-jwt-at-all"), null);
  });

  test("returns null when the payload segment is not valid base64url JSON", () => {
    assert.strictEqual(decodeJwt("header.%%%not-base64%%%.sig"), null);
  });

  test("returns null for a payload that decodes to valid base64 but invalid JSON", () => {
    const notJson = Buffer.from("this is not json").toString("base64url");
    assert.strictEqual(decodeJwt(`h.${notJson}.sig`), null);
  });

  test("does not throw on a token with only one segment", () => {
    assert.doesNotThrow(() => decodeJwt("onlyonepart"));
  });
});
