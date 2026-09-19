// Loose, international-friendly phone validation — digits, spaces, +, -, ()
// only, and optional (this is a "how can we reach you" field, not a
// verified/OTP'd number). Same pattern checked both client- and server-side,
// same as lib/profanity.ts — the server check is the one actually trusted.
const PHONE_PATTERN = /^[0-9+\-\s()]{6,20}$/;

export function isValidPhone(phone: string | null | undefined): boolean {
  if (!phone) return true; // optional
  return PHONE_PATTERN.test(phone);
}

export function isValidFullName(name: string | null | undefined): boolean {
  return typeof name === "string" && name.trim().length > 0 && name.trim().length <= 120;
}
