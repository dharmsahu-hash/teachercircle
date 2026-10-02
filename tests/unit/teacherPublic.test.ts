import { test, describe, beforeEach } from "node:test";
import assert from "node:assert";
import { queryTeacherPublic, _resetLevelsCheck } from "../../lib/teacherPublic";

const missingColumn = () =>
  new Response(JSON.stringify({ code: "42703", message: "column teacher_public.teaching_mode does not exist" }), { status: 400 });

describe("queryTeacherPublic (database without migration 0027)", () => {
  beforeEach(() => _resetLevelsCheck());

  test("normal database: one query, levels available", async (t) => {
    const urls: string[] = [];
    t.mock.method(globalThis, "fetch", async (url: string) => {
      urls.push(String(url));
      return new Response(JSON.stringify([{ user_id: "a" }]), { status: 200 });
    });
    const r = await queryTeacherPublic("select=user_id,teaching_mode");
    assert.deepStrictEqual(r, { rows: [{ user_id: "a" }], levelsAvailable: true });
    assert.strictEqual(urls.length, 1);
  });

  test("missing 0027 columns: retries without them and their filters instead of failing (the 2026-10-02 outage)", async (t) => {
    t.mock.method(console, "warn", () => {});
    const urls: string[] = [];
    const raw: string[] = [];
    t.mock.method(globalThis, "fetch", async (url: string) => {
      raw.push(String(url));
      urls.push(decodeURIComponent(String(url)));
      return urls.length === 1 ? missingColumn() : new Response(JSON.stringify([{ user_id: "a" }]), { status: 200 });
    });
    const r = await queryTeacherPublic(
      "subjects=cs.%7BMaths%7D&city=ilike.*A%20%26%20B*&teaching_mode=in.(online,both)&classes=cs.%7B10%7D&order=avg_rating.desc&select=user_id,name,teaching_mode,classes,boards,exams"
    );
    assert.strictEqual(r.levelsAvailable, false);
    assert.deepStrictEqual(r.rows, [{ user_id: "a" }]);
    const retry = urls[1];
    assert.ok(!/teaching_mode|classes|boards|exams/.test(retry), retry);
    assert.ok(retry.includes("subjects=cs.{Maths}") && retry.includes("select=user_id,name") && retry.includes("order=avg_rating.desc"), retry);
    // A city value containing "&" is re-encoded, so it stays one parameter.
    assert.ok(raw[1].includes("city=ilike.*A%20%26%20B*"), raw[1]);
    assert.strictEqual(urls.length, 2);
  });

  test("remembers the missing columns for a minute (no doubled queries on every request)", async (t) => {
    t.mock.method(console, "warn", () => {});
    let calls = 0;
    t.mock.method(globalThis, "fetch", async () => {
      calls++;
      return calls === 1 ? missingColumn() : new Response("[]", { status: 200 });
    });
    await queryTeacherPublic("select=user_id,teaching_mode");
    await queryTeacherPublic("select=user_id,teaching_mode");
    assert.strictEqual(calls, 3); // fail + retry, then straight to the fallback
  });

  test("any other database error is still thrown, not hidden", async (t) => {
    t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({ message: "permission denied" }), { status: 401 }));
    await assert.rejects(queryTeacherPublic("select=user_id"));
  });
});
