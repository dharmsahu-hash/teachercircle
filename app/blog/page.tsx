import Link from "next/link";
import type { Metadata } from "next";
import { formatPostDate, getAllPosts, readingMinutes } from "@/lib/blog";
import { getAppBaseUrl } from "@/lib/url";

export const metadata: Metadata = {
  title: "Blog — tips for finding and choosing a tutor",
  description:
    "Practical guides for students, parents and tutors in India: choosing a tutor, home tuition vs coaching, and growing a tutoring practice.",
  alternates: { canonical: `${getAppBaseUrl()}/blog` },
};

export default function BlogIndexPage() {
  const posts = getAllPosts();

  return (
    <div>
      <h1>Blog</h1>
      <p className="hint" style={{ marginBottom: 20 }}>
        Practical guides for students, parents and tutors.
      </p>

      {posts.length === 0 ? (
        <p className="hint">No articles yet — check back soon.</p>
      ) : (
        <div className="blog-list">
          {posts.map((p) => (
            <article key={p.slug} className="card blog-card">
              <h2 style={{ marginTop: 0 }}>
                <Link href={`/blog/${p.slug}`}>{p.title}</Link>
              </h2>
              <p className="hint" style={{ margin: "4px 0 8px" }}>
                {formatPostDate(p.date)} · {readingMinutes(p.body)} min read
              </p>
              <p style={{ margin: 0 }}>{p.description}</p>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
