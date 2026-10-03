import { test, describe } from "node:test";
import assert from "node:assert";
import { isAllowedPushEndpoint } from "../../lib/pushEndpoint";
import { isJobRequest } from "../../lib/jobSecret";
import { buildDigestEmail } from "../../lib/digestEmail";

describe("push endpoint allowlist", () => {
  test("accepts the real push services", () => {
    for (const u of [
      "https://fcm.googleapis.com/fcm/send/abc",
      "https://updates.push.services.mozilla.com/wpush/v2/abc",
      "https://web.push.apple.com/QWERTY",
      "https://wns2-par02p.notify.windows.com/w/?token=x",
    ]) assert.ok(isAllowedPushEndpoint(u), u);
  });
  test("SECURITY: rejects internal, look-alike, http and credentialed URLs", () => {
    for (const u of [
      "http://fcm.googleapis.com/x",
      "https://169.254.169.254/latest/meta-data",
      "https://localhost/x",
      "https://evilfcm.googleapis.com.attacker.io/x",
      "https://fcm.googleapis.com.evil.com/x",
      "https://user:pw@fcm.googleapis.com/x",
      "https://fcm.googleapis.com:8443/x",
      "notaurl",
      "",
    ]) assert.ok(!isAllowedPushEndpoint(u), u);
    assert.ok(!isAllowedPushEndpoint(undefined));
    assert.ok(!isAllowedPushEndpoint("https://fcm.googleapis.com/" + "a".repeat(700)));
  });
});

describe("job secret", () => {
  const secret = "s".repeat(40);
  test("needs the exact bearer token", () => {
    assert.ok(isJobRequest(`Bearer ${secret}`, secret));
    assert.ok(!isJobRequest(`Bearer ${secret}x`, secret));
    assert.ok(!isJobRequest("Bearer wrong", secret));
    assert.ok(!isJobRequest(null, secret));
  });
  test("an unset secret never authorizes", () => {
    assert.ok(!isJobRequest("Bearer ", null));
    assert.ok(!isJobRequest("Bearer abc", null));
  });
});

describe("digest email", () => {
  const row = {
    userId: "u", email: "t@x.in", name: "Meera Rao", city: "Pune", count: 1,
    requests: [{ id: "11111111-1111-1111-1111-111111111111", subject: "Maths", city: "Pune", class: "9", board: "cbse", exam: null, mode: "home", details: "<b>Need</b> help" }],
  };
  test("no activity means no email", () => {
    assert.strictEqual(buildDigestEmail({ ...row, count: 0, requests: [] }, "https://x.in", "https://x.in/u"), null);
    assert.strictEqual(buildDigestEmail({ ...row, requests: null }, "https://x.in", "https://x.in/u"), null);
  });
  test("builds a subject, links, unsubscribe, and escapes user text", () => {
    const m = buildDigestEmail(row, "https://x.in", "https://x.in/unsubscribe?t=1")!;
    assert.match(m.subject, /1 new student request/);
    assert.ok(m.html.includes("https://x.in/tutor-requests/11111111-1111-1111-1111-111111111111"));
    assert.ok(m.html.includes("Stop these emails"));
    assert.ok(!m.html.includes("<b>Need"));
    assert.ok(m.html.includes("Hi Meera"));
  });
  test("mentions how many more are waiting", () => {
    const m = buildDigestEmail({ ...row, count: 8 }, "https://x.in", "u")!;
    assert.match(m.subject, /8 new student requests/);
    assert.ok(m.html.includes("7 more"));
  });
});

import { signUnsubscribe, verifyUnsubscribe } from "../../lib/jobSecret";

describe("unsubscribe token", () => {
  const secret = "k".repeat(40);
  const uid = "3595217f-1cf4-4493-ab03-6b8eaafd318c";
  test("round-trips and rejects tampering", () => {
    const t = signUnsubscribe(uid, secret);
    assert.strictEqual(verifyUnsubscribe(t, secret), uid);
    assert.strictEqual(verifyUnsubscribe(t.replace(uid, "a0000000-0000-0000-0000-000000000001"), secret), null);
    assert.strictEqual(verifyUnsubscribe(t, "z".repeat(40)), null);
    assert.strictEqual(verifyUnsubscribe("garbage", secret), null);
    assert.strictEqual(verifyUnsubscribe(undefined, secret), null);
    assert.strictEqual(verifyUnsubscribe(t, null), null);
  });
});
