import { test, describe } from "node:test";
import assert from "node:assert";
import { summarizeListings } from "../../lib/listingSummary";
import { inquiryMessage, toWhatsAppNumber, whatsAppChatLink } from "../../lib/whatsapp";

const t = (rate: number | null, reviews = 0, rating = 0, subjects: string[] = ["Maths"]) => ({
  rate_per_hour: rate,
  review_count: reviews,
  avg_rating: rating,
  subjects,
});

describe("summarizeListings (growth #6)", () => {
  test("empty input gives no text", () => {
    assert.deepStrictEqual(summarizeListings([], { place: "Pune" }), []);
  });

  test("one teacher: singular wording, their own rate", () => {
    const s = summarizeListings([t(500, 2, 4.5, ["Physics"])], { place: "Indore" });
    assert.strictEqual(s[0], "There is 1 teacher listed in Indore.");
    assert.strictEqual(s[1], "The listed hourly rate is ₹500.");
    assert.strictEqual(s[2], "This teacher has feedback from students and parents, averaging 4.5 out of 5.");
    assert.strictEqual(s[3], "The most taught subject is Physics.");
  });

  test("2-3 teachers: full range and median", () => {
    const s = summarizeListings([t(400), t(600), t(750)], { place: "Pune", subject: "Maths" });
    assert.strictEqual(s[0], "There are 3 Maths teachers listed in Pune.");
    assert.strictEqual(s[1], "Hourly rates range from ₹400 to ₹750, usually around ₹600.");
  });

  test("4+ teachers: median and middle-half range; missing and zero rates ignored", () => {
    const s = summarizeListings([t(300), t(400), t(500), t(600), t(1200), t(null), t(0)], { place: "Delhi" });
    assert.strictEqual(s[1], "The usual hourly rate is ₹500, and most charge between ₹400 and ₹600.");
  });

  test("feedback is review-weighted and counts only teachers who have some", () => {
    const s = summarizeListings([t(500, 1, 5), t(500, 3, 4), t(500)], { place: "Pune" });
    assert.strictEqual(s[2], "2 of them have feedback from students and parents, averaging 4.3 out of 5.");
  });

  test("top three subjects, most common first, case-insensitive", () => {
    const s = summarizeListings(
      [t(1, 0, 0, ["Maths", "Physics"]), t(1, 0, 0, ["maths", "English"]), t(1, 0, 0, ["Physics", "Chemistry"])],
      { place: "Pune" }
    );
    assert.strictEqual(s.at(-1), "The most taught subjects are Maths, Physics and Chemistry.");
  });

  test("different cities produce different text (the point of the feature)", () => {
    const a = summarizeListings([t(400), t(500)], { place: "Pune" }).join(" ");
    const b = summarizeListings([t(800), t(900), t(950)], { place: "Mumbai" }).join(" ");
    assert.notStrictEqual(a, b);
  });
});

describe("WhatsApp inquiry (growth #4)", () => {
  test("normalizes common Indian formats to 91XXXXXXXXXX", () => {
    assert.strictEqual(toWhatsAppNumber("+91 98765 43210"), "919876543210");
    assert.strictEqual(toWhatsAppNumber("098765-43210"), "919876543210");
    assert.strictEqual(toWhatsAppNumber("9876543210"), "919876543210");
  });

  test("returns null for missing, landline-looking or malformed numbers", () => {
    assert.strictEqual(toWhatsAppNumber(null), null);
    assert.strictEqual(toWhatsAppNumber(""), null);
    assert.strictEqual(toWhatsAppNumber("12345"), null);
    assert.strictEqual(toWhatsAppNumber("0512 2345678"), null); // starts with 5 after the 0: not a mobile
  });

  test("builds a wa.me chat link with the pre-filled inquiry", () => {
    const link = whatsAppChatLink("9876543210", inquiryMessage("Meera Rao", ["Maths", "Physics"]));
    assert.ok(link);
    const url = new URL(link!);
    assert.strictEqual(url.origin + url.pathname, "https://wa.me/919876543210");
    assert.match(url.searchParams.get("text")!, /^Hi Meera, I found you on TeacherCircle\. I'm looking for Maths tuition\./);
  });

  test("no link at all when the number is unusable", () => {
    assert.strictEqual(whatsAppChatLink("not a number", "hi"), null);
  });
});
