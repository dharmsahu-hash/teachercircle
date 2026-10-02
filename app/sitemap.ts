import type { MetadataRoute } from "next";
import { getAppBaseUrl } from "@/lib/url";
import { getDirectory, getListedTeacherIds } from "@/lib/directory";
import { getAllPosts } from "@/lib/blog";
import { listOpenRequests } from "@/lib/tutorRequestData";
import { requestPath } from "@/lib/tutorRequest";

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
  // (Shared cached read: lib/cache.ts.)
  const teacherIds = await getListedTeacherIds();

  const teacherRoutes: MetadataRoute.Sitemap = teacherIds.map((id) => ({
    url: `${base}/teacher/${id}`,
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  // G1 (docs/07-growth-review-2026-09-20.md): city and city+subject landing
  // pages, but only for combinations with >= 1 real teacher — getDirectory()
  // itself only ever derives a city/pair from a real listing, so nothing
  // here needs a separate thin-content check.
  const { cities, pairs, onlineSubjects, examSubjects, cityClassPages } = await getDirectory();
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

  // Growth #2 / #3 pages, same rule: only where a real teacher matches.
  const weekly = (path: string, priority = 0.6): MetadataRoute.Sitemap[number] => ({
    url: `${base}${path}`,
    changeFrequency: "weekly",
    priority,
  });
  const levelRoutes: MetadataRoute.Sitemap = [
    ...(onlineSubjects.size > 0 ? [weekly("/tutors/online", 0.7)] : []),
    ...[...onlineSubjects.keys()].map((s) => weekly(`/tutors/online/${s}`)),
    ...[...examSubjects.entries()].flatMap(([exam, subjects]) => [
      weekly(`/tutors/exam/${exam}`),
      ...[...subjects.keys()].map((s) => weekly(`/tutors/exam/${exam}/${s}`)),
    ]),
    ...[...cityClassPages].map((p) => weekly(`/tutors/${p}`, 0.5)),
  ];

  // G6: the blog index and every article.
  const blogRoutes: MetadataRoute.Sitemap = [
    { url: `${base}/blog`, changeFrequency: "weekly", priority: 0.5 },
    ...getAllPosts().map((p) => ({
      url: `${base}/blog/${p.slug}`,
      lastModified: p.updated ?? p.date,
      changeFrequency: "monthly" as const,
      priority: 0.5,
    })),
  ];

  // Growth #1: open tutor requests (expired and closed ones are not in the view).
  // Empty, not an error, if migration 0028 has not been applied yet.
  const { rows: openRequests } = await listOpenRequests({ limit: 200 }).catch(() => ({ rows: [] as never[] }));
  const requestRoutes: MetadataRoute.Sitemap = [
    { url: `${base}/tutor-requests`, changeFrequency: "daily", priority: 0.6 },
    ...openRequests.map((r) => ({ url: `${base}${requestPath(r)}`, lastModified: r.created_at, changeFrequency: "weekly" as const, priority: 0.5 })),
  ];

  return [...staticRoutes, ...teacherRoutes, ...cityRoutes, ...citySubjectRoutes, ...levelRoutes, ...requestRoutes, ...blogRoutes];
}
