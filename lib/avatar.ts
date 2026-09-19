// Free, self-hosted avatar generation — no upload, no S3/MinIO, no external
// network call. dicebear renders a deterministic SVG from a seed string
// entirely in-process, so it costs nothing to run and nothing to store: we
// keep only the short seed in Postgres and regenerate the image on demand.
import { createAvatar } from "@dicebear/core";
import { funEmoji } from "@dicebear/collection";

// A small curated set so the picker UI has a fixed, friendly grid instead of
// letting users type an arbitrary seed. Each is just a label for the seed
// string dicebear hashes into an image — the words have no other meaning.
export const AVATAR_PRESET_SEEDS = [
  "sunny",
  "breeze",
  "comet",
  "maple",
  "willow",
  "orbit",
  "clover",
  "ember",
] as const;

export type AvatarPresetSeed = (typeof AVATAR_PRESET_SEEDS)[number];

// Same allow-list shape enforced again in db/migrations/0012_avatar_seed.sql
// (format/length check in the SECURITY DEFINER function) — defense in depth,
// not just a UI nicety, since the API route accepts a raw string.
export const AVATAR_SEED_PATTERN = /^[a-zA-Z0-9_-]{1,40}$/;

export function isValidAvatarSeed(seed: string): boolean {
  return AVATAR_SEED_PATTERN.test(seed);
}

export function avatarDataUri(seed: string, size = 64): string {
  return createAvatar(funEmoji, { seed, size }).toDataUri();
}

export function avatarPresets(size = 64): { seed: string; dataUri: string }[] {
  return AVATAR_PRESET_SEEDS.map((seed) => ({ seed, dataUri: avatarDataUri(seed, size) }));
}
