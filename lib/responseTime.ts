// Turns the raw teacher_response_time aggregate into an honest, low-precision
// signal — never a false-precision "responds in 4.2 hours" claim, and never
// shown at all on too little data (a single lucky/unlucky reply shouldn't
// read as a stable pattern).
const MIN_CONVERSATIONS = 3;

export function responseTimeLabel(
  avgResponseHours: number | null | undefined,
  repliedConversationCount: number | null | undefined
): string | null {
  if (!repliedConversationCount || repliedConversationCount < MIN_CONVERSATIONS) return null;
  if (avgResponseHours == null) return null;

  if (avgResponseHours <= 3) return "Usually replies within a few hours";
  if (avgResponseHours <= 24) return "Usually replies within a day";
  if (avgResponseHours <= 72) return "Usually replies within a few days";
  return "Usually replies within a week or so";
}
