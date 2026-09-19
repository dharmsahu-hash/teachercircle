// Server-side password strength check (P3) — the client can be bypassed by
// anyone calling the API directly, so this is the one that actually matters.
// Deliberately simple, length + character-variety based (NIST 800-63B style)
// rather than a fragile regex "must contain a symbol" rule — those push
// people toward predictable substitutions (Password1! ) without adding real
// entropy.
export function passwordStrengthError(password: string): string | null {
  if (password.length < 8) return "Password must be at least 8 characters.";
  if (password.length > 128) return "Password is too long.";

  const varietyCount = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/].filter((re) => re.test(password)).length;
  if (varietyCount < 2) {
    return "Password is too weak — mix in at least two of: lowercase, uppercase, numbers, or symbols.";
  }

  return null;
}
