// Basic content moderation for free-text feedback (review comments). This is
// a curated word-list match, not a machine-learning classifier — it catches
// plain, common abusive language but is bypassable via creative spelling.
// That tradeoff is deliberate: a false-positive here blocks someone's
// legitimate feedback outright, so the list stays conservative and obvious
// rather than aggressive. Revisit if abuse in the wild turns out worse than
// this catches.
const BLOCKED_WORDS = [
  // English profanity/slurs (common, unambiguous)
  "fuck", "shit", "bitch", "bastard", "asshole", "dumbass", "motherfucker",
  "cunt", "whore", "slut", "nigger", "faggot", "retard",
  // Hinglish/Hindi profanity commonly seen in Indian user-generated text,
  // transliterated (the actual audience for this app)
  "chutiya", "madarchod", "bhenchod", "behenchod", "bhosdike", "randi",
  "gandu", "harami", "saala kutta", "kutte",
] as const;

// Matches a blocked word as a whole word (word-boundary), case-insensitive,
// tolerating repeated letters some users insert to dodge naive filters
// (e.g. "fuuuck") — collapsed to a single letter before matching.
function normalize(text: string): string {
  return text.toLowerCase().replace(/(.)\1{2,}/g, "$1");
}

export function containsAbusiveLanguage(text: string): boolean {
  if (!text) return false;
  const normalized = normalize(text);
  return BLOCKED_WORDS.some((word) => {
    const pattern = new RegExp(`\\b${word.replace(/\s+/g, "\\s+")}\\b`, "i");
    return pattern.test(normalized);
  });
}

export const ABUSIVE_LANGUAGE_ERROR =
  "Please keep your feedback respectful — remove any inappropriate language and try again.";
