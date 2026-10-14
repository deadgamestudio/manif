import { describe, expect, test } from "bun:test";
import {
  SEO_MARKER,
  SITE_ORIGIN,
  escapeHtml,
  headTags,
  pageFor,
  robotsTxt,
  scriptJson,
  sitemapXml,
  withHeadTags,
  type PageMeta,
} from "./meta.ts";

const nasty = `"><script>alert('x')</script>&amp;`;

describe("escaping", () => {
  test("escapeHtml leaves no markup and no way out of a double-quoted attribute", () => {
    const out = escapeHtml(nasty);
    expect(out).not.toContain("<");
    expect(out).not.toContain(">");
    expect(out).not.toContain('"');
    expect(out).toBe(`&quot;&gt;&lt;script&gt;alert('x')&lt;/script&gt;&amp;amp;`);
  });

  test("scriptJson can't close its script tag, and parses back to the same data", () => {
    const data = { a: "</script><!--", b: "x & y > z", c: "line\u2028sep\u2029" };
    const out = scriptJson(data);
    expect(out).not.toMatch(/[<>&\u2028\u2029]/);
    expect(JSON.parse(out)).toEqual(data);
  });

  test("headTags escapes every text it writes", () => {
    const meta: PageMeta = { title: nasty, description: nasty, path: "/", image: "/og/og.png", imageAlt: nasty, noindex: false };
    const html = headTags(meta);
    expect(html).not.toContain("<script>alert");
    // The only quotes are the attributes' own: every content="..." closes where it should.
    for (const m of html.matchAll(/content="([^"]*)"/g)) expect(m[1]).not.toContain("<");
  });

  test("withHeadTags fills the marker once and refuses an index.html without one", () => {
    const html = `<head>${SEO_MARKER}</head>`;
    expect(withHeadTags(html, pageFor("/").meta)).not.toContain(SEO_MARKER);
    expect(() => withHeadTags("<head></head>", pageFor("/").meta)).toThrow();
  });
});

describe("pageFor", () => {
  test("a lobby query parameter is the invite page, anything else the home page", () => {
    expect(pageFor("/").file).toBe("index.html");
    expect(pageFor("/some/unknown/path").file).toBe("index.html");
    expect(pageFor("/?foo=1").file).toBe("index.html");
    expect(pageFor("/?lobby=abc123").file).toBe("invite.html");
    expect(pageFor("/?x=1&lobby=abc123#top").file).toBe("invite.html");
    expect(pageFor("/?lobby=abc123").meta.noindex).toBe(true);
    expect(pageFor("/").meta.noindex).toBe(false);
  });

  test("the lobby code never reaches the tags", () => {
    const code = `"><script>evil</script>`;
    const tags = headTags(pageFor(`/?lobby=${encodeURIComponent(code)}`).meta);
    expect(tags).not.toContain("evil");
  });
});

test("robots.txt allows everything and points to the sitemap, which lists the home page and the help", () => {
  expect(robotsTxt()).toContain("Allow: /");
  expect(robotsTxt()).toContain(`Sitemap: ${SITE_ORIGIN}/sitemap.xml`);
  const locs = [...sitemapXml().matchAll(/<loc>([^<]+)<\/loc>/g)].map((l) => l[1]);
  expect(locs).toEqual([`${SITE_ORIGIN}/`, `${SITE_ORIGIN}/aide`]);
});

test("/aide is the help page (#71), indexable, even with a lobby code on it", () => {
  for (const url of ["/aide", "/aide/", "/aide?lobby=abc123", "/aide#aide-points"]) {
    const page = pageFor(url);
    expect(page.file, url).toBe("aide.html");
    expect(page.meta.noindex).toBe(false);
    expect(page.meta.path).toBe("/aide");
  }
  expect(pageFor("/aide").meta.title).not.toBe(pageFor("/").meta.title);
  expect(pageFor("/aidez").file).toBe("index.html");
  const tags = headTags(pageFor("/aide?lobby=abc123").meta);
  expect(tags).toContain(`<link rel="canonical" href="${SITE_ORIGIN}/aide" />`);
  expect(tags).not.toContain("abc123");
});
