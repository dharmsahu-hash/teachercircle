import { test, describe } from "node:test";
import assert from "node:assert";
import {
  containsContactInfo,
  daysLeft,
  normalizeSubject,
  requestIdFromParam,
  requestPath,
  requestSummary,
  requestTitle,
  type TutorRequest,
} from "../../lib/tutorRequest";
import { postTutorRequestSchema } from "../../lib/validation";

const base: TutorRequest = {
  id: "3595217f-1cf4-4493-ab03-6b8eaafd318c",
  subject: "Maths",
  city: "Indore",
  class: "10",
  board: "cbse",
  exam: null,
  mode: "home",
  details: null,
  created_at: "2026-10-02T00:00:00Z",
  expires_at: "2026-12-01T00:00:00Z",
};

describe("requestTitle / requestPath", () => {
  test("home request: subject, city, board and class", () => {
    assert.strictEqual(requestTitle(base), "Maths tutor needed in Indore for CBSE Class 10");
  });

  test("online request without a city, with an exam", () => {
    assert.strictEqual(
      requestTitle({ ...base, subject: "Physics", city: null, mode: "online", class: null, board: null, exam: "neet" }),
      "Physics tutor needed online for NEET"
    );
  });

  test("no level at all", () => {
    assert.strictEqual(requestTitle({ ...base, class: null, board: null }), "Maths tutor needed in Indore");
  });

  test("path carries a readable slug and ends with the id; the id round-trips", () => {
    const path = requestPath(base);
    assert.strictEqual(path, `/tutor-requests/maths-tutor-indore-class-10-${base.id}`);
    assert.strictEqual(requestIdFromParam(path.split("/").pop()!), base.id);
  });

  test("a wrong or stale slug still resolves to the id; garbage does not", () => {
    assert.strictEqual(requestIdFromParam(`old-slug-${base.id.toUpperCase()}`), base.id);
    assert.strictEqual(requestIdFromParam("not-an-id"), null);
    assert.strictEqual(requestIdFromParam(""), null);
  });
});

describe("containsContactInfo (public posts must not carry contact details)", () => {
  const blocked = [
    "call me on 9876543210",
    "my number is 98765 43210",
    "98765-43210",
    "+91 98765 43210",
    "(0731) 2345678",
    "mail me at parent@example.com",
    "see https://wa.me/919876543210",
    "www.mysite.in/contact",
    "mysite.com",
    "WhatsApp me",
    "find me on telegram",
    "my insta @rahul_k",
    "contact me after 5pm",
  ];
  for (const text of blocked) {
    test(`blocks: ${text}`, () => assert.ok(containsContactInfo(text), text));
  }

  const allowed = [
    "Weak in algebra, 3 evenings a week, board exams in March.",
    "Looking for a patient teacher for my son, class 9.",
    "Budget around 500 per hour, 2 hours on weekends",
    "Needs help with chapters 1 to 12 before 15 January",
    "",
  ];
  for (const text of allowed) {
    test(`allows: ${text || "(empty)"}`, () => assert.ok(!containsContactInfo(text), text));
  }
});

describe("misc helpers", () => {
  test("normalizeSubject trims, collapses spaces and capitalizes the first letter", () => {
    assert.strictEqual(normalizeSubject("  maths  "), "Maths");
    assert.strictEqual(normalizeSubject("computer   science"), "Computer science");
    assert.strictEqual(normalizeSubject("NEET physics"), "NEET physics");
  });

  test("daysLeft rounds up and never goes negative", () => {
    const now = Date.parse("2026-10-02T12:00:00Z");
    assert.strictEqual(daysLeft("2026-10-04T00:00:00Z", now), 2);
    assert.strictEqual(daysLeft("2026-10-01T00:00:00Z", now), 0);
  });

  test("summary is factual: title, mode preference, then the poster's own details", () => {
    const s = requestSummary({ ...base, mode: "both", details: "Weak in algebra." });
    assert.strictEqual(s, "Maths tutor needed in Indore for CBSE Class 10. Open to home tuition or online classes. Weak in algebra.");
  });
});

describe("postTutorRequestSchema", () => {
  const ok = { subject: "Maths", city: "Indore", cls: "10", board: "cbse", exam: "", mode: "home", details: "" };

  test("accepts what the form sends, including empty optional selects", () => {
    assert.ok(postTutorRequestSchema.safeParse(ok).success);
    assert.ok(postTutorRequestSchema.safeParse({ ...ok, cls: "", board: "", city: "", mode: "online" }).success);
  });

  test("a home or both request needs a city; online does not", () => {
    assert.ok(!postTutorRequestSchema.safeParse({ ...ok, city: "" }).success);
    assert.ok(!postTutorRequestSchema.safeParse({ ...ok, city: "A", mode: "both" }).success);
    assert.ok(postTutorRequestSchema.safeParse({ ...ok, city: null, mode: "online" }).success);
  });

  test("rejects values outside the fixed vocabulary and oversize text", () => {
    assert.ok(!postTutorRequestSchema.safeParse({ ...ok, cls: "13" }).success);
    assert.ok(!postTutorRequestSchema.safeParse({ ...ok, board: "harvard" }).success);
    assert.ok(!postTutorRequestSchema.safeParse({ ...ok, exam: "gre" }).success);
    assert.ok(!postTutorRequestSchema.safeParse({ ...ok, mode: "pigeon" }).success);
    assert.ok(!postTutorRequestSchema.safeParse({ ...ok, details: "x".repeat(501) }).success);
    assert.ok(!postTutorRequestSchema.safeParse({ ...ok, subject: "M" }).success);
  });
});
