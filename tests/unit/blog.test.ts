import { test, describe } from "node:test";
import assert from "node:assert";
import { getAllPosts, getPost, renderMarkdown, readingMinutes, SLUG_PATTERN } from "../../lib/blog";

describe("renderMarkdown", () => {
  test("headings start at h2 (the article title is the page's h1)", () => {
    assert.strictEqual(renderMarkdown("# Top\n## Sub"), "<h2>Top</h2>\n<h3>Sub</h3>");
  });

  test("paragraphs join wrapped lines and split on blank lines", () => {
    assert.strictEqual(renderMarkdown("one\ntwo\n\nthree"), "<p>one two</p>\n<p>three</p>");
  });

  test("bullet and numbered lists", () => {
    assert.strictEqual(renderMarkdown("- a\n- b"), "<ul><li>a</li><li>b</li></ul>");
    assert.strictEqual(renderMarkdown("1. a\n2. b"), "<ol><li>a</li><li>b</li></ol>");
  });

  test("bold, italic and quotes", () => {
    assert.strictEqual(renderMarkdown("**bold** and *it*"), "<p><strong>bold</strong> and <em>it</em></p>");
    assert.strictEqual(renderMarkdown("> wise"), "<blockquote><p>wise</p></blockquote>");
  });

  test("site-relative and https links are kept; external ones open safely", () => {
    assert.strictEqual(renderMarkdown("[Tutors](/tutors)"), '<p><a href="/tutors">Tutors</a></p>');
    assert.match(renderMarkdown("[x](https://example.com)"), /href="https:\/\/example.com" rel="noopener noreferrer" target="_blank"/);
  });

  test("query strings in links survive escaping", () => {
    assert.strictEqual(renderMarkdown("[M](/search?subject=Maths&city=Pune)"), '<p><a href="/search?subject=Maths&amp;city=Pune">M</a></p>');
  });

  test("SECURITY: raw HTML in the source is escaped, never rendered", () => {
    const html = renderMarkdown('<script>alert(1)</script> <img src=x onerror="alert(1)">');
    assert.doesNotMatch(html, /<script|<img/);
    assert.match(html, /&lt;script&gt;/);
  });

  test("SECURITY: javascript: and protocol-relative links are dropped to plain text", () => {
    assert.strictEqual(renderMarkdown("[click](javascript:alert`1`)"), "<p>click</p>");
    assert.doesNotMatch(renderMarkdown("[click](javascript:alert(1))"), /href/);
    assert.strictEqual(renderMarkdown("[x](//evil.example)"), "<p>x</p>");
  });

  test("SECURITY: a quote in a link URL cannot break out of the href attribute", () => {
    const html = renderMarkdown('[x](/a"onmouseover="alert(1))');
    assert.doesNotMatch(html, /" onmouseover=|"onmouseover="/);
  });
});

describe("published posts", () => {
  const posts = getAllPosts();

  test("there is at least one post, sorted newest first", () => {
    assert.ok(posts.length > 0);
    for (let i = 1; i < posts.length; i++) assert.ok(posts[i - 1].date >= posts[i].date);
  });

  test("every post has a valid, unique slug, a real date and a search-friendly description", () => {
    const slugs = new Set<string>();
    for (const p of posts) {
      assert.match(p.slug, SLUG_PATTERN, p.slug);
      assert.ok(!slugs.has(p.slug), `duplicate slug ${p.slug}`);
      slugs.add(p.slug);
      assert.match(p.date, /^\d{4}-\d{2}-\d{2}$/, `${p.slug} date`);
      assert.ok(!Number.isNaN(Date.parse(p.date)), `${p.slug} date parses`);
      assert.ok(p.title.length > 0 && p.title.length <= 70, `${p.slug} title length ${p.title.length}`);
      assert.ok(p.description.length >= 50 && p.description.length <= 160, `${p.slug} description length ${p.description.length}`);
      assert.ok(readingMinutes(p.body) >= 2, `${p.slug} looks too short to publish`);
    }
  });

  test("internal links in posts point at real site sections or other posts", () => {
    const known = /^\/(tutors|search|login|blog\/[a-z0-9-]+|blog|about)(\b|\/|\?|$)/;
    for (const p of posts) {
      const hrefs = [...p.body.matchAll(/\]\((\/[^)\s]*)\)/g)].map((m) => m[1]).concat((p.related ?? []).map((r) => r.href));
      for (const href of hrefs) {
        assert.match(href, known, `${p.slug} links to ${href}`);
        const blogSlug = href.match(/^\/blog\/([a-z0-9-]+)/)?.[1];
        if (blogSlug) assert.ok(getPost(blogSlug), `${p.slug} links to missing post ${blogSlug}`);
      }
    }
  });

  test("getPost rejects anything that is not a plain slug", () => {
    assert.strictEqual(getPost("../etc/passwd"), null);
    assert.strictEqual(getPost("does-not-exist"), null);
  });
});
