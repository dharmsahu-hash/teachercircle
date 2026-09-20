import type { MetadataRoute } from "next";
import { getAppBaseUrl } from "@/lib/url";
import { pg } from "@/lib/db";
import { getDirectory } from "@/lib/directory";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = getAppBaseUrl();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: base, changeFrequency: "daily", priority: 1 },
    { url: `${base}/search`, changeFrequency: "daily", priority: 0.9 },
    { url: `${base}/tutors`, changeFrequency: "daily", priority: 0.8 },
    { url: `${base}/about`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${base}/login`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${base}/privacy`, changeFrequency: "yearly", priority: 0.1 },
  ];

  // Only listed, non-deleted teachers are public pages worth indexing —
  // teacher_public's own definition already filters to exactly that set.
  const teachers = (await pg(`/teacher_public?select=user_id`).catch(() => [])) as
    | { user_id: string }[]
    | null;

  const teacherRoutes: MetadataRoute.Sitemap = (teachers ?? []).map((t) => ({
    url: `${base}/teacher/${t.user_id}`,
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  // G1 (docs/07-growth-review-2026-09-20.md): city and city+subject landing
  // pages, but only for combinations with >= 1 real teacher — getDirectory()
  // itself only ever derives a city/pair from a real listing, so nothing
  // here needs a separate thin-content check.
  const { cities, pairs } = await getDirectory();
  const cityRoutes: MetadataRoute.Sitemap = [...cities.keys()].map((slug) => ({
    url: `${base}/tutors/${slug}`,
    changeFrequency: "weekly",
    priority: 0.6,
  }));
  const citySubjectRoutes: MetadataRoute.Sitemap = [...pairs].map((pair) => ({
    url: `${base}/tutors/${pair}`,
    changeFrequency: "weekly",
    priority: 0.6,
  }));

  return [...staticRoutes, ...teacherRoutes, ...cityRoutes, ...citySubjectRoutes];
}
