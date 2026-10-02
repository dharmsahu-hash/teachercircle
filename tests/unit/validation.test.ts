import { test, describe } from "node:test";
import assert from "node:assert";
import {
  adminUpdateTeacherSchema,
  isId,
  parseJsonBody,
  reviewSchema,
  signupSchema,
  submitReferenceSchema,
  teacherProfileSchema,
} from "../../lib/validation";

function jsonRequest(body: string) {
  return new Request("http://test.local/api", { method: "POST", body, headers: { "Content-Type": "application/json" } });
}

describe("isId", () => {
  test("accepts generated and seed-style ids", () => {
    assert.ok(isId("3595217f-1cf4-4493-ab03-6b8eaafd318c"));
    assert.ok(isId("a0000000-0000-0000-0000-000000000001"));
  });

  test("SECURITY: rejects anything that could add PostgREST filters", () => {
    assert.ok(!isId("3595217f-1cf4-4493-ab03-6b8eaafd318c&is_listed=eq.false"));
    assert.ok(!isId("x,y"));
    assert.ok(!isId(""));
    assert.ok(!isId(undefined));
    assert.ok(!isId({ id: "3595217f-1cf4-4493-ab03-6b8eaafd318c" }));
  });
});

describe("parseJsonBody", () => {
  test("malformed JSON is a 400 with a readable message, not a crash", async () => {
    const r = await parseJsonBody(jsonRequest("{not json"), signupSchema);
    assert.ok(!r.ok);
    if (!r.ok) {
      assert.strictEqual(r.response.status, 400);
      assert.deepStrictEqual(await r.response.json(), { error: "Request body must be valid JSON." });
    }
  });

  test("a JSON array or string instead of an object is a 400", async () => {
    for (const body of ["[1,2]", '"text"', "null"]) {
      const r = await parseJsonBody(jsonRequest(body), signupSchema);
      assert.ok(!r.ok, body);
    }
  });

  test("returns the first schema problem as the error message", async () => {
    const r = await parseJsonBody(jsonRequest(JSON.stringify({ email: "not-an-email", password: "x" })), signupSchema);
    assert.ok(!r.ok);
    if (!r.ok) assert.deepStrictEqual(await r.response.json(), { error: "Please enter a valid email address" });
  });

  test("valid input comes back typed and trimmed", async () => {
    const r = await parseJsonBody(jsonRequest(JSON.stringify({ email: "  a@b.co ", password: "Password1" })), signupSchema);
    assert.ok(r.ok);
    if (r.ok) assert.strictEqual(r.data.email, "a@b.co");
  });
});

describe("schemas", () => {
  const teacherId = "3595217f-1cf4-4493-ab03-6b8eaafd318c";

  test("review: rating must be a whole number 1-5; a numeric string is accepted", () => {
    assert.ok(reviewSchema.safeParse({ teacherId, rating: 5 }).success);
    assert.ok(reviewSchema.safeParse({ teacherId, rating: "4" }).success);
    assert.ok(!reviewSchema.safeParse({ teacherId, rating: 0 }).success);
    assert.ok(!reviewSchema.safeParse({ teacherId, rating: 4.5 }).success);
    assert.ok(!reviewSchema.safeParse({ teacherId, rating: 5, comment: "x".repeat(1001) }).success);
  });

  test("teacher profile: accepts what the profile form sends, including empty optional fields", () => {
    const form = {
      name: "Meera", bio: "", city: "Pune", pincode: "", subjects: "Maths, Physics",
      rate_per_hour: "", experience_years: "", contact_email: "", contact_phone: "",
      is_listed: true, self_attested: false,
    };
    assert.ok(teacherProfileSchema.safeParse(form).success);
    assert.ok(teacherProfileSchema.safeParse({ ...form, rate_per_hour: "600", experience_years: 5, pincode: "411001" }).success);
  });

  test("teacher profile: rejects bad pincodes, negative rates and fractional years", () => {
    assert.ok(!teacherProfileSchema.safeParse({ pincode: "4110" }).success);
    assert.ok(!teacherProfileSchema.safeParse({ rate_per_hour: -5 }).success);
    assert.ok(!teacherProfileSchema.safeParse({ experience_years: 2.5 }).success);
    assert.ok(!teacherProfileSchema.safeParse({ is_listed: "yes" }).success);
  });

  test("admin update: unknown keys are rejected, never passed to the database", () => {
    assert.ok(adminUpdateTeacherSchema.safeParse({ name: "X", rate_per_hour: null }).success);
    assert.ok(!adminUpdateTeacherSchema.safeParse({ name: "X", user_id: teacherId }).success);
  });

  test("UPI reference: letters, digits and dashes only", () => {
    assert.ok(submitReferenceSchema.safeParse({ transactionId: teacherId, utr: "412345678901" }).success);
    assert.ok(!submitReferenceSchema.safeParse({ transactionId: teacherId, utr: "12" }).success);
    assert.ok(!submitReferenceSchema.safeParse({ transactionId: teacherId, utr: "1234567&x=y" }).success);
  });
});

// ---- TeacherCircle Daily request schemas ----
import { dailyCompleteSchema, dailySyncSchema } from "../../lib/validation";

describe("daily quiz schemas", () => {
  test("complete: needs a known level and exactly 5 answer indexes (-1 = skipped)", () => {
    assert.ok(dailyCompleteSchema.safeParse({ level: "7-8", answers: [0, 1, 2, 3, -1] }).success);
    assert.ok(!dailyCompleteSchema.safeParse({ level: "11-12", answers: [0, 0, 0, 0, 0] }).success);
    assert.ok(!dailyCompleteSchema.safeParse({ level: "7-8", answers: [0, 0, 0] }).success);
    assert.ok(!dailyCompleteSchema.safeParse({ level: "7-8", answers: [0, 0, 0, 0, 4] }).success);
    assert.ok(!dailyCompleteSchema.safeParse({ level: "7-8", answers: [0, 0, 0, 0, 1.5] }).success);
  });

  test("sync: real dates and sane numbers only", () => {
    assert.ok(dailySyncSchema.safeParse({ current: 3, best: 5, last: "2026-10-02" }).success);
    assert.ok(dailySyncSchema.safeParse({ current: 0, best: 0, last: null }).success);
    assert.ok(dailySyncSchema.safeParse({ current: 0, best: 0 }).success);
    for (const last of ["2026-1-2", "yesterday", "2026-10-02T00:00", ""]) assert.ok(!dailySyncSchema.safeParse({ current: 1, best: 1, last }).success, last);
    assert.ok(!dailySyncSchema.safeParse({ current: -1, best: 1, last: "2026-10-02" }).success);
    assert.ok(!dailySyncSchema.safeParse({ current: 1, best: 99999, last: "2026-10-02" }).success);
  });
});
