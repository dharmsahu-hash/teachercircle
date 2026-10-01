// A short, factual paragraph about the real listings on a directory page
// (growth idea #6): how many teachers, the usual hourly rate, feedback, and
// what is taught. Built only from the listings already on the page, so each
// city / city+subject page gets its own text instead of the same template —
// that unique, accurate summary is what lets those pages rank.
//
// Pure (no database access) so it can be unit tested directly.

export type SummaryTeacher = {
  rate_per_hour: number | null;
  review_count: number;
  avg_rating: number;
  subjects: string[] | null;
  teaching_mode?: string | null;
};

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

// Linear-interpolated percentile on a sorted array.
function percentile(sorted: number[], p: number): number {
  const i = (sorted.length - 1) * p;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

function listJoin(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

export function summarizeListings(
  teachers: SummaryTeacher[],
  { place, subject, onlineOnly = false }: { place: string; subject?: string; onlineOnly?: boolean }
): string[] {
  const n = teachers.length;
  if (n === 0) return [];
  const what = subject ? `${subject} teacher${n === 1 ? "" : "s"}` : `teacher${n === 1 ? "" : "s"}`;
  const sentences: string[] = [
    onlineOnly
      ? `${n === 1 ? "There is" : "There are"} ${n} ${what} teaching ${place}.`
      : `${n === 1 ? "There is" : "There are"} ${n} ${what} listed in ${place}.`,
  ];

  // Rates: ignore missing or zero (zero means "not stated" in practice).
  const rates = teachers
    .map((t) => Number(t.rate_per_hour))
    .filter((r) => Number.isFinite(r) && r > 0)
    .sort((a, b) => a - b);
  if (rates.length === 1) {
    sentences.push(`The listed hourly rate is ${inr(rates[0])}.`);
  } else if (rates.length >= 2) {
    const median = percentile(rates, 0.5);
    if (rates.length >= 4) {
      const low = percentile(rates, 0.25);
      const high = percentile(rates, 0.75);
      sentences.push(
        low === high
          ? `The usual hourly rate is ${inr(median)}.`
          : `The usual hourly rate is ${inr(median)}, and most charge between ${inr(low)} and ${inr(high)}.`
      );
    } else {
      sentences.push(
        rates[0] === rates[rates.length - 1]
          ? `The usual hourly rate is ${inr(median)}.`
          : `Hourly rates range from ${inr(rates[0])} to ${inr(rates[rates.length - 1])}, usually around ${inr(median)}.`
      );
    }
  }

  // Feedback: only teachers who actually have some.
  const rated = teachers.filter((t) => t.review_count > 0);
  if (rated.length > 0) {
    const totalReviews = rated.reduce((s, t) => s + t.review_count, 0);
    const weighted = rated.reduce((s, t) => s + Number(t.avg_rating) * t.review_count, 0) / totalReviews;
    sentences.push(
      `${rated.length === n ? (n === 1 ? "This teacher has" : "All of them have") : `${rated.length} of them ${rated.length === 1 ? "has" : "have"}`} feedback from students and parents, averaging ${weighted.toFixed(1)} out of 5.`
    );
  }

  // Growth #2: who also teaches online (pointless on the online pages).
  if (!onlineOnly) {
    const online = teachers.filter((t) => t.teaching_mode === "online" || t.teaching_mode === "both").length;
    if (online > 0) {
      sentences.push(
        online === n
          ? n === 1 ? "This teacher also teaches online." : "All of them also teach online."
          : `${online} of them also ${online === 1 ? "teaches" : "teach"} online.`
      );
    }
  }

  // Most-taught subjects (city pages only; a subject page already says it).
  if (!subject) {
    const counts = new Map<string, { name: string; count: number }>();
    for (const t of teachers) {
      for (const s of t.subjects ?? []) {
        const key = s.trim().toLowerCase();
        if (!key) continue;
        const entry = counts.get(key) ?? { name: s.trim(), count: 0 };
        entry.count++;
        counts.set(key, entry);
      }
    }
    const top = [...counts.values()]
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
      .slice(0, 3)
      .map((e) => e.name);
    if (top.length > 0) {
      sentences.push(`The most taught ${top.length === 1 ? "subject is" : "subjects are"} ${listJoin(top)}.`);
    }
  }

  return sentences;
}
