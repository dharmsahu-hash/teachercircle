import type { MetadataRoute } from "next";
import { getAppBaseUrl } from "@/lib/url";
import { pg } from "@/lib/db";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = getAppBaseUrl();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: base, changeFrequency: "daily", priority: 1 },
    { url: `${base}/search`, changeFrequency: "daily", priority: 0.9 },
    { url: `${base}/about`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${base}/login`, changeFrequency: "monthly", priority: 0.3 },
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

  return [...staticRoutes, ...teacherRoutes];
}
