import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { formatPostDate, getAllPosts, getPost, readingMinutes, renderMarkdown } from "@/lib/blog";
import { getAppBaseUrl } from "@/lib/url";

// Articles are bundled at build time; an unknown slug is a 404, never a
// render attempt.
export const dynamicParams = false;

export function generateStaticParams() {
  return getAllPosts().map((p) => ({ slug: p.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const post = getPost(params.slug);
  if (!post) return { title: "Article not found" };
  const url = `${getAppBaseUrl()}/blog/${post.slug}`;
  return {
    title: post.title,
    description: post.description,
    alternates: { canonical: url },
    openGraph: {
      type: "article",
      title: post.title,
      description: post.description,
      url,
      publishedTime: post.date,
      modifiedTime: post.updated ?? post.date,
    },
  };
}

export default function BlogPostPage({ params }: { params: { slug: string } }) {
  const post = getPost(params.slug);
  if (!post) notFound();

  const url = `${getAppBaseUrl()}/blog/${post.slug}`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.description,
    datePublished: post.date,
    dateModified: post.updated ?? post.date,
    mainEntityOfPage: url,
    author: { "@type": "Organization", name: "TeacherCircle" },
    publisher: { "@type": "Organization", name: "TeacherCircle" },
  };

  return (
    <article className="blog-article">
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <p className="hint" style={{ marginBottom: 4 }}>
        <Link href="/blog">← All articles</Link>
      </p>
      <h1 style={{ marginBottom: 4 }}>{post.title}</h1>
      <p className="hint" style={{ marginTop: 0 }}>
        {formatPostDate(post.date)}
        {post.updated && post.updated !== post.date && ` · Updated ${formatPostDate(post.updated)}`} ·{" "}
        {readingMinutes(post.body)} min read
      </p>

      {/* renderMarkdown escapes all source text first; see lib/blog.ts. */}
      <div className="blog-body" dangerouslySetInnerHTML={{ __html: renderMarkdown(post.body) }} />

      {post.related && post.related.length > 0 && (
        <div className="card" style={{ marginTop: 24 }}>
          <p className="footer-heading" style={{ marginTop: 0 }}>Find a teacher</p>
          <div className="pills">
            {post.related.map((r) => (
              <Link key={r.href} href={r.href} className="pill pill-link">
                {r.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </article>
  );
}
