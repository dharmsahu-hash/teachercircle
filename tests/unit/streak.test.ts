import { test, describe } from "node:test";
import assert from "node:assert";
import { applyCompletion, EMPTY_STREAK, mergeStreaks, parseStreak, playedToday, visibleStreak, type StreakState } from "../../lib/streak";

const s = (current: number, lastDate: string | null, best = current, total = current): StreakState => ({ current, best, lastDate, total });

describe("applyCompletion", () => {
  test("the first quiz starts a streak of 1", () => {
    assert.deepStrictEqual(applyCompletion(EMPTY_STREAK, "2026-10-02"), s(1, "2026-10-02"));
  });
  test("a quiz the next day extends it, and best follows", () => {
    assert.deepStrictEqual(applyCompletion(s(3, "2026-10-04", 3, 3), "2026-10-05"), { current: 4, best: 4, lastDate: "2026-10-05", total: 4 });
  });
  test("playing again the same day changes nothing", () => {
    const state = s(3, "2026-10-04");
    assert.strictEqual(applyCompletion(state, "2026-10-04"), state);
  });
  test("missing a day resets to 1 but keeps the best", () => {
    assert.deepStrictEqual(applyCompletion(s(9, "2026-10-01", 9, 9), "2026-10-03"), { current: 1, best: 9, lastDate: "2026-10-03", total: 10 });
  });
  test("works across a month and year boundary", () => {
    assert.strictEqual(applyCompletion(s(5, "2026-12-31"), "2027-01-01").current, 6);
    assert.strictEqual(applyCompletion(s(5, "2026-02-28"), "2026-03-01").current, 6);
  });
});

describe("visibleStreak / playedToday", () => {
  test("alive today or yesterday, gone after a missed day", () => {
    assert.strictEqual(visibleStreak(s(4, "2026-10-04"), "2026-10-04"), 4);
    assert.strictEqual(visibleStreak(s(4, "2026-10-04"), "2026-10-05"), 4);
    assert.strictEqual(visibleStreak(s(4, "2026-10-04"), "2026-10-06"), 0);
    assert.strictEqual(visibleStreak(EMPTY_STREAK, "2026-10-06"), 0);
  });
  test("playedToday", () => {
    assert.ok(playedToday(s(1, "2026-10-04"), "2026-10-04"));
    assert.ok(!playedToday(s(1, "2026-10-03"), "2026-10-04"));
  });
});

describe("parseStreak never trusts its input", () => {
  test("junk becomes an empty streak", () => {
    for (const bad of [null, undefined, "x", 5, [], {}]) assert.deepStrictEqual(parseStreak(bad), EMPTY_STREAK);
  });
  test("bad fields are dropped, good ones kept; best is never below current", () => {
    assert.deepStrictEqual(parseStreak({ current: 4, best: 2, lastDate: "2026-10-04", total: 9 }), s(4, "2026-10-04", 4, 9));
    assert.deepStrictEqual(parseStreak({ current: -1, best: "9", lastDate: "yesterday", total: 1.5 }), EMPTY_STREAK);
    assert.strictEqual(parseStreak({ current: 1e9 }).current, 0);
  });
});

describe("mergeStreaks (signing in on a device with a local streak)", () => {
  const today = "2026-10-10";
  test("a longer local streak wins over a shorter account streak", () => {
    const m = mergeStreaks(s(6, "2026-10-09"), s(2, "2026-10-09"), today);
    assert.strictEqual(m.current, 6);
  });
  test("a longer account streak wins over a shorter local one", () => {
    assert.strictEqual(mergeStreaks(s(2, "2026-10-09"), s(6, "2026-10-10"), today).current, 6);
  });
  test("a dead local streak never replaces a live account one", () => {
    assert.strictEqual(mergeStreaks(s(20, "2026-09-20"), s(3, "2026-10-10"), today).current, 3);
  });
  test("a live local streak replaces a dead account one; best is the maximum of both", () => {
    const m = mergeStreaks(s(4, "2026-10-10", 4), s(1, "2026-09-01", 15), today);
    assert.deepStrictEqual([m.current, m.best], [4, 15]);
  });
  test("when today was already played on the account, that date is kept", () => {
    assert.strictEqual(mergeStreaks(s(7, "2026-10-09"), s(3, "2026-10-10"), today).lastDate, "2026-10-10");
  });
});
