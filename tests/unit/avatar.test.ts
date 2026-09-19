import { test, describe } from "node:test";
import assert from "node:assert";
import {
  AVATAR_PRESET_SEEDS,
  isValidAvatarSeed,
  avatarDataUri,
  avatarPresets,
} from "../../lib/avatar";

describe("isValidAvatarSeed", () => {
  test("accepts every curated preset", () => {
    for (const seed of AVATAR_PRESET_SEEDS) assert.strictEqual(isValidAvatarSeed(seed), true);
  });

  test("rejects empty string", () => {
    assert.strictEqual(isValidAvatarSeed(""), false);
  });

  test("rejects a string over 40 chars", () => {
    assert.strictEqual(isValidAvatarSeed("a".repeat(41)), false);
  });

  test("rejects characters outside [a-zA-Z0-9_-] (e.g. an attempted SVG/script payload)", () => {
    assert.strictEqual(isValidAvatarSeed("<script>alert(1)</script>"), false);
  });
});

describe("avatarDataUri", () => {
  test("returns a data: URI", () => {
    const uri = avatarDataUri("sunny");
    assert.match(uri, /^data:image\/svg\+xml/);
  });

  test("is deterministic for the same seed", () => {
    assert.strictEqual(avatarDataUri("sunny"), avatarDataUri("sunny"));
  });

  test("differs across seeds", () => {
    assert.notStrictEqual(avatarDataUri("sunny"), avatarDataUri("comet"));
  });
});

describe("avatarPresets", () => {
  test("returns one entry per curated seed, each with a data URI", () => {
    const presets = avatarPresets();
    assert.strictEqual(presets.length, AVATAR_PRESET_SEEDS.length);
    for (const p of presets) {
      assert.ok(AVATAR_PRESET_SEEDS.includes(p.seed as any));
      assert.match(p.dataUri, /^data:image\/svg\+xml/);
    }
  });
});
