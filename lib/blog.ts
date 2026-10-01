// Blog / content pages (growth item G6, docs/07-growth-review-2026-09-20.md).
//
// Articles live in content/blog/ as TypeScript modules exporting a BlogPost
// whose body is Markdown, and are registered in content/blog/index.ts. They
// are imported, not read from disk, so they are bundled into the build on
// Vercel and in the Docker standalone image with no file-tracing config.
//
// The Markdown renderer below is deliberately tiny and escape-first: every
// character of the source is HTML-escaped before any formatting is applied,
// and links only allow http(s) and site-relative URLs. Articles are written
// by the site owner, but that is no reason to render raw HTML.

// Relative and explicit ("/index"), not "@/content/blog": the unit tests run
// under plain Node, which knows neither the tsconfig alias nor directory imports.
import { posts } from "../content/blog/index";

export type BlogPost = {
  slug: string; // lowercase-hyphenated, becomes /blog/<slug>
  title: string;
  description: string; // meta description, keep under ~160 characters
  date: string; // YYYY-MM-DD, first published
  updated?: string; // YYYY-MM-DD
  // Internal links shown under the article: directory pages, search, etc.
  related?: { label: string; href: string }[];
  body: string; // Markdown
};

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function getAllPosts(): BlogPost[] {
  return [...posts].sort((a, b) => b.date.localeCompare(a.date));
}

export function getPost(slug: string): BlogPost | null {
  if (!SLUG_PATTERN.test(slug)) return null;
  return posts.find((p) => p.slug === slug) ?? null;
}

export function formatPostDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeHref(url: string): string | null {
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith("/") && !url.startsWith("//")) return url;
  return null;
}

// Inline formatting on an already-escaped line: links, **bold**, *italic*.
function inline(escaped: string): string {
  return escaped
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (match, text: string, url: string) => {
      // url is escaped too; undo &amp; so query strings survive, then re-escape for the attribute.
      const href = safeHref(url.replace(/&amp;/g, "&"));
      if (!href) return text;
      const external = /^https?:\/\//i.test(href);
      return `<a href="${escapeHtml(href)}"${external ? ' rel="noopener noreferrer" target="_blank"' : ""}>${text}</a>`;
    })
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>");
}

// Supports: #/##/### headings, paragraphs, "- " bullet lists, "1. " numbered
// lists, "> " quotes, links, bold, italic. Anything else renders as text.
export function renderMarkdown(md: string): string {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let para: string[] = [];
  let list: { tag: "ul" | "ol"; items: string[] } | null = null;
  let quote: string[] = [];

  const flushPara = () => {
    if (para.length) out.push(`<p>${inline(escapeHtml(para.join(" ")))}</p>`);
    para = [];
  };
  const flushList = () => {
    if (list) out.push(`<${list.tag}>${list.items.map((i) => `<li>${inline(escapeHtml(i))}</li>`).join("")}</${list.tag}>`);
    list = null;
  };
  const flushQuote = () => {
    if (quote.length) out.push(`<blockquote><p>${inline(escapeHtml(quote.join(" ")))}</p></blockquote>`);
    quote = [];
  };
  const flushAll = () => {
    flushPara();
    flushList();
    flushQuote();
  };

  for (const raw of lines) {
    const line = raw.trim();
    let m: RegExpMatchArray | null;
    if (!line) {
      flushAll();
    } else if ((m = line.match(/^(#{1,3})\s+(.*)$/))) {
      flushAll();
      // Article titles are the page's h1, so Markdown headings start at h2.
      const level = Math.min(m[1].length + 1, 4);
      out.push(`<h${level}>${inline(escapeHtml(m[2]))}</h${level}>`);
    } else if ((m = line.match(/^[-*]\s+(.*)$/))) {
      flushPara();
      flushQuote();
      if (list?.tag !== "ul") {
        flushList();
        list = { tag: "ul", items: [] };
      }
      list.items.push(m[1]);
    } else if ((m = line.match(/^\d+[.)]\s+(.*)$/))) {
      flushPara();
      flushQuote();
      if (list?.tag !== "ol") {
        flushList();
        list = { tag: "ol", items: [] };
      }
      list.items.push(m[1]);
    } else if ((m = line.match(/^>\s?(.*)$/))) {
      flushPara();
      flushList();
      quote.push(m[1]);
    } else {
      flushList();
      flushQuote();
      para.push(line);
    }
  }
  flushAll();
  return out.join("\n");
}

// A rough reading time for the article header (about 200 words a minute).
export function readingMinutes(md: string): number {
  const words = md.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}
